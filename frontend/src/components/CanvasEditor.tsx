import { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Line, Rect, Circle, Text as KonvaText, Transformer, Label, Tag, Image as KonvaImage, Group } from 'react-konva';
import Konva from 'konva';
import { useSocket } from '../hooks/useSocket';
import apiClient from '../services/api';
import { useNavigate } from 'react-router-dom';
import ShareModal from './ShareModal';
import './CanvasEditor.css';

interface CanvasObject {
  id: string;
  type: 'line' | 'rect' | 'circle' | 'text' | 'image';
  x?: number;
  y?: number;
  points?: number[];
  width?: number;
  height?: number;
  radius?: number;
  text?: string;
  fontSize?: number; // For text
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  globalCompositeOperation?: string; // For eraser
  imageSrc?: string; // For images
  cropX?: number; // For crop
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  originalWidth?: number;
  originalHeight?: number;
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
    className={`tool-button ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
  >
    {icon}
    {shortcut && (
      <span className="tool-shortcut">
        {shortcut}
      </span>
    )}
  </button>
);

const CanvasEditor = ({ projectUuid }: CanvasEditorProps) => {
  const [tool, setTool] = useState<'select'|'pen'|'eraser'|'rect'|'circle'|'text'|'fill'>('select');
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
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [fontSize, setFontSize] = useState(20);

  // Text editing state
  const [editingText, setEditingText] = useState<{
    id: string;
    x: number;
    y: number;
    text: string;
    fontSize: number;
  } | null>(null);

  // Zoom helpers
  const zoomIn = () => setStageScale(s => Math.min(5, s * 1.2));
  const zoomOut = () => setStageScale(s => Math.max(0.1, s / 1.2));
  const resetZoom = () => { 
    setStageScale(1); 
    setStagePos({ x: 0, y: 0 }); 
  };

  // Predefined color palette
  const colorPalette = [
    '#000000', '#FFFFFF', '#FF6B6B', '#FFA500', '#FFD700',
    '#4ECDC4', '#45B7D1', '#7B68EE', '#FF69B4', '#20C997'
  ];

  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const cropTransformerRef = useRef<Konva.Transformer>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const textEditRef = useRef<HTMLTextAreaElement>(null);
  const cropRectRef = useRef<Konva.Rect>(null);
  
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
      console.log('💾 Manual save - preserving title, only updating canvas_state');
      await apiClient.put(`/api/projects/${projectUuid}`, {
        canvas_state: { objects }
        // Don't send title - it shouldn't change when saving canvas
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
        console.log('💾 Auto-save - preserving title, only updating canvas_state');
        await apiClient.put(`/api/projects/${projectUuid}`, {
          canvas_state: { objects }
          // Don't send title - it shouldn't change when saving canvas
        });
        setLastSaved(new Date());
        console.log('✅ Canvas auto-saved');
      } catch (error) {
        console.error('❌ Failed to save canvas:', error);
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

  // Update crop transformer when crop rect exists
  useEffect(() => {
    if (!cropTransformerRef.current || !layerRef.current) return;
    const rectNode = cropRectRef.current;
    if (rectNode) {
      cropTransformerRef.current.nodes([rectNode]);
      cropTransformerRef.current.getLayer()?.batchDraw();
    } else {
      cropTransformerRef.current.nodes([]);
      cropTransformerRef.current.getLayer()?.batchDraw();
    }
  }, [/* re-run when crop rect changes, we update ref directly */]);

  // Crop UI state
  const [cropMode, setCropMode] = useState(false);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [imageLoading, setImageLoading] = useState<Record<string, boolean>>({});

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
        fontSize: fontSize,
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
            fontSize: fontSize
          });
        }
      }, 50);
    }

    // Fill tool: click on a shape to fill it with current fill color
    if (tool === 'fill') {
      if (userRole === 'viewer') return; // View-only mode
      
      // Get the pointer position on the stage (screen coords)
      const pointerPos = stage.getPointerPosition();
      if (!pointerPos) return;
      
      // Get intersecting shape at click position
      const clicked = layerRef.current?.getIntersection(pointerPos);
      if (clicked && clicked.id()) {
        const clickedId = clicked.id();
        const objIndex = objects.findIndex(obj => obj.id === clickedId);
        
        if (objIndex !== -1) {
          // For lines/pen strokes: change stroke color instead of fill
          if (objects[objIndex].type === 'line') {
            const updated = objects.map((obj, idx) => 
              idx === objIndex ? { ...obj, stroke: fillColor } : obj
            );
            setObjects(updated);
            saveToHistory(updated);
            broadcastUpdate('edit', undefined, clickedId);
          } else {
            // For shapes: apply fill color
            const updated = objects.map((obj, idx) => 
              idx === objIndex ? { ...obj, fill: fillColor } : obj
            );
            setObjects(updated);
            saveToHistory(updated);
            broadcastUpdate('edit', undefined, clickedId);
          }
        }
      }
      return;
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

    // Calculate screen position from canvas coordinates
    const x = (textObj.x || 0) * stageScale + stagePos.x;
    const y = (textObj.y || 0) * stageScale + stagePos.y;

    setEditingText({
      id,
      x: x + 4,
      y: y + 4,
      text: textObj.text || '',
      fontSize: 20
    });

    // Focus textarea after render
    setTimeout(() => {
      if (textEditRef.current) {
        textEditRef.current.focus();
        textEditRef.current.select();
      }
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

  // Image upload handler
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (userRole === 'viewer' || !e.target.files?.[0]) return;
    
    const file = e.target.files[0];
    const reader = new FileReader();
    
    reader.onload = (event) => {
      const imageSrc = event.target?.result as string;
      const id = `image-${Date.now()}`;

    // Create an HTMLImageElement to read natural size and wait for load
  const img = new window.Image();
  img.src = imageSrc;
  // cache the HTMLImage so Konva can reuse it
  imageCache.current[imageSrc] = img;
  // mark loading for the new image id
  setImageLoading(l => ({ ...l, [id]: true }));

  img.onload = () => {
        // Compute a good default size while preserving aspect ratio
        const maxWidth = Math.max(200, Math.min(800, canvasSize.width * 0.6));
        const maxHeight = Math.max(160, Math.min(800, canvasSize.height * 0.6));

  let width = img.naturalWidth;
  let height = img.naturalHeight;

        const widthRatio = width / maxWidth;
        const heightRatio = height / maxHeight;
        const maxRatio = Math.max(widthRatio, heightRatio, 1);

        width = Math.round(width / maxRatio);
        height = Math.round(height / maxRatio);

        // Center the image in the visible canvas area
        const x = ((canvasSize.width / (stageScale || 1)) / 2) - (width / 2);
        const y = ((canvasSize.height / (stageScale || 1)) / 2) - (height / 2);

        const newImage: CanvasObject = {
          id,
          type: 'image',
          x,
          y,
          width,
          height,
          imageSrc,
          originalWidth: img.naturalWidth,
          originalHeight: img.naturalHeight,
          scaleX: 1,
          scaleY: 1,
          rotation: 0
        };

        const updated = [...objects, newImage];
        setObjects(updated);
        saveToHistory(updated);
        broadcastUpdate('add', newImage);
        // mark loaded
        setImageLoading(l => ({ ...l, [newImage.id]: false }));
      };

      // if image fails to load, still attempt to add as-is without cropping
      img.onerror = () => {
        const newImage: CanvasObject = {
          id,
          type: 'image',
          x: 100,
          y: 100,
          width: 200,
          height: 200,
          imageSrc,
          scaleX: 1,
          scaleY: 1,
          rotation: 0
        };
        const updated = [...objects, newImage];
        setObjects(updated);
        saveToHistory(updated);
        broadcastUpdate('add', newImage);
      };
      // (already set above) keep loading flag until image.onload fires
    };

    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Load HTMLImage for Konva Image nodes (cache by src)
  const imageCache = useRef<Record<string, HTMLImageElement | null>>({});
  const loadImage = (src: string): HTMLImageElement | null => {
    if (!src) return null;
    if (imageCache.current[src]) return imageCache.current[src];
    const img = new window.Image();
    img.src = src;
    imageCache.current[src] = img;
    return img;
  };

  // PDF Export (using canvas to image then download)
  const exportCanvasPDF = () => {
    (async () => {
      try {
        const stage = stageRef.current;
        if (!stage) return;

        const layer = layerRef.current;
        if (!layer) return;

        const bg = new Konva.Rect({
          x: 0,
          y: 0,
          width: stage.width() / stageScale,
          height: stage.height() / stageScale,
          fill: 'white',
        });
        layer.add(bg);
        bg.moveToBottom();
        layer.batchDraw();

        const dataURL = stage.toDataURL({ pixelRatio: 2 });

        // Clean up
        bg.destroy();
        layer.batchDraw();

        // Send to backend for PDF conversion
        const payload = { imageData: dataURL, filename: `${projectTitle || 'canvas'}.pdf` };
        const resp = await apiClient.post('/api/export/pdf', payload, { responseType: 'blob' });

        // Download returned PDF blob
        const blob = new Blob([resp.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${projectTitle || 'canvas'}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);

        console.log('✅ Canvas exported as PDF via server');
      } catch (error) {
        console.error('❌ Export failed:', error);
        alert('Failed to export PDF. Please try again.');
      }
    })();
  };

  // PNG Export
  const downloadCanvasPNG = () => {
    try {
      const stage = stageRef.current;
      if (!stage) return;
      
      // Add white background for export
      const layer = layerRef.current;
      if (!layer) return;
      
      const bg = new Konva.Rect({
        x: 0,
        y: 0,
        width: stage.width() / stageScale,
        height: stage.height() / stageScale,
        fill: 'white',
      });
      layer.add(bg);
      bg.moveToBottom();
      layer.batchDraw();
      
      const dataURL = stage.toDataURL({ pixelRatio: 2 });
      
      // Remove background after export
      bg.destroy();
      layer.batchDraw();
      
      const link = document.createElement('a');
      link.href = dataURL;
      link.download = `${projectTitle || 'canvas'}.png`;
      link.click();
      console.log('✅ Canvas exported as PNG');
    } catch (error) {
      console.error('❌ PNG export failed:', error);
      alert('Failed to export PNG. Please try again.');
    }
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
    <div className="canvas-editor-root">
      {/* Top Header Bar */}
      <div className="canvas-header">
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
                fontSize: '12px',
                transition: 'all 0.2s'
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
                fontSize: '12px',
                transition: 'all 0.2s'
              }}
            >
              ↷
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="zoom-controls">
            <button
              onClick={zoomOut}
              title="Zoom Out (−)"
              className="zoom-button"
            >
              −
            </button>
            <span className="zoom-display">
              {Math.round(stageScale * 100)}%
            </span>
            <button
              onClick={zoomIn}
              title="Zoom In (+)"
              className="zoom-button"
            >
              +
            </button>
            <button
              onClick={resetZoom}
              title="Reset Zoom (1:1)"
              className="zoom-button zoom-reset"
            >
              1:1
            </button>
          </div>

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
        <div className="canvas-toolbar-left">
          {/* Main Tools */}
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
          <ToolButton 
            active={tool === 'fill'} 
            onClick={() => setTool('fill')}
            icon="🪣"
            label="Fill"
            shortcut="F"
            disabled={userRole === 'viewer'}
          />

          <div style={{ flex: 1 }} />

          {/* Delete Button */}
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
                justifyContent: 'center',
                transition: 'background-color 0.2s',
                marginBottom: '8px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#d32f2f'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f44336'}
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
                      fontSize={obj.fontSize || 20}
                      rotation={obj.rotation}
                      scaleX={obj.scaleX}
                      scaleY={obj.scaleY}
                      draggable={tool === 'select' && userRole !== 'viewer'}
                      onClick={(e) => handleObjectClick(e, obj.id)}
                      onDblClick={() => handleTextDblClick(obj.id)}
                      onTransformEnd={handleTransformEnd}
                    />
                  );
                } else if (obj.type === 'image') {
                  const img = obj.imageSrc ? loadImage(obj.imageSrc) : null;
                  // Draw Konva Image with cropping and transforms
                  return (
                    <KonvaImage
                      key={obj.id}
                      id={obj.id}
                      x={obj.x}
                      y={obj.y}
                      image={img as any}
                      width={obj.width}
                      height={obj.height}
                      rotation={obj.rotation}
                      scaleX={obj.scaleX}
                      scaleY={obj.scaleY}
                      draggable={tool === 'select' && userRole !== 'viewer'}
                      crop={{ x: obj.cropX || 0, y: obj.cropY || 0, width: obj.cropWidth || obj.width || 0, height: obj.cropHeight || obj.height || 0 }}
                      onClick={(e) => handleObjectClick(e, obj.id)}
                      onTransformEnd={handleTransformEnd}
                    />
                  );
                }
                return null;
              })}

                {/* Crop rectangle (interactive) */}
                {cropMode && cropRect && (
                  <>
                    <Rect
                      ref={cropRectRef}
                      id="__crop_rect"
                      x={cropRect.x}
                      y={cropRect.y}
                      width={cropRect.width}
                      height={cropRect.height}
                      fill={'rgba(0,0,0,0.12)'}
                      stroke={'#80b3ff'}
                      strokeWidth={2}
                      dash={[6, 4]}
                      draggable={true}
                      onDragEnd={(e) => {
                        const node = e.target;
                        setCropRect(r => r ? { ...r, x: node.x(), y: node.y() } : r);
                      }}
                      onTransformEnd={(e) => {
                        const node = e.target;
                        // apply width/height and reset scale
                        const newW = Math.max(1, node.width() * node.scaleX());
                        const newH = Math.max(1, node.height() * node.scaleY());
                        node.scaleX(1);
                        node.scaleY(1);
                        setCropRect(r => r ? { ...r, x: node.x(), y: node.y(), width: newW, height: newH } : r);
                      }}
                      onTransform={(e) => {
                        // live update while transforming for better responsiveness
                        const node = e.target;
                        const newW = Math.max(1, node.width() * node.scaleX());
                        const newH = Math.max(1, node.height() * node.scaleY());
                        setCropRect(r => r ? { ...r, x: node.x(), y: node.y(), width: newW, height: newH } : r);
                      }}
                    />
                    <Transformer
                      ref={cropTransformerRef}
                      rotateEnabled={false}
                      anchorSize={8}
                      boundBoxFunc={(oldBox, newBox) => {
                        if (newBox.width < 6 || newBox.height < 6) return oldBox;
                        return newBox;
                      }}
                    />
                  </>
                )}

                {/* Loading overlay for images still decoding */}
                {objects.map(obj => {
                  if (obj.type !== 'image') return null;
                  if (!imageLoading[obj.id]) return null;
                  return (
                    <Group key={`loading-${obj.id}`} x={obj.x} y={obj.y}>
                      <Rect
                        x={0}
                        y={0}
                        width={obj.width}
                        height={obj.height}
                        fill={'rgba(0,0,0,0.35)'}
                        cornerRadius={6}
                      />
                      <KonvaText
                        x={8}
                        y={8}
                        text={'Loading image...'}
                        fontSize={14}
                        fill={'#fff'}
                      />
                    </Group>
                  );
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

              {Object.entries(cursors).map(([userId, cursor]) => {
                // Keep cursor marker and label readable regardless of canvas scale.
                // Konva will multiply node sizes by stage scale, so we divide by stageScale
                // to keep the on-screen size roughly constant.
                const scale = Math.max(0.0001, stageScale || 1);
                const baseRadius = 8; // desired on-screen radius in px
                const baseFont = 12; // desired on-screen font size in px
                const offsetX = 12; // desired on-screen offset for label
                const offsetY = 8; // desired on-screen vertical offset for label

                const radius = Math.max(2, baseRadius / scale);
                const fontSize = Math.max(8, baseFont / scale);
                const labelX = cursor.x + offsetX / scale;
                const labelY = cursor.y - offsetY / scale;

                const labelPaddingY = 4 / scale;
                const maxLabelWidth = 160 / scale; // max on-screen width in px
                return (
                  <g key={userId}>
                    <Circle
                      x={cursor.x}
                      y={cursor.y}
                      radius={radius}
                      fill={cursor.color}
                      opacity={0.7}
                    />
                    <Label x={labelX} y={labelY}>
                      <Tag
                        fill={'rgba(0,0,0,0.6)'}
                        cornerRadius={4 / scale}
                        stroke={'rgba(255,255,255,0.04)'}
                      />
                      <KonvaText
                        text={`${cursor.name} (Remote)`}
                        fontSize={fontSize}
                        fill={'#fff'}
                        padding={labelPaddingY}
                        width={Math.max(40 / scale, maxLabelWidth)}
                        ellipsis
                      />
                    </Label>
                  </g>
                );
              })}

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
        <div className="canvas-panel-right">
          <h3 className="section-title">
            Design
          </h3>

          {/* Fill Color */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: '#9d9d9d', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Fill Color
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
              <input 
                type="color" 
                value={fillColor} 
                onChange={(e) => setFillColor(e.target.value)}
                style={{ 
                  width: '48px', 
                  height: '36px', 
                  border: '1px solid #3e3e42', 
                  borderRadius: '4px',
                  cursor: 'pointer',
                  padding: '2px'
                }}
              />
              <span style={{ color: '#ddd', fontSize: '12px', fontFamily: 'monospace' }}>{fillColor}</span>
            </div>
            {/* Quick Color Palette */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
              {colorPalette.map((color) => (
                <button
                  key={color}
                  onClick={() => setFillColor(color)}
                  title={color}
                  className={`color-swatch ${fillColor === color ? 'active' : ''}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Image / Crop Controls */}
          {selectedIds.length === 1 && (() => {
            const selectedObj = objects.find(o => o.id === selectedIds[0]);
            if (!selectedObj || selectedObj.type !== 'image') return null;

            const startCrop = () => {
              // initialize crop rect to center half of image
              const w = (selectedObj.width || 100) * 0.6;
              const h = (selectedObj.height || 100) * 0.6;
              const x = (selectedObj.x || 0) + ((selectedObj.width || 0) - w) / 2;
              const y = (selectedObj.y || 0) + ((selectedObj.height || 0) - h) / 2;
              setCropRect({ x, y, width: w, height: h });
              setCropMode(true);
            };

            const cancelCrop = () => {
              setCropRect(null);
              setCropMode(false);
            };

            const commitCrop = async () => {
              if (!selectedObj.imageSrc || !cropRect) return;
              const imgEl = loadImage(selectedObj.imageSrc);
              if (!imgEl) return;
              await new Promise<void>((res) => {
                if (imgEl.complete && imgEl.naturalWidth) return res();
                imgEl.onload = () => res();
                imgEl.onerror = () => res();
              });

              // compute crop relative to the image's pixel space
              const sx = Math.max(0, Math.round(cropRect.x - (selectedObj.x || 0)));
              const sy = Math.max(0, Math.round(cropRect.y - (selectedObj.y || 0)));
              const sw = Math.max(1, Math.round(cropRect.width));
              const sh = Math.max(1, Math.round(cropRect.height));

              const canvas = document.createElement('canvas');
              canvas.width = sw;
              canvas.height = sh;
              const ctx = canvas.getContext('2d');
              if (!ctx) return;
              ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, sw, sh);
              const newDataUrl = canvas.toDataURL('image/png');

              const updated = objects.map(o => o.id === selectedObj.id ? { ...o, imageSrc: newDataUrl, cropX: undefined, cropY: undefined, cropWidth: undefined, cropHeight: undefined, width: sw, height: sh, scaleX: 1, scaleY: 1 } : o);
              setObjects(updated);
              saveToHistory(updated);
              broadcastUpdate('edit', updated.find(o => o.id === selectedObj.id));

              cancelCrop();
            };

            const resetSize = () => {
              if (!selectedObj.originalWidth || !selectedObj.originalHeight) return;
              const w = selectedObj.originalWidth;
              const h = selectedObj.originalHeight;
              const updated = objects.map(o => o.id === selectedObj.id ? { ...o, width: w, height: h, scaleX: 1, scaleY: 1 } : o);
              setObjects(updated);
              saveToHistory(updated);
              broadcastUpdate('edit', updated.find(o => o.id === selectedObj.id));
            };

            const fitToCanvas = () => {
              const maxW = canvasSize.width / (stageScale || 1) * 0.9;
              const maxH = canvasSize.height / (stageScale || 1) * 0.9;
              const ow = selectedObj.originalWidth || (selectedObj.width || 100);
              const oh = selectedObj.originalHeight || (selectedObj.height || 100);
              const ratio = Math.min(maxW / ow, maxH / oh, 1);
              const w = Math.round(ow * ratio);
              const h = Math.round(oh * ratio);
              const x = ((canvasSize.width / (stageScale || 1)) / 2) - (w / 2);
              const y = ((canvasSize.height / (stageScale || 1)) / 2) - (h / 2);
              const updated = objects.map(o => o.id === selectedObj.id ? { ...o, width: w, height: h, x, y, scaleX: 1, scaleY: 1 } : o);
              setObjects(updated);
              saveToHistory(updated);
              broadcastUpdate('edit', updated.find(o => o.id === selectedObj.id));
            };

            return (
              <div style={{ marginTop: '12px' }}>
                <div style={{ color: '#9d9d9d', fontSize: '11px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Image</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {!cropMode && <button className="btn-primary" onClick={startCrop}>Start Crop</button>}
                  {cropMode && (
                    <>
                      <button className="btn-primary" onClick={commitCrop}>Commit Crop</button>
                      <button className="btn-danger" onClick={cancelCrop}>Cancel</button>
                    </>
                  )}
                  <button className="btn-primary" onClick={resetSize}>Reset Size</button>
                  <button className="btn-primary" onClick={fitToCanvas}>Fit to Canvas</button>
                </div>
              </div>
            );
          })()}

          {/* Stroke Color */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: '#9d9d9d', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Stroke Color
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
              <input 
                type="color" 
                value={strokeColor} 
                onChange={(e) => setStrokeColor(e.target.value)}
                style={{ 
                  width: '48px', 
                  height: '36px', 
                  border: '1px solid #3e3e42', 
                  borderRadius: '4px',
                  cursor: 'pointer',
                  padding: '2px'
                }}
              />
              <span style={{ color: '#ddd', fontSize: '12px', fontFamily: 'monospace' }}>{strokeColor}</span>
            </div>
          </div>

          {/* Font Size */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: '#9d9d9d', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Font Size: {fontSize}px
            </label>
            <input 
              type="range" 
              value={fontSize} 
              onChange={(e) => setFontSize(Number(e.target.value))}
              min="12"
              max="72"
              style={{ 
                width: '100%',
                accentColor: '#007acc',
                marginBottom: '8px'
              }}
            />
            {/* Font Size Presets */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
              {[16, 20, 32, 48].map((size) => (
                <button
                  key={size}
                  onClick={() => setFontSize(size)}
                  style={{
                    padding: '6px 8px',
                    backgroundColor: fontSize === size ? '#007acc' : 'transparent',
                    color: fontSize === size ? 'white' : '#9d9d9d',
                    border: `1px solid ${fontSize === size ? '#007acc' : '#3e3e42'}`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    transition: 'all 0.2s'
                  }}
                >
                  {size}px
                </button>
              ))}
            </div>
          </div>

          {/* Stroke Width */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: '#9d9d9d', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
                accentColor: '#007acc',
                marginBottom: '8px'
              }}
            />
            {/* Stroke Width Presets */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
              {[1, 2, 4, 6].map((w) => (
                <button
                  key={w}
                  onClick={() => setStrokeWidth(w)}
                  style={{
                    padding: '6px 8px',
                    backgroundColor: strokeWidth === w ? '#007acc' : 'transparent',
                    color: strokeWidth === w ? 'white' : '#9d9d9d',
                    border: `1px solid ${strokeWidth === w ? '#007acc' : '#3e3e42'}`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    transition: 'all 0.2s'
                  }}
                >
                  {w}px
                </button>
              ))}
            </div>
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
                  fontWeight: 500,
                  marginBottom: '8px'
                }}
              >
                Duplicate (⌘D)
              </button>
            </>
          )}

          {/* Image Upload */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: '#9d9d9d', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Upload Image
            </label>
            <input 
              type="file" 
              accept="image/*"
              onChange={handleImageUpload}
              disabled={userRole === 'viewer'}
              style={{ 
                width: '100%',
                fontSize: '12px',
                cursor: userRole === 'viewer' ? 'not-allowed' : 'pointer',
                color: '#9d9d9d',
                opacity: userRole === 'viewer' ? 0.5 : 1
              }}
            />
          </div>

          {/* Export Button */}
          <button 
            onClick={exportCanvasPDF}
            style={{ 
              width: '100%',
              padding: '12px',
              backgroundColor: '#4caf50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              marginBottom: '8px'
            }}
          >
            📥 Export as PDF
          </button>

          <button 
            onClick={downloadCanvasPNG}
            style={{ 
              width: '100%',
              padding: '12px',
              backgroundColor: '#2196f3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              marginBottom: '8px'
            }}
          >
            📥 Export as PNG
          </button>

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
