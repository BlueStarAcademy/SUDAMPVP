'use client';

import { io, Socket } from 'socket.io-client';
import { JWTPayload } from '../auth';

let socket: Socket | null = null;

export function getSocket(token: string): Socket {
  // 토큰이 없으면 에러
  if (!token) {
    throw new Error('Token is required for socket connection');
  }

  // 기존 소켓이 있고 연결되어 있고 같은 토큰을 사용하는 경우 재사용
  if (socket && socket.connected) {
    return socket;
  }

  // 기존 소켓이 있지만 연결되지 않았거나 토큰이 변경된 경우 재연결
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000', {
    path: '/api/socket',
    auth: {
      token,
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
  });

  socket.on('connect', () => {
    console.log('Socket connected');
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    // 서버가 명시적으로 연결을 끊은 경우만 처리 (재연결 시도 중이 아닐 때)
    if (reason === 'io server disconnect') {
      // 서버가 연결을 끊은 경우 - 토큰이 없으면 로그인 페이지로
      const token = localStorage.getItem('token');
      if (!token && typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    // 다른 이유로 끊긴 경우는 재연결 시도 (transport close 등)
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    // 인증 오류인 경우에만 처리 (다른 오류는 재연결 시도)
    if (error.message && error.message.includes('Authentication error')) {
      console.warn('Authentication failed');
      // 토큰이 실제로 유효한지 API로 확인
      const token = localStorage.getItem('token');
      if (token) {
        // 토큰 검증 API 호출
        fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((res) => {
            if (!res.ok) {
              // 토큰이 실제로 유효하지 않은 경우에만 리다이렉트
              console.warn('Token is invalid, redirecting to login...');
              localStorage.removeItem('token');
              if (typeof window !== 'undefined') {
                window.location.href = '/login';
              }
            }
            // 토큰이 유효하면 재연결 시도 (일시적인 서버 문제일 수 있음)
          })
          .catch(() => {
            // API 호출 실패는 무시 (네트워크 문제일 수 있음)
          });
      } else {
        // 토큰이 없으면 로그인 페이지로
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      }
    }
    // 다른 오류는 재연결 시도 (네트워크 문제 등)
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

