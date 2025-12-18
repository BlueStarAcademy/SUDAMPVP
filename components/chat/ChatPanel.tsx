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
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cooldownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 퀵 메시지 목록
  const quickMessages = [
    '안녕하세요! 👋',
    '좋은 게임 되세요! 🎮',
    '화이팅! 💪',
    '잘하셨습니다! 👏',
    '다음에 또 대국해요! 😊',
    '재밌는 게임이었어요! 🎯',
  ];

  // 이모지 목록
  const emojis = ['😊', '👍', '👏', '🎉', '🔥', '💪', '🎮', '⭐', '❤️', '🎯', '🏆', '👋'];

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

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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
        setShowQuickMenu(false);
        // 3초 쿨다운 설정
        setCooldown(3);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleQuickMessage = (message: string) => {
    setNewMessage(message);
    // 자동 전송하지 않고 입력창에만 넣기
  };

  const handleEmojiClick = (emoji: string) => {
    setNewMessage((prev) => prev + emoji);
  };

  if (loading) {
    return (
      <div className="baduk-card p-4">
        <p className="text-sm text-gray-500">채팅 로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-4 text-on-panel">
      <div className="mb-3 flex items-center justify-between border-b border-color pb-2">
        <h3 className="text-base font-semibold text-on-panel">
          {type === 'GAME' ? '대국실 채팅' : '전체 채팅'}
        </h3>
      </div>

      {/* 메시지 목록 */}
      <div className="mb-3 flex-1 space-y-0.5 overflow-y-auto pr-1 bg-tertiary/40 p-1 rounded-md">
        {messages.map((msg) => {
          const avatar = msg.user.avatarId
            ? DEFAULT_AVATARS.find((a) => a.id === msg.user.avatarId) || DEFAULT_AVATARS[0]
            : DEFAULT_AVATARS[0];

          const timeString = new Date(msg.createdAt).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
          });

          return (
            <div key={msg.id} className="text-xs">
              <span className="font-semibold text-tertiary cursor-pointer hover:underline pr-2">
                {msg.user.nickname || msg.user.username}:
              </span>
              <span className="text-on-panel">{msg.message}</span>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 퀵 메뉴 버튼 */}
      <div className="mb-2 relative flex-shrink-0">

        {/* 퀵 메뉴 (퀵 메시지 + 이모지) */}
        {showQuickMenu && (
          <div className="absolute bottom-full mb-2 w-full bg-secondary rounded-lg shadow-xl p-1 z-10 max-h-64 overflow-y-auto">
            <div className="grid grid-cols-5 gap-1 text-xl mb-1 border-b border-color pb-1">
              {emojis.map((emoji, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleEmojiClick(emoji)}
                  className="w-full p-1 rounded-md hover:bg-accent transition-colors text-center"
                >
                  {emoji}
                </button>
              ))}
            </div>
            <ul className="space-y-0.5">
              {quickMessages.map((msg, index) => (
                <li key={index}>
                  <button
                    type="button"
                    onClick={() => handleQuickMessage(msg)}
                    className="w-full text-left text-xs p-1 rounded-md hover:bg-accent transition-colors"
                  >
                    {msg}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 메시지 입력 */}
      <form onSubmit={handleSendMessage} className="flex gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={() => setShowQuickMenu(!showQuickMenu)}
          className="bg-secondary hover:bg-tertiary text-primary font-bold px-2.5 py-2.5 rounded-md transition-colors text-lg flex items-center justify-center"
          title="빠른 채팅"
          disabled={cooldown > 0}
        >
          <span>🙂</span>
        </button>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder={cooldown > 0 ? `(${cooldown}초)` : `[메시지 입력] ${newMessage.length}/30`}
          maxLength={30}
          className="flex-grow bg-tertiary border border-color rounded-md px-3 py-2.5 focus:ring-accent focus:border-accent text-sm disabled:bg-secondary disabled:text-tertiary text-on-panel"
          disabled={cooldown > 0}
        />
        <button
          type="submit"
          disabled={!newMessage.trim() || cooldown > 0}
          className="bg-accent hover:bg-accent-hover text-white font-bold px-2.5 py-2.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="보내기"
        >
          💬
        </button>
      </form>
    </div>
  );
}

