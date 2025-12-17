'use client';

import { useEffect, useState } from 'react';
import { getSocketInstance } from '../socket/client';

export interface OnlineUser {
  id: string;
  username: string;
  nickname: string | null;
  status: string;
  socketId?: string;
  lastSeen?: Date;
}

export function useOnlineUsers() {
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const socket = getSocketInstance();
    if (!socket) {
      fetchOnlineUsers();
      return;
    }

    // Join lobby
    socket.emit('lobby:join');

    // Listen for user updates
    socket.on('lobby:users', (users: OnlineUser[]) => {
      setUsers(users);
      setLoading(false);
    });

    // Fetch initial users
    fetchOnlineUsers();

    return () => {
      socket.emit('lobby:leave');
      socket.off('lobby:users');
    };
  }, []);

  const fetchOnlineUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/users/online', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Failed to fetch online users:', error);
    } finally {
      setLoading(false);
    }
  };

  return { users, loading, refetch: fetchOnlineUsers };
}

