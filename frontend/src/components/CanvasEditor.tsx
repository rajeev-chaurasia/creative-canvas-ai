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
  imageUrl?: string; // For AI images
  alt?: string; // For AI images
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

const ImageComponent = ({ imageUrl, ...props }: { imageUrl: string; [key: string]: any }) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImage(img);
    img.src = imageUrl;
  }, [imageUrl]);

  return image ? <KonvaImage {...props} image={image} /> : null;
};

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

  const [isGeneratingPalette, setIsGeneratingPalette] = useState(false);
  const [generatedPalette, setGeneratedPalette] = useState<string[]>([]);
  const [isAnalyzingCanvas, setIsAnalyzingCanvas] = useState(false);
  const [canvasAnalysis, setCanvasAnalysis] = useState<{
    description: string;
    keywords: string[];
    alt_text: string;
  } | null>(null);
  const [isGeneratingText, setIsGeneratingText] = useState(false);
  const [generatedText, setGeneratedText] = useState<{
    titles?: string;
    brief?: string;
    social_media?: string;
  }>({});
  const [isCreatingSmartGroups, setIsCreatingSmartGroups] = useState(false);
  const [smartGroups, setSmartGroups] = useState<Record<string, string[]>>({});
  const [isAnalyzingAsset, setIsAnalyzingAsset] = useState(false);
  const [assetAnalysis, setAssetAnalysis] = useState<{
    description: string;
    keywords: string[];
    alt_text: string;
  } | null>(null);
  const [isFindingAssets, setIsFindingAssets] = useState(false);
  const [assetSuggestions, setAssetSuggestions] = useState<Array<{
    id: string;
    url: string;
    url_large: string;
    alt: string;
    photographer: string;
    photographer_url: string;
  }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

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

  // AI Color Palette handler
  const handleGeneratePalette = async () => {
    if (selectedIds.length !== 1) return;
    
    const selectedObject = objects.find(obj => obj.id === selectedIds[0]);
    if (!selectedObject) return;

    setIsGeneratingPalette(true);
    
    try {
      // Capture the selected object as an image
      const imageBlob = await captureObjectAsImage(selectedObject);
      
      // Create FormData for the API call
      const formData = new FormData();
      formData.append('image', imageBlob, 'object.png');

      console.log('🎨 Calling AI Color Palette API...');
      
      // Call the AI endpoint
      const response = await apiClient.post('/api/ai/color-palette', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      console.log('🎨 AI Color Palette Response:', response.data);
      setGeneratedPalette(response.data.colors);
    } catch (error) {
      console.error('❌ Failed to generate palette:', error);
      // Fallback to mock data for development
      const mockPalette = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
      setGeneratedPalette(mockPalette);
    } finally {
      setIsGeneratingPalette(false);
    }
  };

  // AI Color Palette from entire canvas
  const handleGeneratePaletteFromCanvas = async () => {
    setIsGeneratingPalette(true);
    
    try {
      // Capture the entire canvas as an image
      const imageBlob = await captureCanvasAsImage();
      
      // Create FormData for the API call
      const formData = new FormData();
      formData.append('image', imageBlob, 'canvas.png');

      console.log('🎨 Calling AI Color Palette API for entire canvas...');
      
      // Call the AI endpoint
      const response = await apiClient.post('/api/ai/color-palette', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      console.log('🎨 AI Color Palette Response:', response.data);
      setGeneratedPalette(response.data.colors);
    } catch (error) {
      console.error('❌ Failed to generate palette:', error);
      // Fallback to mock data for development
      const mockPalette = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
      setGeneratedPalette(mockPalette);
    } finally {
      setIsGeneratingPalette(false);
    }
  };

  // AI Canvas Analysis handler
  const handleAnalyzeCanvas = async () => {
    setIsAnalyzingCanvas(true);
    
    try {
      // Capture the entire canvas as an image
      const imageBlob = await captureCanvasAsImage();
      
      // Create FormData for the API call
      const formData = new FormData();
      formData.append('image', imageBlob, 'canvas.png');

      console.log('🤖 Calling AI Canvas Analysis API...');
      
      // Call the AI endpoint
      const response = await apiClient.post('/api/ai/analyze-canvas', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      console.log('🤖 AI Canvas Analysis Response:', response.data);
      setCanvasAnalysis(response.data);
    } catch (error) {
      console.error('❌ Failed to analyze canvas:', error);
      // Fallback to mock data for development
      const mockAnalysis = {
        description: "A creative canvas with various geometric shapes and text elements arranged in an artistic composition. The design features a modern aesthetic with clean lines and vibrant colors.",
        keywords: ["geometric", "shapes", "text", "artistic", "composition", "creative", "modern", "design"],
        alt_text: "Creative canvas showing geometric shapes and text arranged artistically"
      };
      setCanvasAnalysis(mockAnalysis);
    } finally {
      setIsAnalyzingCanvas(false);
    }
  };

  // AI Text Generation handler
  const handleGenerateText = async (textType: 'titles' | 'brief' | 'social_media') => {
    if (!canvasAnalysis) return;

    setIsGeneratingText(true);
    
    try {
      console.log('✍️ Calling AI Text Generation API...', { textType, description: canvasAnalysis.description });
      
      // Call the AI endpoint with the canvas description
      const response = await apiClient.post('/api/ai/generate-text', {
        text_type: textType,
        description: canvasAnalysis.description
      });

      console.log('✍️ AI Text Generation Response:', response.data);
      
      // Store the result by text type
      if (textType === 'titles') {
        setGeneratedText(prev => ({ ...prev, titles: Array.isArray(response.data.titles) ? response.data.titles.join(', ') : response.data.titles }));
      } else if (textType === 'brief') {
        setGeneratedText(prev => ({ ...prev, brief: response.data.brief }));
      } else if (textType === 'social_media') {
        setGeneratedText(prev => ({ ...prev, social_media: Array.isArray(response.data.captions) ? response.data.captions.join('\n\n') : response.data.captions }));
      }
    } catch (error) {
      console.error('❌ Failed to generate text:', error);
      // Fallback to mock data for development
      const mockTexts = {
        titles: "Creative Design Concept, Artistic Composition, Modern Visual Design, Geometric Artwork, Creative Canvas Project, Abstract Design Elements, Contemporary Art Piece",
        brief: "This creative canvas showcases a modern approach to visual design, combining geometric shapes and typography to create an engaging artistic composition. The design demonstrates innovative thinking with clean lines, vibrant colors, and thoughtful spacing that creates visual harmony and professional appeal.",
        social_media: "🎨 Just created this amazing geometric composition! The perfect blend of shapes, colors, and typography. #CreativeDesign #ArtisticVision #ModernArt #DesignInspiration #GeometricArt"
      };
      
      // Store the mock result by text type
      if (textType === 'titles') {
        setGeneratedText(prev => ({ ...prev, titles: mockTexts.titles }));
      } else if (textType === 'brief') {
        setGeneratedText(prev => ({ ...prev, brief: mockTexts.brief }));
      } else if (textType === 'social_media') {
        setGeneratedText(prev => ({ ...prev, social_media: mockTexts.social_media }));
      }
    } finally {
      setIsGeneratingText(false);
    }
  };

  // AI Smart Groups handler
  const handleSmartGroups = async () => {
    setIsCreatingSmartGroups(true);
    
    try {
      // Prepare asset data for AI analysis
      const assetData = objects.map(obj => {
        const keywords: string[] = [obj.type];
        
        // Add visual properties
        if (obj.fill) keywords.push('colored', obj.fill);
        else keywords.push('uncolored');
        
        if (obj.stroke) keywords.push('outlined', obj.stroke);
        else keywords.push('no-outline');
        
        // Add size information
        if (obj.width && obj.height) {
          const area = obj.width * obj.height;
          if (area > 10000) keywords.push('large');
          else if (area > 1000) keywords.push('medium');
          else keywords.push('small');
        }
        
        // Add text content for text objects
        if (obj.type === 'text' && obj.text) {
          keywords.push('text-content', obj.text.toLowerCase().substring(0, 20));
        }
        
        // Add image information
        if (obj.type === 'image' && obj.alt) {
          keywords.push('image', obj.alt.toLowerCase().substring(0, 20));
        }
        
        // Add shape-specific keywords
        if (obj.type === 'rect') keywords.push('rectangle', 'square', 'geometric');
        if (obj.type === 'circle') keywords.push('circle', 'round', 'geometric');
        if (obj.type === 'line') keywords.push('line', 'stroke', 'path');
        
        return {
          id: obj.id,
          type: obj.type,
          keywords: keywords
        };
      });

      console.log('📦 Calling AI Smart Groups API...', { assetCount: assetData.length });
      
      // Call the AI endpoint
      const response = await apiClient.post('/api/ai/smart-groups', {
        assets: assetData
      });

      console.log('📦 AI Smart Groups Response:', response.data);
      setSmartGroups(response.data.groups);
    } catch (error) {
      console.error('❌ Failed to create smart groups:', error);
      // Fallback to mock data for development
      const mockGroups: Record<string, string[]> = {};
      
      // Group by type first
      const typeGroups = {
        "Geometric Shapes": objects.filter(obj => obj.type === 'rect' || obj.type === 'circle'),
        "Text Elements": objects.filter(obj => obj.type === 'text'),
        "Lines & Strokes": objects.filter(obj => obj.type === 'line'),
        "Images": objects.filter(obj => obj.type === 'image')
      };
      
      // Create groups only if they have elements
      Object.entries(typeGroups).forEach(([groupName, objs]) => {
        if (objs.length > 0) {
          mockGroups[groupName] = objs.map(obj => obj.id);
        }
      });
      
      // Additional grouping by color if multiple objects have same color
      const colorGroups: Record<string, CanvasObject[]> = {};
      objects.forEach(obj => {
        if (obj.fill && obj.fill !== '#000000') {
          if (!colorGroups[obj.fill]) colorGroups[obj.fill] = [];
          colorGroups[obj.fill].push(obj);
        }
      });
      
      // Add color groups if they have 2+ objects
      Object.entries(colorGroups).forEach(([color, objs]) => {
        if (objs.length >= 2) {
          mockGroups[`${color} Elements`] = objs.map(obj => obj.id);
        }
      });
      setSmartGroups(mockGroups);
    } finally {
      setIsCreatingSmartGroups(false);
    }
  };

  // AI Asset Analysis handler
  const handleAnalyzeAsset = async () => {
    if (selectedIds.length !== 1) return;
    
    const selectedObject = objects.find(obj => obj.id === selectedIds[0]);
    if (!selectedObject) return;

    setIsAnalyzingAsset(true);
    
    try {
      // Capture the selected object as an image
      const imageBlob = await captureObjectAsImage(selectedObject);
      
      // Create FormData for the API call
      const formData = new FormData();
      formData.append('image', imageBlob, 'asset.png');

      console.log('🔍 Calling AI Asset Analysis API...', { objectType: selectedObject.type });
      
      // Call the AI endpoint
      const response = await apiClient.post('/api/ai/analyze-asset', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      console.log('🔍 AI Asset Analysis Response:', response.data);
      setAssetAnalysis(response.data);
    } catch (error) {
      console.error('❌ Failed to analyze asset:', error);
      // Fallback to mock data for development
      const mockAnalysis = {
        description: `A ${selectedObject.type} element with ${selectedObject.fill ? `fill color ${selectedObject.fill}` : 'no fill'} and ${selectedObject.stroke ? `stroke color ${selectedObject.stroke}` : 'no stroke'}. This element contributes to the overall design composition.`,
        keywords: [selectedObject.type, "canvas", "element", "design", selectedObject.fill ? "colored" : "uncolored", selectedObject.stroke ? "outlined" : "no-outline"],
        alt_text: `${selectedObject.type} element on canvas with ${selectedObject.fill ? 'fill' : 'no fill'} and ${selectedObject.stroke ? 'outline' : 'no outline'}`
      };
      setAssetAnalysis(mockAnalysis);
    } finally {
      setIsAnalyzingAsset(false);
    }
  };

  // AI Asset Suggestions handler
  const handleFindMoreAssets = async () => {
    if (!assetAnalysis) return;

    setIsFindingAssets(true);
    
    try {
      console.log('🔍 Calling AI Asset Suggestions API...', { keywords: assetAnalysis.keywords });
      
      // Call the AI endpoint with the keywords from asset analysis
      const response = await apiClient.post('/api/ai/asset-suggestions', {
        keywords: assetAnalysis.keywords
      });

      console.log('🔍 AI Asset Suggestions Response:', response.data);
      setAssetSuggestions(response.data.suggestions);
      setShowSuggestions(true);
    } catch (error) {
      console.error('❌ Failed to find asset suggestions:', error);
      // Fallback to mock data for development
      const mockSuggestions = [
        {
          id: "1",
          url: "https://images.pexels.com/photos/1/pexels-photo-1.jpeg?auto=compress&cs=tinysrgb&w=400",
          url_large: "https://images.pexels.com/photos/1/pexels-photo-1.jpeg?auto=compress&cs=tinysrgb&w=1200",
          alt: "Modern geometric design element",
          photographer: "Design Studio",
          photographer_url: "https://www.pexels.com/@design-studio"
        },
        {
          id: "2",
          url: "https://images.pexels.com/photos/2/pexels-photo-2.jpeg?auto=compress&cs=tinysrgb&w=400",
          url_large: "https://images.pexels.com/photos/2/pexels-photo-2.jpeg?auto=compress&cs=tinysrgb&w=1200",
          alt: "Abstract creative composition",
          photographer: "Creative Artist",
          photographer_url: "https://www.pexels.com/@creative-artist"
        },
        {
          id: "3",
          url: "https://images.pexels.com/photos/3/pexels-photo-3.jpeg?auto=compress&cs=tinysrgb&w=400",
          url_large: "https://images.pexels.com/photos/3/pexels-photo-3.jpeg?auto=compress&cs=tinysrgb&w=1200",
          alt: "Minimalist design pattern",
          photographer: "Minimal Design",
          photographer_url: "https://www.pexels.com/@minimal-design"
        },
        {
          id: "4",
          url: "https://images.pexels.com/photos/4/pexels-photo-4.jpeg?auto=compress&cs=tinysrgb&w=400",
          url_large: "https://images.pexels.com/photos/4/pexels-photo-4.jpeg?auto=compress&cs=tinysrgb&w=1200",
          alt: "Colorful artistic element",
          photographer: "Color Studio",
          photographer_url: "https://www.pexels.com/@color-studio"
        }
      ];
      setAssetSuggestions(mockSuggestions);
      setShowSuggestions(true);
    } finally {
      setIsFindingAssets(false);
    }
  };

  // Standalone Asset Suggestions by Keywords
  const handleFindMoreAssetsByKeywords = async (keywords: string) => {
    setIsFindingAssets(true);
    
    try {
      console.log('🔍 Calling AI Asset Suggestions API with keywords...', { keywords });
      
      // Call the AI endpoint with the provided keywords
      const response = await apiClient.post('/api/ai/asset-suggestions', {
        keywords: keywords.split(',').map(k => k.trim())
      });

      console.log('🔍 AI Asset Suggestions Response:', response.data);
      setAssetSuggestions(response.data.suggestions);
      setShowSuggestions(true);
    } catch (error) {
      console.error('❌ Failed to find assets:', error);
      // Fallback to mock data for development
      const mockSuggestions = [
        { id: "1", url: 'https://via.placeholder.com/300x200/FF6B6B/FFFFFF?text=Mock+Image+1', url_large: 'https://via.placeholder.com/600x400/FF6B6B/FFFFFF?text=Mock+Image+1', alt: 'Mock image 1', photographer: 'Mock Photographer', photographer_url: '#' },
        { id: "2", url: 'https://via.placeholder.com/300x200/4ECDC4/FFFFFF?text=Mock+Image+2', url_large: 'https://via.placeholder.com/600x400/4ECDC4/FFFFFF?text=Mock+Image+2', alt: 'Mock image 2', photographer: 'Mock Photographer', photographer_url: '#' },
        { id: "3", url: 'https://via.placeholder.com/300x200/45B7D1/FFFFFF?text=Mock+Image+3', url_large: 'https://via.placeholder.com/600x400/45B7D1/FFFFFF?text=Mock+Image+3', alt: 'Mock image 3', photographer: 'Mock Photographer', photographer_url: '#' }
      ];
      setAssetSuggestions(mockSuggestions);
      setShowSuggestions(true);
    } finally {
      setIsFindingAssets(false);
    }
  };

  // Image capture functions
  const captureCanvasAsImage = async (): Promise<Blob> => {
    const stage = stageRef.current;
    if (!stage) throw new Error('Stage not available');

    const dataURL = stage.toDataURL({
      mimeType: 'image/png',
      quality: 1,
      pixelRatio: 1
    });

    const response = await fetch(dataURL);
    return await response.blob();
  };

  const captureObjectAsImage = async (object: CanvasObject): Promise<Blob> => {
    const stage = stageRef.current;
    if (!stage) throw new Error('Stage not available');

    const node = layerRef.current?.findOne(`#${object.id}`);
    if (!node) throw new Error('Object node not found');

    const box = node.getClientRect();
    
    const tempStage = new Konva.Stage({
      container: document.createElement('div'),
      width: box.width,
      height: box.height
    });

    const tempLayer = new Konva.Layer();
    tempStage.add(tempLayer);

    const clonedNode = node.clone();
    clonedNode.x(0);
    clonedNode.y(0);
    tempLayer.add(clonedNode);
    tempLayer.draw();

    const dataURL = tempStage.toDataURL({
      mimeType: 'image/png',
      quality: 1,
      pixelRatio: 1
    });

    tempStage.destroy();

    const response = await fetch(dataURL);
    return await response.blob();
  };

  const addImageToCanvas = async (imageUrl: string, alt: string) => {
    try {
      // Load the image
      const image = new Image();
      image.crossOrigin = 'anonymous';
      
      image.onload = () => {
        const stage = stageRef.current;
        if (!stage) return;

        // Get canvas center
        const centerX = stage.width() / 2;
        const centerY = stage.height() / 2;

        // Create a new image object
        const newImageObject: CanvasObject = {
          id: `image-${Date.now()}`,
          type: 'image',
          x: centerX - image.width / 2,
          y: centerY - image.height / 2,
          width: image.width,
          height: image.height,
          imageUrl: imageUrl,
          alt: alt
        };

        const updated = [...objects, newImageObject];
        setObjects(updated);
        saveToHistory(updated);
        broadcastUpdate('add', newImageObject);
      };

      image.src = imageUrl;
    } catch (error) {
      console.error('Failed to add image to canvas:', error);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.evt.preventDefault();
  };

  const handleDrop = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.evt.preventDefault();
    
    try {
      const data = JSON.parse(e.evt.dataTransfer?.getData('application/json') || '{}');
      if (data.type === 'image' && data.url) {
        const stage = stageRef.current;
        if (!stage) return;

        // Get drop position relative to stage
        const pos = stage.getRelativePointerPosition();
        if (!pos) return;

        addImageToCanvasAtPosition(data.url, data.alt, pos.x, pos.y);
      }
    } catch (error) {
      console.error('Failed to handle drop:', error);
    }
  };

  const addImageToCanvasAtPosition = async (imageUrl: string, alt: string, x: number, y: number) => {
    try {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      
      image.onload = () => {
        const newImageObject: CanvasObject = {
          id: `image-${Date.now()}`,
          type: 'image',
          x: x - image.width / 2,
          y: y - image.height / 2,
          width: image.width,
          height: image.height,
          imageUrl: imageUrl,
          alt: alt
        };

        const updated = [...objects, newImageObject];
        setObjects(updated);
        saveToHistory(updated);
        broadcastUpdate('add', newImageObject);
      };

      image.src = imageUrl;
    } catch (error) {
      console.error('Failed to add image to canvas:', error);
    }
  };

  return (
    <>
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}
      </style>
      <div className="canvas-editor-root" style={{ height: '100vh', overflow: 'hidden' }}>
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

          {/* AI Features in Top Navbar */}
          <div style={{ display: 'flex', gap: '4px', marginLeft: '16px' }}>
            <button
              onClick={handleAnalyzeCanvas}
              disabled={isAnalyzingCanvas}
              title="Analyze Canvas"
              style={{
                background: isAnalyzingCanvas ? '#555' : '#007acc',
                border: '1px solid #3e3e42',
                color: 'white',
                cursor: isAnalyzingCanvas ? 'not-allowed' : 'pointer',
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                transition: 'all 0.2s',
                opacity: isAnalyzingCanvas ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              {isAnalyzingCanvas ? '⏳' : '🤖'} Analyze
            </button>
            <button
              onClick={handleSmartGroups}
              disabled={isCreatingSmartGroups}
              title="Auto-Group Elements"
              style={{
                background: isCreatingSmartGroups ? '#555' : '#28a745',
                border: '1px solid #3e3e42',
                color: 'white',
                cursor: isCreatingSmartGroups ? 'not-allowed' : 'pointer',
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                transition: 'all 0.2s',
                opacity: isCreatingSmartGroups ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              {isCreatingSmartGroups ? '⏳' : '📦'} Group
            </button>
            <button
              onClick={() => {
                if (selectedIds.length === 1) {
                  handleGeneratePalette();
                } else {
                  handleGeneratePaletteFromCanvas();
                }
              }}
              disabled={isGeneratingPalette}
              title="Generate Color Palette"
              style={{
                background: isGeneratingPalette ? '#555' : '#ff6b35',
                border: '1px solid #3e3e42',
                color: 'white',
                cursor: isGeneratingPalette ? 'not-allowed' : 'pointer',
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                transition: 'all 0.2s',
                opacity: isGeneratingPalette ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              {isGeneratingPalette ? '⏳' : '🎨'} Palette
            </button>
            <button
              onClick={() => {
                const keywords = prompt('Enter keywords to search for images (e.g., "modern design, abstract, blue"):');
                if (keywords && keywords.trim()) {
                  handleFindMoreAssetsByKeywords(keywords.trim());
                }
              }}
              disabled={isFindingAssets}
              title="Find Images by Keywords"
              style={{
                background: isFindingAssets ? '#555' : '#9c27b0',
                border: '1px solid #3e3e42',
                color: 'white',
                cursor: isFindingAssets ? 'not-allowed' : 'pointer',
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                transition: 'all 0.2s',
                opacity: isFindingAssets ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              {isFindingAssets ? '⏳' : '🔍'} Images
            </button>
          </div>

          {/* Generated Color Palette Display */}
          {generatedPalette.length > 0 && (
            <div style={{ display: 'flex', gap: '4px', marginLeft: '16px', alignItems: 'center' }}>
              <span style={{ color: '#e1e1e1', fontSize: '12px', fontWeight: 500 }}>Generated Colors:</span>
              <div style={{ display: 'flex', gap: '2px' }}>
                {generatedPalette.map((color, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setStrokeColor(color);
                      setFillColor(color);
                    }}
                    style={{
                      width: '24px',
                      height: '24px',
                      backgroundColor: color,
                      border: '2px solid #3e3e42',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#007acc';
                      e.currentTarget.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#3e3e42';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    title={`Click to set as stroke & fill color: ${color}`}
                  >
                    <span style={{ color: 'white', fontSize: '8px', fontWeight: 'bold', textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}>
                      {index + 1}
                    </span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setGeneratedPalette([])}
                style={{
                  background: 'none',
                  border: '1px solid #3e3e42',
                  color: '#888',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  marginLeft: '8px'
                }}
                title="Clear palette"
              >
                ✕
              </button>
            </div>
          )}

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

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: 'calc(100vh - 48px)' }}>
        {/* Left Toolbar */}
        <div className="canvas-toolbar-left" style={{ overflowY: 'auto', height: '100%' }}>

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
          <ToolButton 
            active={false} 
            onClick={() => {
              if (window.confirm('Are you sure you want to clear the entire canvas? This action cannot be undone.')) {
                setObjects([]);
                setSelectedIds([]);
                setHistory([]);
                setHistoryStep(-1);
              }
            }}
            icon="🧹"
            label="Clear Canvas"
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
            onDrop={handleDrop}
            onDragOver={handleDragOver}
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
                  // Handle AI images (imageUrl) vs regular images (imageSrc)
                  if (obj.imageUrl) {
                    return (
                      <ImageComponent
                        key={obj.id}
                        id={obj.id}
                        x={obj.x}
                        y={obj.y}
                        width={obj.width}
                        height={obj.height}
                        rotation={obj.rotation}
                        scaleX={obj.scaleX}
                        scaleY={obj.scaleY}
                        draggable={tool === 'select' && userRole !== 'viewer'}
                        onClick={(e: Konva.KonvaEventObject<MouseEvent>) => handleObjectClick(e, obj.id)}
                        onTransformEnd={handleTransformEnd}
                        imageUrl={obj.imageUrl}
                      />
                    );
                  } else {
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
        <div className="canvas-panel-right" style={{ overflowY: 'auto', height: '100%' }}>
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

          {/* AI Features Overview */}
          <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#1e1e1e', borderRadius: '8px', border: '1px solid #3e3e42' }}>
            <h4 style={{ color: '#e1e1e1', fontSize: '13px', fontWeight: 600, margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ✨ AI Features
            </h4>
            <p style={{ color: '#9d9d9d', fontSize: '11px', margin: '0 0 12px 0', lineHeight: '1.4' }}>
              Use AI to enhance your creative workflow
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#e1e1e1' }}>
                <span>🤖</span>
                <span>Analyze canvas for insights</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#e1e1e1' }}>
                <span>🎨</span>
                <span>Generate color palettes</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#e1e1e1' }}>
                <span>📦</span>
                <span>Auto-group similar elements</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#e1e1e1' }}>
                <span>✍️</span>
                <span>Generate text content</span>
              </div>
            </div>
          </div>

          {/* AI Color Palette Section */}
          {selectedIds.length === 1 && (
            <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#1e1e1e', borderRadius: '6px', border: '1px solid #3e3e42' }}>
              <h4 style={{ color: '#e1e1e1', fontSize: '13px', fontWeight: 600, margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🎨 AI Color Palette
              </h4>
              <p style={{ color: '#9d9d9d', fontSize: '11px', margin: '0 0 12px 0', lineHeight: '1.4' }}>
                Generate a color palette from the selected object
              </p>
              <button
                onClick={handleGeneratePalette}
                disabled={isGeneratingPalette}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: isGeneratingPalette ? '#555' : '#007acc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isGeneratingPalette ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                  marginBottom: '12px',
                  opacity: isGeneratingPalette ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                {isGeneratingPalette ? (
                  <>
                    <div style={{ width: '12px', height: '12px', border: '2px solid #fff', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    Analyzing...
                  </>
                ) : (
                  <>
                    ✨ Generate Palette
                  </>
                )}
              </button>
              
              {generatedPalette.length > 0 && (
                <div>
                  <label style={{ display: 'block', color: '#9d9d9d', fontSize: '11px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Generated Colors
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                    {generatedPalette.map((color, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setStrokeColor(color);
                          setFillColor(color);
                        }}
                        style={{
                          width: '36px',
                          height: '36px',
                          backgroundColor: color,
                          border: '2px solid #3e3e42',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#007acc';
                          e.currentTarget.style.transform = 'scale(1.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#3e3e42';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                        title={`Click to set as stroke & fill color: ${color}`}
                      >
                        <span style={{ color: 'white', fontSize: '10px', fontWeight: 'bold', textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}>
                          {index + 1}
                        </span>
                      </button>
                    ))}
                  </div>
                  <p style={{ color: '#666', fontSize: '10px', margin: 0, fontStyle: 'italic' }}>
                    Click any color to apply it as your active stroke & fill color
                  </p>
                </div>
              )}
            </div>
          )}

          {/* AI Asset Analysis Section */}
          {selectedIds.length === 1 && (
            <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#1e1e1e', borderRadius: '6px', border: '1px solid #3e3e42' }}>
              <h4 style={{ color: '#e1e1e1', fontSize: '13px', fontWeight: 600, margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🔍 AI Asset Analysis
              </h4>
              <button
                onClick={handleAnalyzeAsset}
                disabled={isAnalyzingAsset}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: isAnalyzingAsset ? '#555' : '#007acc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isAnalyzingAsset ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                  marginBottom: '12px',
                  opacity: isAnalyzingAsset ? 0.6 : 1
                }}
              >
                {isAnalyzingAsset ? 'Analyzing...' : 'Analyze Asset'}
              </button>
              
              {assetAnalysis && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', color: '#9d9d9d', fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Description
                    </label>
                    <p style={{ color: '#e1e1e1', fontSize: '12px', margin: 0, lineHeight: '1.4' }}>
                      {assetAnalysis.description}
                    </p>
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', color: '#9d9d9d', fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Keywords
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {assetAnalysis.keywords.map((keyword, index) => (
                        <span
                          key={index}
                          style={{
                            backgroundColor: '#007acc',
                            color: 'white',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            fontSize: '10px',
                            fontWeight: 500
                          }}
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', color: '#9d9d9d', fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Alt Text
                    </label>
                    <p style={{ color: '#e1e1e1', fontSize: '12px', margin: 0, lineHeight: '1.4' }}>
                      {assetAnalysis.alt_text}
                    </p>
                  </div>
                  
                  {/* Find More Like This Button */}
                  <button
                    onClick={handleFindMoreAssets}
                    disabled={isFindingAssets}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: isFindingAssets ? '#555' : '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: isFindingAssets ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      fontWeight: 500,
                      marginTop: '12px',
                      opacity: isFindingAssets ? 0.6 : 1
                    }}
                  >
                    {isFindingAssets ? 'Finding...' : 'Find More Like This'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* AI Canvas Analysis Results */}
          {canvasAnalysis && (
            <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#1e1e1e', borderRadius: '8px', border: '2px solid #007acc' }}>
              <h4 style={{ color: '#e1e1e1', fontSize: '13px', fontWeight: 600, margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🤖 Canvas Analysis Complete
              </h4>
              <p style={{ color: '#9d9d9d', fontSize: '11px', margin: '0 0 12px 0', lineHeight: '1.4' }}>
                AI has analyzed your canvas and provided insights below
              </p>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', color: '#9d9d9d', fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Description
                </label>
                <div style={{ padding: '8px', backgroundColor: '#2d2d30', borderRadius: '4px', border: '1px solid #3e3e42' }}>
                  <p style={{ color: '#e1e1e1', fontSize: '12px', margin: 0, lineHeight: '1.4' }}>
                    {canvasAnalysis.description}
                  </p>
                </div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', color: '#9d9d9d', fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Keywords
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {canvasAnalysis.keywords.map((keyword, index) => (
                    <span
                      key={index}
                      style={{
                        backgroundColor: '#007acc',
                        color: 'white',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 500
                      }}
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', color: '#9d9d9d', fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Alt Text
                </label>
                <div style={{ padding: '8px', backgroundColor: '#2d2d30', borderRadius: '4px', border: '1px solid #3e3e42' }}>
                  <p style={{ color: '#e1e1e1', fontSize: '12px', margin: 0, lineHeight: '1.4' }}>
                    {canvasAnalysis.alt_text}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* AI Text Generation */}
          {canvasAnalysis && (
            <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#1e1e1e', borderRadius: '8px', border: '1px solid #3e3e42' }}>
              <h4 style={{ color: '#e1e1e1', fontSize: '13px', fontWeight: 600, margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ✍️ AI Text Generation
              </h4>
              <p style={{ color: '#9d9d9d', fontSize: '11px', margin: '0 0 12px 0', lineHeight: '1.4' }}>
                Generate content based on your canvas analysis
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  onClick={() => handleGenerateText('titles')}
                  disabled={isGeneratingText}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: isGeneratingText ? '#555' : '#007acc',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isGeneratingText ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                    fontWeight: 500,
                    opacity: isGeneratingText ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  {isGeneratingText ? (
                    <>
                      <div style={{ width: '12px', height: '12px', border: '2px solid #fff', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                      Generating...
                    </>
                  ) : (
                    <>
                      💡 Generate Title Ideas
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleGenerateText('brief')}
                  disabled={isGeneratingText}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: isGeneratingText ? '#555' : '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isGeneratingText ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                    fontWeight: 500,
                    opacity: isGeneratingText ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  {isGeneratingText ? (
                    <>
                      <div style={{ width: '12px', height: '12px', border: '2px solid #fff', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                      Generating...
                    </>
                  ) : (
                    <>
                      📝 Generate Brief
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleGenerateText('social_media')}
                  disabled={isGeneratingText}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: isGeneratingText ? '#555' : '#ff6b35',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isGeneratingText ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                    fontWeight: 500,
                    opacity: isGeneratingText ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  {isGeneratingText ? (
                    <>
                      <div style={{ width: '12px', height: '12px', border: '2px solid #fff', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                      Generating...
                    </>
                  ) : (
                    <>
                      📱 Generate Social Media
                    </>
                  )}
                </button>
              </div>
              
              {(generatedText.titles || generatedText.brief || generatedText.social_media) && (
                <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#2d2d30', borderRadius: '6px', border: '1px solid #3e3e42' }}>
                  <label style={{ display: 'block', color: '#9d9d9d', fontSize: '11px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Generated Content
                  </label>
                  
                  {/* Titles */}
                  {generatedText.titles && (
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', color: '#007acc', fontSize: '11px', marginBottom: '4px', fontWeight: 600 }}>
                        💡 Title Ideas
                      </label>
                      <div style={{ padding: '8px', backgroundColor: '#1e1e1e', borderRadius: '4px', border: '1px solid #3e3e42' }}>
                        <p style={{ color: '#e1e1e1', fontSize: '12px', margin: 0, lineHeight: '1.5' }}>
                          {generatedText.titles}
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {/* Brief */}
                  {generatedText.brief && (
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', color: '#28a745', fontSize: '11px', marginBottom: '4px', fontWeight: 600 }}>
                        📝 Creative Brief
                      </label>
                      <div style={{ padding: '8px', backgroundColor: '#1e1e1e', borderRadius: '4px', border: '1px solid #3e3e42' }}>
                        <p style={{ color: '#e1e1e1', fontSize: '12px', margin: 0, lineHeight: '1.5', whiteSpace: 'pre-line' }}>
                          {generatedText.brief}
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {/* Social Media */}
                  {generatedText.social_media && (
                    <div>
                      <label style={{ display: 'block', color: '#ff6b35', fontSize: '11px', marginBottom: '4px', fontWeight: 600 }}>
                        📱 Social Media Captions
                      </label>
                      <div style={{ padding: '8px', backgroundColor: '#1e1e1e', borderRadius: '4px', border: '1px solid #3e3e42' }}>
                        <p style={{ color: '#e1e1e1', fontSize: '12px', margin: 0, lineHeight: '1.5', whiteSpace: 'pre-line' }}>
                          {generatedText.social_media}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* AI Smart Groups Results */}
          {Object.keys(smartGroups).length > 0 && (
            <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#1e1e1e', borderRadius: '8px', border: '2px solid #28a745' }}>
              <h4 style={{ color: '#e1e1e1', fontSize: '13px', fontWeight: 600, margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📦 Smart Groups Created
              </h4>
              <p style={{ color: '#9d9d9d', fontSize: '11px', margin: '0 0 12px 0', lineHeight: '1.4' }}>
                AI has automatically grouped your canvas elements
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.entries(smartGroups).map(([groupName, objectIds]) => (
                  <div key={groupName} style={{ padding: '12px', backgroundColor: '#2d2d30', borderRadius: '6px', border: '1px solid #3e3e42' }}>
                    <div style={{ color: '#e1e1e1', fontSize: '12px', fontWeight: 500, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '14px' }}>📁</span>
                      {groupName}
                    </div>
                    <div style={{ color: '#9d9d9d', fontSize: '11px' }}>
                      {objectIds.length} element{objectIds.length !== 1 ? 's' : ''} grouped together
                    </div>
                  </div>
                ))}
              </div>
            </div>
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

      {/* Asset Suggestions Sidebar */}
      {showSuggestions && (
        <div style={{
          position: 'fixed',
          top: '48px',
          right: '0',
          width: '320px',
          height: 'calc(100vh - 48px)',
          backgroundColor: '#252526',
          borderLeft: '1px solid #3e3e42',
          zIndex: 1000,
          overflowY: 'auto',
          padding: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ color: '#e1e1e1', fontSize: '16px', fontWeight: 600, margin: 0 }}>
              Asset Suggestions
            </h3>
            <button
              onClick={() => setShowSuggestions(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                fontSize: '20px',
                padding: '4px'
              }}
              title="Close suggestions"
            >
              ×
            </button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {assetSuggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                style={{
                  border: '1px solid #3e3e42',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#007acc'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3e3e42'}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/json', JSON.stringify({
                    type: 'image',
                    url: suggestion.url_large,
                    alt: suggestion.alt
                  }));
                }}
                onClick={() => {
                  addImageToCanvas(suggestion.url_large, suggestion.alt);
                }}
              >
                <img
                  src={suggestion.url}
                  alt={suggestion.alt}
                  style={{
                    width: '100%',
                    height: '120px',
                    objectFit: 'cover'
                  }}
                />
                <div style={{ padding: '12px' }}>
                  <p style={{ color: '#e1e1e1', fontSize: '12px', margin: '0 0 8px 0', lineHeight: '1.4' }}>
                    {suggestion.alt}
                  </p>
                  <p style={{ color: '#9d9d9d', fontSize: '11px', margin: 0 }}>
                    by {suggestion.photographer}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
    </>
  );
};

export default CanvasEditor;
