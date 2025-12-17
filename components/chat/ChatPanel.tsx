'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { getSocketInstance } from '@/lib/socket/client';
import { DEFAULT_AVATARS } from '@/lib/constants/avatars';
import { filterProfanity } from '@/lib/utils/profanityFilter';

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
  const [cooldown, setCooldown] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cooldownIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

  // 쿨다운 타이머
  useEffect(() => {
    if (cooldown > 0) {
      cooldownIntervalRef.current = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            if (cooldownIntervalRef.current) {
              clearInterval(cooldownIntervalRef.current);
              cooldownIntervalRef.current = null;
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
        cooldownIntervalRef.current = null;
      }
    };
  }, [cooldown]);

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
    if (!newMessage.trim() || cooldown > 0) return;

    // 비속어 필터링
    const filteredMessage = filterProfanity(newMessage.trim());

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
          message: filteredMessage,
          gameId: type === 'GAME' ? gameId : undefined,
          type,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessages((prev) => [...prev, data.message]);
        setNewMessage('');
        // 3초 쿨다운 설정
        setCooldown(3);
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
    <div className="flex h-full flex-col p-5">
      <div className="mb-3 flex items-center gap-2 border-b border-indigo-200 pb-3">
        <span className="text-xl">💬</span>
        <h3 className="font-bold text-gray-800">{type === 'GAME' ? '대국실 채팅' : '전체 채팅'}</h3>
      </div>

      {/* 메시지 목록 */}
      <div className="mb-3 flex-1 space-y-1 overflow-y-auto">
        {messages.map((msg) => {
          const avatar = msg.user.avatarId
            ? DEFAULT_AVATARS.find((a) => a.id === msg.user.avatarId) || DEFAULT_AVATARS[0]
            : DEFAULT_AVATARS[0];

          const timeString = new Date(msg.createdAt).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
          });

          return (
            <div key={msg.id} className="flex items-center gap-2 text-sm">
              {/* 프로필 사진 */}
              <div className="relative flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full overflow-hidden border border-gray-300">
                {avatar.imagePath ? (
                  <Image
                    src={avatar.imagePath}
                    alt={msg.user.nickname || msg.user.username}
                    fill
                    className="object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500 text-xs font-bold text-white">
                    {msg.user.nickname?.[0] || msg.user.username[0]?.toUpperCase() || 'U'}
                  </div>
                )}
              </div>
              {/* [프로필사진]닉네임 (시간) : 할말 형식 */}
              <div className="flex-1 text-gray-800 dark:text-gray-200">
                <span className="font-bold">{msg.user.nickname || msg.user.username}</span>
                <span className="text-xs text-gray-500 ml-1">({timeString})</span>
                <span className="ml-1">:</span>
                <span className="ml-1">{msg.message}</span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 메시지 입력 */}
      <form onSubmit={handleSendMessage} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="메시지를 입력하세요... (최대 60자)"
            maxLength={60}
            className="flex-1 rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || cooldown > 0}
            className="rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-md transition-all hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cooldown > 0 ? `${cooldown}초` : '전송'}
          </button>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{newMessage.length}/60</span>
          {cooldown > 0 && (
            <span className="text-orange-500">다음 메시지는 {cooldown}초 후에 전송할 수 있습니다</span>
          )}
        </div>
      </form>
    </div>
  );
}

