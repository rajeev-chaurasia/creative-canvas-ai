import logging
import socketio
from jose import jwt, JWTError
from app.routers.auth import SECRET_KEY, ALGORITHM
from app.permissions import get_user_role, can_edit
from app.database import SessionLocal

# Logger
logger = logging.getLogger(__name__)

# Create a Socket.IO server
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*'
)

# Store connected users: {sid: {user_id, email, name, project_uuid, role}}
connected_users = {}

# Socket.IO event handlers
@sio.event
async def connect(sid, environ, auth):
    """Authenticate user on WebSocket connection"""
    try:
        # Get token from auth
        token = auth.get('token') if auth else None
        
        if not token:
            logger.warning('Client %s connection rejected: No token', sid)
            return False  # Reject connection
        
        # Verify JWT token
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_email = payload.get("sub")
            user_id = payload.get("user_id")
            
            logger.debug('Token payload: sub=%s, user_id=%s', user_email, user_id)
            
            if not user_email or not user_id:
                logger.warning('Client %s connection rejected: Invalid token payload', sid)
                logger.debug('Missing: user_email=%s, user_id=%s', user_email, user_id)
                logger.warning('User action required: %s needs to log out and log back in to refresh token', user_email)
                return False
            
            # Store user info
            connected_users[sid] = {
                'user_id': user_id,
                'email': user_email,
                'name': user_email.split('@')[0],  # Extract name from email
                'color': _generate_user_color(user_id)  # Assign consistent color
            }
            
            logger.info('Client %s connected as %s (ID: %s)', sid, user_email, user_id)
            return True
            
        except JWTError as e:
            logger.warning('Client %s connection rejected: Invalid token - %s', sid, e)
            return False
            
    except Exception as e:
        logger.error('Client %s connection error: %s', sid, e)
        return False

@sio.event
async def disconnect(sid):
    """Handle user disconnection"""
    user_info = connected_users.pop(sid, None)
    if user_info:
        logger.info('Client %s disconnected (%s)', sid, user_info['email'])
    else:
        logger.info('Client %s disconnected', sid)

def _generate_user_color(user_id: int) -> str:
    """Generate a consistent color for each user based on their ID"""
    colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
        '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B195', '#C06C84'
    ]
    return colors[user_id % len(colors)]

@sio.event
async def join_project(sid, data):
    """User joins a project room with permission check"""
    project_uuid = data.get('projectUuid')  # Changed from projectId to projectUuid
    user_info = connected_users.get(sid)
    
    logger.debug('join_project called - sid: %s, projectUuid: %s', sid, project_uuid)
    logger.debug('user_info: %s', user_info)
    
    if not user_info:
        logger.warning('Client %s tried to join project but not authenticated', sid)
        await sio.emit('error', {
            'message': 'Not authenticated'
        }, to=sid)
        return
    
    # CHECK PERMISSION - Can user access this project?
    db = SessionLocal()
    try:
        role = await get_user_role(project_uuid, user_info['user_id'], db)

        logger.debug('Role check result for %s: %s', user_info['email'], role)

        if not role:
            logger.warning('%s denied access to project %s', user_info['email'], project_uuid)
            await sio.emit('error', {
                'message': 'You do not have permission to access this project'
            }, to=sid)
            return
        
        # User has access - store role and project_uuid
        user_info['project_uuid'] = project_uuid
        user_info['role'] = role.value
        
        await sio.enter_room(sid, f'project-{project_uuid}')

        logger.info('%s joined project %s as %s', user_info['email'], project_uuid, role.value)

        # Notify other users in the room
        await sio.emit('user_joined', {
            'userId': user_info['user_id'],
            'name': user_info['name'],
            'email': user_info['email'],
            'color': user_info['color'],
            'role': role.value
        }, room=f'project-{project_uuid}', skip_sid=sid)
        
        # Send list of current users to the newly joined user
        current_users = []
        for other_sid, other_user in connected_users.items():
            if other_sid != sid and other_user.get('project_uuid') == project_uuid:
                current_users.append({
                    'userId': other_user['user_id'],
                    'name': other_user['name'],
                    'email': other_user['email'],
                    'color': other_user['color'],
                    'role': other_user.get('role', 'viewer')
                })
        
        if current_users:
            await sio.emit('current_users', {'users': current_users}, to=sid)
    
    finally:
        db.close()

@sio.event
async def leave_project(sid, data):
    """User leaves a project room"""
    project_uuid = data.get('projectUuid')  # Changed from projectId to projectUuid
    user_info = connected_users.get(sid)
    
    if user_info:
        logger.info('%s left project %s', user_info['email'], project_uuid)
        
        # Notify other users
        await sio.emit('user_left', {
            'userId': user_info['user_id'],
            'name': user_info['name']
        }, room=f'project-{project_uuid}', skip_sid=sid)
        
        # Remove project from user info
        user_info.pop('project_uuid', None)
        user_info.pop('role', None)
    
    await sio.leave_room(sid, f'project-{project_uuid}')

@sio.event
async def canvas_update(sid, data):
    """Handle canvas updates and broadcast to other clients (requires edit permission)"""
    project_uuid = data.get('projectUuid')  # Changed from projectId to projectUuid
    canvas_data = data.get('data')
    user_info = connected_users.get(sid)
    
    logger.debug('canvas_update received - sid: %s, projectUuid: %s', sid, project_uuid)
    logger.debug('canvas_data: %s', canvas_data)
    
    if not user_info:
        logger.warning('No user_info for sid: %s', sid)
        return
    
    # CHECK PERMISSION - Can user edit?
    user_role = user_info.get('role')
    if user_role not in ['owner', 'editor']:
        logger.warning('%s denied canvas_update (role: %s)', user_info['email'], user_role)
        await sio.emit('error', {
            'message': 'You do not have permission to edit this project'
        }, to=sid)
        return
    
    logger.debug('Broadcasting canvas_update from %s to room: project-%s', user_info['email'], project_uuid)
    
    # Broadcast to all clients in the project room except the sender
    await sio.emit('canvas_update', canvas_data, room=f'project-{project_uuid}', skip_sid=sid)
    logger.debug('Broadcasted canvas_update successfully')

@sio.event
async def cursor_move(sid, data):
    """Handle cursor movement and broadcast to other clients"""
    project_uuid = data.get('projectUuid')  # Changed from projectId to projectUuid
    cursor_data = data.get('data')
    user_info = connected_users.get(sid)
    
    if not user_info:
        return
    
    # Add authenticated user info to cursor data
    cursor_data['userId'] = str(user_info['user_id'])  # Use actual user_id, not socket.id
    cursor_data['name'] = user_info['name']
    cursor_data['color'] = user_info['color']
    cursor_data['email'] = user_info['email']
    cursor_data['role'] = user_info.get('role', 'viewer')
    
    # Broadcast cursor position to all clients in the project room except the sender
    await sio.emit('cursor_move', cursor_data, room=f'project-{project_uuid}', skip_sid=sid)
    
    # Debug log every 100th cursor move to avoid spam
    if not hasattr(cursor_move, 'counter'):
        cursor_move.counter = 0
    cursor_move.counter += 1
    if cursor_move.counter % 100 == 0:
        logger.debug('cursor_move broadcasted (count: %s) from %s to room: project-%s', cursor_move.counter, user_info['name'], project_uuid)
