import { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Line, Rect, Circle, Text as KonvaText, Transformer } from 'react-konva';
import Konva from 'konva';
import { useSocket } from '../hooks/useSocket';
import apiClient from '../services/api';
import { useNavigate } from 'react-router-dom';
import ShareModal from './ShareModal';

interface CanvasObject {
  id: string;
  type: 'line' | 'rect' | 'circle' | 'text';
  x?: number;
  y?: number;
  points?: number[];
  width?: number;
  height?: number;
  radius?: number;
  text?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  globalCompositeOperation?: string; // For eraser
}

interface CanvasEditorProps {
  projectUuid: string;
}

// Tool Button Component
const ToolButton = ({ active, onClick, icon, label, shortcut, disabled }: { 
  active: boolean; 
  onClick: () => void; 
  icon: string; 
  label: string;
  shortcut?: string;
  disabled?: boolean;
}) => (
  <button 
    onClick={onClick}
    disabled={disabled}
    title={`${label}${shortcut ? ` (${shortcut})` : ''}`}
    style={{ 
      width: '48px',
      height: '48px',
      backgroundColor: active ? '#007acc' : 'transparent',
      color: disabled ? '#666666' : (active ? 'white' : '#cccccc'),
      border: 'none',
      borderRadius: '6px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontSize: '20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.2s ease',
      fontWeight: active ? 'bold' : 'normal',
      position: 'relative',
      opacity: disabled ? 0.5 : 1
    }}
    onMouseEnter={(e) => {
      if (!active) {
        e.currentTarget.style.backgroundColor = '#3e3e42';
      }
    }}
    onMouseLeave={(e) => {
      if (!active) {
        e.currentTarget.style.backgroundColor = 'transparent';
      }
    }}
  >
    {icon}
    {shortcut && (
      <span style={{
        position: 'absolute',
        bottom: '2px',
        right: '4px',
        fontSize: '8px',
        opacity: 0.5
      }}>
        {shortcut}
      </span>
    )}
  </button>
);

const CanvasEditor = ({ projectUuid }: CanvasEditorProps) => {
  const [tool, setTool] = useState<'select' | 'pen' | 'eraser' | 'rect' | 'circle' | 'text'>('select');
  const [objects, setObjects] = useState<CanvasObject[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentLine, setCurrentLine] = useState<number[]>([]);
  
  // Undo/Redo stacks
  const [history, setHistory] = useState<CanvasObject[][]>([]);
  const [historyStep, setHistoryStep] = useState(-1);
  
  // Canvas dimensions - responsive
  const [canvasSize, setCanvasSize] = useState({
    width: window.innerWidth - 72 - 280,
    height: window.innerHeight - 48
  });

  // Stage position for panning
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  
  // Properties
  const [fillColor, setFillColor] = useState('#000000');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(3);

  // Text editing state
  const [editingText, setEditingText] = useState<{
    id: string;
    x: number;
    y: number;
    text: string;
    fontSize: number;
  } | null>(null);

  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const textEditRef = useRef<HTMLTextAreaElement>(null);
  
  const socket = useSocket(projectUuid);
  const navigate = useNavigate();

  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false);
  const [projectTitle, setProjectTitle] = useState('Untitled');
  const [userRole, setUserRole] = useState<string>('owner');

  // Active users tracking
  const [activeUsers, setActiveUsers] = useState<Array<{
    userId: string;
    name: string;
    email: string;
    color: string;
    role?: string;
  }>>([]);

  // Save to history for undo/redo
  const saveToHistory = useCallback((newObjects: CanvasObject[]) => {
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(JSON.parse(JSON.stringify(newObjects)));
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  }, [history, historyStep]);

  // Undo
  const handleUndo = useCallback(() => {
    if (historyStep > 0) {
      setHistoryStep(historyStep - 1);
      setObjects(JSON.parse(JSON.stringify(history[historyStep - 1])));
    }
  }, [historyStep, history]);

  // Redo
  const handleRedo = useCallback(() => {
    if (historyStep < history.length - 1) {
      setHistoryStep(historyStep + 1);
      setObjects(JSON.parse(JSON.stringify(history[historyStep + 1])));
    }
  }, [historyStep, history]);

  // Copy/Paste
  const [clipboard, setClipboard] = useState<CanvasObject[]>([]);
  
  const handleCopy = useCallback(() => {
    const selectedObjects = objects.filter(obj => selectedIds.includes(obj.id));
    setClipboard(JSON.parse(JSON.stringify(selectedObjects)));
  }, [objects, selectedIds]);

  const handlePaste = useCallback(() => {
    if (clipboard.length === 0) return;
    
    const newObjects = clipboard.map(obj => ({
      ...obj,
      id: `${obj.type}-${Date.now()}-${Math.random()}`,
      x: (obj.x || 0) + 20,
      y: (obj.y || 0) + 20
    }));
    
    const updated = [...objects, ...newObjects];
    setObjects(updated);
    saveToHistory(updated);
    setSelectedIds(newObjects.map(obj => obj.id));
  }, [clipboard, objects, saveToHistory]);

  const handleDuplicate = useCallback(() => {
    handleCopy();
    setTimeout(() => handlePaste(), 10);
  }, [handleCopy, handlePaste]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Z = Undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        if (userRole === 'viewer') return;
        e.preventDefault();
        handleUndo();
      }
      // Cmd/Ctrl + Shift + Z = Redo
      else if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        if (userRole === 'viewer') return;
        e.preventDefault();
        handleRedo();
      }
      // Cmd/Ctrl + C = Copy
      else if ((e.metaKey || e.ctrlKey) && e.key === 'c' && !editingText) {
        if (userRole === 'viewer') return;
        e.preventDefault();
        handleCopy();
      }
      // Cmd/Ctrl + V = Paste
      else if ((e.metaKey || e.ctrlKey) && e.key === 'v' && !editingText) {
        if (userRole === 'viewer') return;
        e.preventDefault();
        handlePaste();
      }
      // Cmd/Ctrl + D = Duplicate
      else if ((e.metaKey || e.ctrlKey) && e.key === 'd' && !editingText) {
        if (userRole === 'viewer') return;
        e.preventDefault();
        handleDuplicate();
      }
      // Delete/Backspace = Delete selected
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0 && !editingText) {
        if (userRole === 'viewer') return;
        e.preventDefault();
        handleDelete();
      }
      // Escape = Deselect
      else if (e.key === 'Escape') {
        setSelectedIds([]);
        setEditingText(null);
      }
      // Tool shortcuts (only if not editing text and not viewer)
      else if (!editingText && userRole !== 'viewer') {
        if (e.key === 'v' || e.key === 'V') setTool('select');
        else if (e.key === 'p' || e.key === 'P') setTool('pen');
        else if (e.key === 'e' || e.key === 'E') setTool('eraser');
        else if (e.key === 'r' || e.key === 'R') setTool('rect');
        else if (e.key === 'c' || e.key === 'C') setTool('circle');
        else if (e.key === 't' || e.key === 'T') setTool('text');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, handleCopy, handlePaste, handleDuplicate, selectedIds, editingText]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setCanvasSize({
        width: window.innerWidth - 72 - 280,
        height: window.innerHeight - 48
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load canvas state on mount
  useEffect(() => {
    const loadCanvas = async () => {
      try {
        const response = await apiClient.get(`/api/projects/${projectUuid}`);
        setProjectTitle(response.data.title || 'Untitled');
        setUserRole(response.data.user_role || 'owner');
        if (response.data.canvas_state && response.data.canvas_state.objects) {
          const loadedObjects = response.data.canvas_state.objects;
          setObjects(loadedObjects);
          saveToHistory(loadedObjects);
        } else {
          saveToHistory([]);
        }
      } catch (error) {
        console.error('Failed to load canvas:', error);
      }
    };

    loadCanvas();
  }, [projectUuid]);

  // Manual save function
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const handleManualSave = async () => {
    setIsSaving(true);
    try {
      await apiClient.put(`/api/projects/${projectUuid}`, {
        title: 'My Project',
        canvas_state: { objects }
      });
      setLastSaved(new Date());
      console.log('✅ Canvas manually saved');
    } catch (error) {
      console.error('❌ Failed to save canvas:', error);
      alert('Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-save
  useEffect(() => {
    const saveCanvas = async () => {
      try {
        await apiClient.put(`/api/projects/${projectUuid}`, {
          title: 'My Project',
          canvas_state: { objects }
        });
        setLastSaved(new Date());
        console.log('Canvas auto-saved');
      } catch (error) {
        console.error('Failed to save canvas:', error);
      }
    };

    const timeoutId = setTimeout(() => {
      if (objects.length >= 0) {
        saveCanvas();
      }
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [projectUuid, objects]);

  // Connection status
  const [isConnected, setIsConnected] = useState(false);
  const [cursors, setCursors] = useState<Record<string, { x: number; y: number; color: string; name: string }>>({});

  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      console.log('✅ WebSocket CONNECTED');
      setIsConnected(true);
    };

    const handleDisconnect = () => {
      console.log('❌ WebSocket DISCONNECTED');
      setIsConnected(false);
    };

    if (socket.connected) {
      setIsConnected(true);
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [socket]);

  // Listen for canvas updates
  useEffect(() => {
    if (!socket) return;

    const handleCanvasUpdate = (data: { action: string; object?: CanvasObject; objectId?: string }) => {
      console.log('� RECEIVED canvas_update:', data);
      
      if (data.action === 'add' && data.object) {
        console.log('📥 Adding object:', data.object.id);
        setObjects(prev => {
          if (prev.find(obj => obj.id === data.object!.id)) {
            console.log('⚠️ Object already exists, skipping');
            return prev;
          }
          console.log('✅ Object added to canvas');
          return [...prev, data.object!];
        });
      } else if (data.action === 'delete' && data.objectId) {
        console.log('📥 Deleting object:', data.objectId);
        setObjects(prev => prev.filter(obj => obj.id !== data.objectId));
      }
    };

    const handleCursorMove = (data: { userId: string; x: number; y: number; color: string; name: string; email: string }) => {
      // Log only occasionally to avoid spam
      if (Math.random() < 0.01) {
        console.log('👆 RECEIVED cursor_move:', data.userId, data.name);
      }
      setCursors(prev => ({
        ...prev,
        [data.userId]: { x: data.x, y: data.y, color: data.color, name: data.name }
      }));
    };

    const handleUserJoined = (data: { userId: number; name: string; email: string; color: string; role?: string }) => {
      console.log('👥 User joined:', data.email);
      setActiveUsers(prev => [...prev, {
        userId: String(data.userId),
        name: data.name,
        email: data.email,
        color: data.color,
        role: data.role
      }]);
    };

    const handleUserLeft = (data: { userId: number; name: string }) => {
      console.log('👋 User left:', data.name);
      setCursors(prev => {
        const updated = { ...prev };
        delete updated[String(data.userId)];
        return updated;
      });
      setActiveUsers(prev => prev.filter(u => u.userId !== String(data.userId)));
    };

    const handleCurrentUsers = (data: { users: Array<{ userId: number; name: string; email: string; color: string; role?: string }> }) => {
      console.log('👥 Current users in project:', data.users);
      setActiveUsers(data.users.map(u => ({
        userId: String(u.userId),
        name: u.name,
        email: u.email,
        color: u.color,
        role: u.role
      })));
    };

    socket.on('canvas_update', handleCanvasUpdate);
    socket.on('cursor_move', handleCursorMove);
    socket.on('user_joined', handleUserJoined);
    socket.on('user_left', handleUserLeft);
    socket.on('current_users', handleCurrentUsers);

    return () => {
      socket.off('canvas_update', handleCanvasUpdate);
      socket.off('cursor_move', handleCursorMove);
      socket.off('user_joined', handleUserJoined);
      socket.off('user_left', handleUserLeft);
      socket.off('current_users', handleCurrentUsers);
    };
  }, [socket]);

  // Broadcast updates
  const broadcastUpdate = (action: string, object?: CanvasObject, objectId?: string) => {
    if (socket) {
      console.log('📤 SENDING canvas_update:', action, object?.id || objectId);
      socket.emit('canvas_update', {
        projectUuid,
        data: { action, object, objectId }
      });
    } else {
      console.log('⚠️ No socket connection, cannot broadcast');
    }
  };

  // Update transformer when selection changes
  useEffect(() => {
    if (!transformerRef.current || !layerRef.current) return;

    // Hide transformer for viewers
    if (userRole === 'viewer') {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer()?.batchDraw();
      return;
    }

    const selectedNodes = selectedIds
      .map(id => layerRef.current?.findOne(`#${id}`))
      .filter(node => node !== undefined);

    transformerRef.current.nodes(selectedNodes);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedIds, userRole]);

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // Close text editing if clicking outside
    if (editingText) {
      const textObj = objects.find(obj => obj.id === editingText.id);
      if (textObj) {
        const updated = objects.map(obj => 
          obj.id === editingText.id ? { ...obj, text: editingText.text } : obj
        );
        setObjects(updated);
        saveToHistory(updated);
      }
      setEditingText(null);
    }

    if (userRole === 'viewer' && tool !== 'select') return; // View-only mode

    if (tool === 'select') {
      const clickedOnEmpty = e.target === e.target.getStage();
      if (clickedOnEmpty) {
        setSelectedIds([]);
      }
      return;
    }

    const stage = e.target.getStage();
    if (!stage) return;

    // Use getRelativePointerPosition for accurate coordinates with zoom/pan
    const pos = stage.getRelativePointerPosition();
    if (!pos) return;

    const id = `${tool}-${Date.now()}`;

    if (tool === 'pen') {
      setIsDrawing(true);
      setCurrentLine([pos.x, pos.y]);
    } else if (tool === 'eraser') {
      setIsDrawing(true);
      setCurrentLine([pos.x, pos.y]);
    } else if (tool === 'rect') {
      const newRect: CanvasObject = {
        id,
        type: 'rect',
        x: pos.x,
        y: pos.y,
        width: 100,
        height: 100,
        fill: fillColor,
        stroke: strokeColor,
        strokeWidth,
      };
      const updated = [...objects, newRect];
      setObjects(updated);
      saveToHistory(updated);
      broadcastUpdate('add', newRect);
    } else if (tool === 'circle') {
      const newCircle: CanvasObject = {
        id,
        type: 'circle',
        x: pos.x,
        y: pos.y,
        radius: 50,
        fill: fillColor,
        stroke: strokeColor,
        strokeWidth,
      };
      const updated = [...objects, newCircle];
      setObjects(updated);
      saveToHistory(updated);
      broadcastUpdate('add', newCircle);
    } else if (tool === 'text') {
      const newText: CanvasObject = {
        id,
        type: 'text',
        x: pos.x,
        y: pos.y,
        text: 'Double-click to edit',
        fill: fillColor,
        strokeWidth: 0,
      };
      const updated = [...objects, newText];
      setObjects(updated);
      saveToHistory(updated);
      broadcastUpdate('add', newText);
      
      // Auto-start editing
      setTimeout(() => {
        const stage = stageRef.current;
        if (stage) {
          const screenPos = {
            x: pos.x * stageScale + stagePos.x,
            y: pos.y * stageScale + stagePos.y
          };
          setEditingText({
            id,
            x: screenPos.x,
            y: screenPos.y,
            text: '',
            fontSize: 20
          });
        }
      }, 50);
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    // Use getRelativePointerPosition for accurate coordinates with zoom/pan
    const pos = stage.getRelativePointerPosition();
    if (!pos) return;

    // Update drawing line if drawing
    if (isDrawing && (tool === 'pen' || tool === 'eraser')) {
      if (userRole === 'viewer') return; // View-only mode
      setCurrentLine([...currentLine, pos.x, pos.y]);
    }

    // Broadcast cursor position to other users (throttled to every 50ms)
    if (socket && Date.now() - lastCursorBroadcast.current > 50) {
      lastCursorBroadcast.current = Date.now();
      socket.emit('cursor_move', {
        projectUuid,
        data: {
          x: pos.x,
          y: pos.y
        }
      });
    }
  };

  // Add ref for throttling cursor broadcasts
  const lastCursorBroadcast = useRef(0);

  const handleMouseUp = () => {
    if (isDrawing && (tool === 'pen' || tool === 'eraser') && currentLine.length > 0) {
      if (userRole === 'viewer') {
        setCurrentLine([]);
        setIsDrawing(false);
        return; // View-only mode
      }
      const newLine: CanvasObject = {
        id: `line-${Date.now()}`,
        type: 'line',
        points: currentLine,
        stroke: tool === 'eraser' ? '#ffffff' : strokeColor,
        strokeWidth: tool === 'eraser' ? strokeWidth * 3 : strokeWidth,
        globalCompositeOperation: tool === 'eraser' ? 'destination-out' : 'source-over'
      };
      const updated = [...objects, newLine];
      setObjects(updated);
      saveToHistory(updated);
      broadcastUpdate('add', newLine);
      setCurrentLine([]);
    }
    setIsDrawing(false);
  };

  const handleObjectClick = (e: Konva.KonvaEventObject<MouseEvent>, id: string) => {
    if (tool !== 'select') return;
    if (userRole === 'viewer') return; // View-only mode
    
    e.cancelBubble = true;
    
    const isMultiSelect = e.evt.shiftKey;
    if (isMultiSelect) {
      setSelectedIds(prev => 
        prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      );
    } else {
      setSelectedIds([id]);
    }
  };

  const handleDelete = () => {
    if (userRole === 'viewer') return; // View-only mode
    if (selectedIds.length === 0) return;
    
    const updated = objects.filter(obj => !selectedIds.includes(obj.id));
    setObjects(updated);
    saveToHistory(updated);
    selectedIds.forEach(id => broadcastUpdate('delete', undefined, id));
    setSelectedIds([]);
  };

  const handleTextDblClick = (id: string) => {
    if (userRole === 'viewer') return; // View-only mode
    
    const textObj = objects.find(obj => obj.id === id && obj.type === 'text');
    if (!textObj || !stageRef.current) return;

    // Calculate screen position
    const node = layerRef.current?.findOne(`#${id}`);
    if (!node) return;

    const transform = node.getAbsoluteTransform();
    const screenPos = transform.point({ x: 0, y: 0 });

    setEditingText({
      id,
      x: screenPos.x,
      y: screenPos.y,
      text: textObj.text || '',
      fontSize: 20
    });

    // Focus textarea after render
    setTimeout(() => {
      textEditRef.current?.focus();
      textEditRef.current?.select();
    }, 10);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!editingText) return;
    setEditingText({ ...editingText, text: e.target.value });
  };

  const handleTextBlur = () => {
    if (!editingText) return;

    const updated = objects.map(obj => 
      obj.id === editingText.id ? { ...obj, text: editingText.text } : obj
    );
    setObjects(updated);
    saveToHistory(updated);
    setEditingText(null);
  };

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();

    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const scaleBy = 1.05;
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const clampedScale = Math.max(0.1, Math.min(5, newScale));

    setStageScale(clampedScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    });
  };

  // Object transformation handler
  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    if (userRole === 'viewer') return; // View-only mode
    
    const node = e.target;
    const id = node.id();

    const updated = objects.map(obj => {
      if (obj.id === id) {
        return {
          ...obj,
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          scaleX: node.scaleX(),
          scaleY: node.scaleY(),
          width: obj.type === 'rect' ? node.width() * node.scaleX() : obj.width,
          height: obj.type === 'rect' ? node.height() * node.scaleY() : obj.height,
          radius: obj.type === 'circle' ? obj.radius! * node.scaleX() : obj.radius
        };
      }
      return obj;
    });

    setObjects(updated);
    saveToHistory(updated);

    // Reset scale after applying to dimensions
    node.scaleX(1);
    node.scaleY(1);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', backgroundColor: '#1e1e1e', overflow: 'hidden' }}>
      {/* Top Header Bar */}
      <div style={{ 
        height: '48px',
        padding: '0 20px', 
        backgroundColor: '#2d2d30', 
        borderBottom: '1px solid #3e3e42',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: '20px',
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#e1e1e1'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#888'}
            title="Back to Dashboard"
          >
            ←
          </button>

          <h2 style={{ margin: 0, color: '#e1e1e1', fontSize: '16px', fontWeight: 600, letterSpacing: '0.5px' }}>
            Canvas AI
          </h2>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ 
              width: '6px', 
              height: '6px', 
              borderRadius: '50%', 
              backgroundColor: isConnected ? '#4caf50' : '#f44336'
            }} />
            <span style={{ fontSize: '12px', color: '#888' }}>
              {isConnected ? 'Connected' : 'Offline'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Active Users */}
          {activeUsers.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', marginLeft: '-8px' }}>
                {activeUsers.slice(0, 5).map((user, idx) => (
                  <div
                    key={user.userId}
                    title={`${user.name || user.email} (${user.role || 'viewer'})`}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      backgroundColor: user.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '11px',
                      fontWeight: 600,
                      border: '2px solid #2d2d30',
                      marginLeft: idx > 0 ? '-8px' : '0',
                      zIndex: activeUsers.length - idx
                    }}
                  >
                    {(user.name || user.email).charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
              {activeUsers.length > 5 && (
                <span style={{ fontSize: '11px', color: '#888' }}>
                  +{activeUsers.length - 5}
                </span>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={handleUndo}
              disabled={historyStep <= 0}
              title="Undo (⌘Z)"
              style={{
                background: 'none',
                border: '1px solid #3e3e42',
                color: historyStep <= 0 ? '#555' : '#e1e1e1',
                cursor: historyStep <= 0 ? 'not-allowed' : 'pointer',
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '12px'
              }}
            >
              ↶
            </button>
            <button
              onClick={handleRedo}
              disabled={historyStep >= history.length - 1}
              title="Redo (⌘⇧Z)"
              style={{
                background: 'none',
                border: '1px solid #3e3e42',
                color: historyStep >= history.length - 1 ? '#555' : '#e1e1e1',
                cursor: historyStep >= history.length - 1 ? 'not-allowed' : 'pointer',
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '12px'
              }}
            >
              ↷
            </button>
          </div>

          <span style={{ fontSize: '11px', color: '#666' }}>
            {Math.round(stageScale * 100)}%
          </span>

          {userRole !== 'viewer' && (
            <button
              onClick={() => setShowShareModal(true)}
              style={{
                padding: '6px 16px',
                backgroundColor: '#007acc',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              👥 Share
            </button>
          )}

          {lastSaved && !isSaving && (
            <span style={{ fontSize: '11px', color: '#666' }}>
              Saved {lastSaved.toLocaleTimeString()}
            </span>
          )}
          
          {isSaving && (
            <span style={{ fontSize: '11px', color: '#4caf50' }}>
              Saving...
            </span>
          )}
          
          <button 
            onClick={handleManualSave}
            disabled={isSaving}
            style={{ 
              padding: '6px 16px',
              backgroundColor: '#007acc',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              fontWeight: 500,
              opacity: isSaving ? 0.6 : 1
            }}
          >
            Save
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Toolbar */}
        <div style={{ 
          width: '72px', 
          backgroundColor: '#252526', 
          borderRight: '1px solid #3e3e42',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '16px 0',
          gap: '8px'
        }}>
          <ToolButton 
            active={tool === 'select'} 
            onClick={() => setTool('select')}
            icon="↖"
            label="Select"
            shortcut="V"
          />
          <ToolButton 
            active={tool === 'pen'} 
            onClick={() => setTool('pen')}
            icon="✎"
            label="Pen"
            shortcut="P"
            disabled={userRole === 'viewer'}
          />
          <ToolButton 
            active={tool === 'eraser'} 
            onClick={() => setTool('eraser')}
            icon="⌫"
            label="Eraser"
            shortcut="E"
            disabled={userRole === 'viewer'}
          />
          <ToolButton 
            active={tool === 'rect'} 
            onClick={() => setTool('rect')}
            icon="▢"
            label="Rectangle"
            shortcut="R"
            disabled={userRole === 'viewer'}
          />
          <ToolButton 
            active={tool === 'circle'} 
            onClick={() => setTool('circle')}
            icon="○"
            label="Circle"
            shortcut="C"
            disabled={userRole === 'viewer'}
          />
          <ToolButton 
            active={tool === 'text'} 
            onClick={() => setTool('text')}
            icon="T"
            label="Text"
            shortcut="T"
            disabled={userRole === 'viewer'}
          />

          <div style={{ flex: 1 }} />

          {selectedIds.length > 0 && (
            <button 
              onClick={handleDelete}
              title="Delete (Del)"
              style={{ 
                width: '48px',
                height: '48px',
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              🗑
            </button>
          )}
        </div>

        {/* Canvas Area */}
        <div style={{ flex: 1, backgroundColor: '#1e1e1e', position: 'relative', overflow: 'hidden' }}>
          <Stage
            ref={stageRef}
            width={canvasSize.width}
            height={canvasSize.height}
            scaleX={stageScale}
            scaleY={stageScale}
            x={stagePos.x}
            y={stagePos.y}
            draggable={tool === 'select' && selectedIds.length === 0}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{ backgroundColor: '#ffffff' }}
          >
            <Layer ref={layerRef}>
              {objects.map((obj) => {
                if (obj.type === 'line') {
                  return (
                    <Line
                      key={obj.id}
                      id={obj.id}
                      points={obj.points}
                      stroke={obj.stroke}
                      strokeWidth={obj.strokeWidth}
                      tension={0.5}
                      lineCap="round"
                      lineJoin="round"
                      globalCompositeOperation={obj.globalCompositeOperation as any || 'source-over'}
                      onClick={(e) => handleObjectClick(e, obj.id)}
                    />
                  );
                } else if (obj.type === 'rect') {
                  return (
                    <Rect
                      key={obj.id}
                      id={obj.id}
                      x={obj.x}
                      y={obj.y}
                      width={obj.width}
                      height={obj.height}
                      fill={obj.fill}
                      stroke={obj.stroke}
                      strokeWidth={obj.strokeWidth}
                      rotation={obj.rotation}
                      scaleX={obj.scaleX}
                      scaleY={obj.scaleY}
                      draggable={tool === 'select' && userRole !== 'viewer'}
                      onClick={(e) => handleObjectClick(e, obj.id)}
                      onTransformEnd={handleTransformEnd}
                    />
                  );
                } else if (obj.type === 'circle') {
                  return (
                    <Circle
                      key={obj.id}
                      id={obj.id}
                      x={obj.x}
                      y={obj.y}
                      radius={obj.radius}
                      fill={obj.fill}
                      stroke={obj.stroke}
                      strokeWidth={obj.strokeWidth}
                      rotation={obj.rotation}
                      scaleX={obj.scaleX}
                      scaleY={obj.scaleY}
                      draggable={tool === 'select' && userRole !== 'viewer'}
                      onClick={(e) => handleObjectClick(e, obj.id)}
                      onTransformEnd={handleTransformEnd}
                    />
                  );
                } else if (obj.type === 'text') {
                  return (
                    <KonvaText
                      key={obj.id}
                      id={obj.id}
                      x={obj.x}
                      y={obj.y}
                      text={obj.text}
                      fill={obj.fill}
                      fontSize={20}
                      rotation={obj.rotation}
                      scaleX={obj.scaleX}
                      scaleY={obj.scaleY}
                      draggable={tool === 'select' && userRole !== 'viewer'}
                      onClick={(e) => handleObjectClick(e, obj.id)}
                      onDblClick={() => handleTextDblClick(obj.id)}
                      onTransformEnd={handleTransformEnd}
                    />
                  );
                }
                return null;
              })}

              {isDrawing && (tool === 'pen' || tool === 'eraser') && currentLine.length > 0 && (
                <Line
                  points={currentLine}
                  stroke={tool === 'eraser' ? '#ffffff' : strokeColor}
                  strokeWidth={tool === 'eraser' ? strokeWidth * 3 : strokeWidth}
                  tension={0.5}
                  lineCap="round"
                  lineJoin="round"
                  globalCompositeOperation={tool === 'eraser' ? 'destination-out' : 'source-over'}
                />
              )}

              {Object.entries(cursors).map(([userId, cursor]) => (
                <g key={userId}>
                  <Circle
                    x={cursor.x}
                    y={cursor.y}
                    radius={8}
                    fill={cursor.color}
                    opacity={0.7}
                  />
                  <KonvaText
                    x={cursor.x + 12}
                    y={cursor.y - 8}
                    text={`${cursor.name} (Remote)`}
                    fontSize={12}
                    fill={cursor.color}
                    fontStyle="bold"
                  />
                </g>
              ))}

              <Transformer
                ref={transformerRef}
                boundBoxFunc={(oldBox, newBox) => {
                  if (newBox.width < 5 || newBox.height < 5) {
                    return oldBox;
                  }
                  return newBox;
                }}
              />
            </Layer>
          </Stage>

          {editingText && (
            <textarea
              ref={textEditRef}
              value={editingText.text}
              onChange={handleTextChange}
              onBlur={handleTextBlur}
              style={{
                position: 'absolute',
                top: editingText.y,
                left: editingText.x,
                fontSize: `${editingText.fontSize * stageScale}px`,
                border: '2px solid #007acc',
                padding: '4px',
                margin: 0,
                overflow: 'hidden',
                background: 'white',
                outline: 'none',
                resize: 'none',
                fontFamily: 'Arial, sans-serif',
                lineHeight: '1',
                minWidth: '100px',
                minHeight: '30px'
              }}
              autoFocus
            />
          )}
        </div>

        {/* Right Panel - Properties */}
        <div style={{ 
          width: '280px', 
          backgroundColor: '#252526', 
          borderLeft: '1px solid #3e3e42',
          padding: '24px',
          overflowY: 'auto'
        }}>
          <h3 style={{ color: '#e1e1e1', fontSize: '14px', fontWeight: 600, marginTop: 0, marginBottom: '20px' }}>
            Properties
          </h3>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', color: '#9d9d9d', fontSize: '12px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Fill Color
            </label>
            <input 
              type="color" 
              value={fillColor} 
              onChange={(e) => setFillColor(e.target.value)}
              style={{ 
                width: '100%', 
                height: '36px', 
                border: '1px solid #3e3e42', 
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: '#1e1e1e'
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', color: '#9d9d9d', fontSize: '12px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Stroke Color
            </label>
            <input 
              type="color" 
              value={strokeColor} 
              onChange={(e) => setStrokeColor(e.target.value)}
              style={{ 
                width: '100%', 
                height: '36px', 
                border: '1px solid #3e3e42', 
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: '#1e1e1e'
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', color: '#9d9d9d', fontSize: '12px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Stroke Width: {strokeWidth}px
            </label>
            <input 
              type="range" 
              value={strokeWidth} 
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
              min="1"
              max="20"
              style={{ 
                width: '100%',
                accentColor: '#007acc'
              }}
            />
          </div>

          {selectedIds.length > 0 && (
            <>
              <button 
                onClick={handleDelete}
                style={{ 
                  width: '100%',
                  padding: '12px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                  marginBottom: '8px'
                }}
              >
                Delete Selected
              </button>
              
              <button 
                onClick={handleDuplicate}
                style={{ 
                  width: '100%',
                  padding: '12px',
                  backgroundColor: '#007acc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500
                }}
              >
                Duplicate (⌘D)
              </button>
            </>
          )}

          <div style={{ 
            marginTop: 'auto', 
            paddingTop: '20px',
            borderTop: '1px solid #3e3e42'
          }}>
            <p style={{ 
              color: '#666', 
              fontSize: '11px', 
              margin: 0,
              lineHeight: '1.6'
            }}>
              <strong>Keyboard Shortcuts:</strong><br/>
              V - Select<br/>
              P - Pen<br/>
              E - Eraser<br/>
              R - Rectangle<br/>
              C - Circle<br/>
              T - Text<br/>
              ⌘Z - Undo<br/>
              ⌘⇧Z - Redo<br/>
              ⌘C/V/D - Copy/Paste/Duplicate<br/>
              Del - Delete<br/>
              Shift+Click - Multi-select<br/>
              Scroll - Zoom<br/>
              Double-click text to edit
            </p>
          </div>
        </div>
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <ShareModal
          projectUuid={projectUuid}
          projectTitle={projectTitle}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* View-Only Mode Banner */}
      {userRole === 'viewer' && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#ff9800',
          color: 'white',
          padding: '12px 24px',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 500,
          zIndex: 10000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}>
          👁️ View-only mode • Ask the owner for edit permission
        </div>
      )}
    </div>
  );
};

export default CanvasEditor;
