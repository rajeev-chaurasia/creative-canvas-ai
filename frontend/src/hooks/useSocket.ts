import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE } from '../services/api';

export const useSocket = (projectUuid: string) => {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Get access token from localStorage (stored as 'token' by auth system)
    const accessToken = localStorage.getItem('token');
    
    if (!accessToken) {
      console.warn('⚠️ No access token found, cannot establish WebSocket connection');
      console.warn('Available tokens:', Object.keys(localStorage));
      return;
    }

    console.log('🔌 Attempting to connect to Socket.IO server...');

    // Connect to Socket.IO server with authentication
  socketRef.current = io(API_BASE, {
      transports: ['websocket', 'polling'],
      auth: {
        token: accessToken
      }
    });

    const socket = socketRef.current;

    // Listen for storage changes (token refresh) and reconnect with new token
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'token' && e.newValue && socket) {
        console.log('🔄 Token updated, reconnecting WebSocket with new token...');
        
        // Update auth and reconnect
        socket.auth = { token: e.newValue };
        socket.disconnect();
        socket.connect();
      }
    };

    // Also listen for custom token refresh event
    const handleTokenRefresh = () => {
      const newToken = localStorage.getItem('token');
      if (newToken && socket) {
        console.log('🔄 Token refreshed, reconnecting WebSocket with new token...');
        socket.auth = { token: newToken };
        socket.disconnect();
        socket.connect();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('tokenRefreshed', handleTokenRefresh);

    socket.on('connect', () => {
      console.log('✅ Connected to Socket.IO server');
      console.log('📡 Socket ID:', socket.id);
      // Join the project room
      console.log('📥 Joining project:', projectUuid);
      socket.emit('join_project', { projectUuid });
    });

    socket.on('disconnect', () => {
      console.log('❌ Disconnected from Socket.IO server');
    });

    socket.on('error', (error: any) => {
      console.error('⚠️ WebSocket error:', error);
    });

    // Cleanup on unmount
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('tokenRefreshed', handleTokenRefresh);
      
      if (socket) {
        socket.emit('leave_project', { projectUuid });
        socket.disconnect();
      }
    };
  }, [projectUuid]);

  return socketRef.current;
};
