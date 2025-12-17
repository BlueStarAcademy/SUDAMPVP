'use client';

import { useState, useEffect, useRef } from 'react';
import { getSocketInstance } from '@/lib/socket/client';
import { DEFAULT_AVATARS } from '@/lib/constants/avatars';

interface ChatMessage {
  id: string;
  user: {
    id: string;
    username: string;
    nickname: string | null;
    avatarId: string | null;
  };
  message: string;
  createdAt: string;
}

interface ChatPanelProps {
  gameId?: string; // 대국실 채팅인 경우
  type?: 'GLOBAL' | 'GAME';
}

export default function ChatPanel({ gameId, type = 'GLOBAL' }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages();

    const socket = getSocketInstance();
    if (socket) {
      if (type === 'GAME' && gameId) {
        socket.emit('game:join', gameId);
        socket.on('chat:message', (message: ChatMessage) => {
          if (message.user.id !== socket.id) {
            setMessages((prev) => [...prev, message]);
          }
        });
      } else {
        socket.emit('lobby:join');
        socket.on('chat:message', (message: ChatMessage) => {
          setMessages((prev) => [...prev, message]);
        });
      }
    }

    return () => {
      if (socket) {
        socket.off('chat:message');
        if (type === 'GAME' && gameId) {
          socket.emit('game:leave', gameId);
        }
      }
    };
  }, [gameId, type]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchMessages = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const url =
        type === 'GAME' && gameId
          ? `/api/chat?type=GAME&gameId=${gameId}`
          : '/api/chat?type=GLOBAL';

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: newMessage,
          gameId: type === 'GAME' ? gameId : undefined,
          type,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessages((prev) => [...prev, data.message]);
        setNewMessage('');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  if (loading) {
    return (
      <div className="baduk-card p-4">
        <p className="text-sm text-gray-500">채팅 로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="baduk-card flex h-full flex-col p-4 border-2 border-gray-200 dark:border-gray-700">
      <div className="mb-2 flex items-center gap-2 border-b border-gray-200 pb-2 dark:border-gray-700">
        <span className="text-lg">💬</span>
        <h3 className="font-bold">{type === 'GAME' ? '대국실 채팅' : '전체 채팅'}</h3>
      </div>

      {/* 메시지 목록 */}
      <div className="mb-3 flex-1 space-y-2 overflow-y-auto">
        {messages.map((msg) => {
          const avatar = msg.user.avatarId
            ? DEFAULT_AVATARS.find((a) => a.id === msg.user.avatarId) || DEFAULT_AVATARS[0]
            : DEFAULT_AVATARS[0];

          return (
            <div key={msg.id} className="flex items-start gap-2 text-sm">
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-xs font-bold text-white">
                {msg.user.nickname?.[0] || msg.user.username[0]?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-800 dark:text-gray-200">
                    {msg.user.nickname || msg.user.username}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(msg.createdAt).toLocaleTimeString('ko-KR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-gray-700 dark:text-gray-300">{msg.message}</p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 메시지 입력 */}
      <form onSubmit={handleSendMessage} className="flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="메시지를 입력하세요..."
          maxLength={500}
          className="flex-1 rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
        />
        <button
          type="submit"
          disabled={!newMessage.trim()}
          className="rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-md transition-all hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          전송
        </button>
      </form>
    </div>
  );
}

