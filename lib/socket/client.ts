'use client';

import { io, Socket } from 'socket.io-client';
import { JWTPayload } from '../auth';

let socket: Socket | null = null;
let isAuthenticating = false;

export function getSocket(token: string): Socket {
  // 토큰이 없으면 에러
  if (!token) {
    throw new Error('Token is required for socket connection');
  }

  // 기존 소켓이 있고 연결되어 있는 경우 재사용
  if (socket && socket.connected) {
    return socket;
  }

  // 인증 중이면 기존 소켓 반환 (중복 연결 방지)
  if (isAuthenticating && socket) {
    return socket;
  }

  // 기존 소켓이 있지만 연결되지 않았거나 토큰이 변경된 경우 재연결
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  isAuthenticating = true;

  socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000', {
    path: '/api/socket',
    auth: {
      token,
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
    autoConnect: true,
  });

  socket.on('connect', () => {
    console.log('Socket connected');
    isAuthenticating = false;
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    isAuthenticating = false;
    
    // 서버가 명시적으로 연결을 끊은 경우 (인증 실패 등)
    if (reason === 'io server disconnect') {
      const currentToken = localStorage.getItem('token');
      if (!currentToken && typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  });

  socket.on('connect_error', async (error) => {
    // 인증 오류인 경우 재연결 중단
    if (error.message && error.message.includes('Authentication error')) {
      console.warn('Socket authentication failed:', error.message);
      
      // 재연결 시도 중단
      socket?.disconnect();
      isAuthenticating = false;
      
      // 토큰 검증
      const currentToken = localStorage.getItem('token');
      if (currentToken) {
        try {
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${currentToken}` },
          });
          
          if (!res.ok) {
            // 토큰이 유효하지 않음
            console.warn('Token is invalid, redirecting to login...');
            localStorage.removeItem('token');
            if (typeof window !== 'undefined') {
              window.location.href = '/login';
            }
          } else {
            // 토큰은 유효하지만 소켓 인증 실패 - 잠시 후 재시도
            console.log('Token is valid, will retry socket connection...');
            setTimeout(() => {
              if (typeof window !== 'undefined') {
                const token = localStorage.getItem('token');
                if (token) {
                  socket = null;
                  getSocket(token);
                }
              }
            }, 2000);
          }
        } catch (err) {
          console.error('Failed to verify token:', err);
          // 네트워크 오류는 무시하고 재연결 시도
        }
      } else {
        // 토큰이 없으면 로그인 페이지로
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      }
    } else {
      // 인증 오류가 아닌 경우 (네트워크 문제 등)는 재연결 시도
      console.error('Socket connection error (non-auth):', error.message);
    }
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocketInstance(): Socket | null {
  return socket;
}

