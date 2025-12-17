'use client';

import { useState, useEffect, useRef, ReactNode } from 'react';
import { getNextZIndex } from '@/lib/utils/modalZIndex';

interface DraggableModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  modalId: string; // 각 모달을 구분하기 위한 ID
  maxWidth?: string;
}

export default function DraggableModal({
  isOpen,
  onClose,
  title,
  children,
  modalId,
  maxWidth = 'max-w-2xl',
}: DraggableModalProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [rememberPosition, setRememberPosition] = useState(false);
  const [zIndex, setZIndex] = useState(1000);
  const modalRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // 모달이 열릴 때 z-index 설정 및 위치 초기화
  useEffect(() => {
    if (isOpen) {
      // 새로운 z-index 할당 (마지막에 열린 모달이 위에 오도록)
      const newZIndex = getNextZIndex();
      setZIndex(newZIndex);
      
      // 클릭 시 해당 모달을 최상단으로
      const handleClick = () => {
        const newZ = getNextZIndex();
        setZIndex(newZ);
      };
      
      if (overlayRef.current) {
        overlayRef.current.addEventListener('mousedown', handleClick);
      }
      
      // 위치 설정
      if (modalRef.current) {
        const savedRemember = localStorage.getItem(`modal_${modalId}_remember`);
        const savedPosition = localStorage.getItem(`modal_${modalId}_position`);
        
        if (savedRemember === 'true' && savedPosition) {
          try {
            const pos = JSON.parse(savedPosition);
            setRememberPosition(true);
            // 화면 경계 체크
            const maxX = window.innerWidth - modalRef.current.offsetWidth;
            const maxY = window.innerHeight - modalRef.current.offsetHeight;
            setPosition({
              x: Math.max(0, Math.min(pos.x, maxX)),
              y: Math.max(0, Math.min(pos.y, maxY)),
            });
          } catch (e) {
            // 기본값 사용 - 중앙 배치
            setRememberPosition(false);
            setTimeout(() => centerModal(), 0);
          }
        } else {
          setRememberPosition(false);
          setTimeout(() => centerModal(), 0);
        }
      }
      
      return () => {
        if (overlayRef.current) {
          overlayRef.current.removeEventListener('mousedown', handleClick);
        }
      };
    }
  }, [isOpen, modalId]);

  // 위치 기억 설정 저장
  useEffect(() => {
    if (rememberPosition) {
      localStorage.setItem(`modal_${modalId}_remember`, 'true');
      localStorage.setItem(`modal_${modalId}_position`, JSON.stringify(position));
    } else {
      localStorage.setItem(`modal_${modalId}_remember`, 'false');
      localStorage.removeItem(`modal_${modalId}_position`);
    }
  }, [rememberPosition, position, modalId]);

  const centerModal = () => {
    if (modalRef.current) {
      const rect = modalRef.current.getBoundingClientRect();
      const x = Math.max(0, (window.innerWidth - rect.width) / 2);
      const y = Math.max(0, (window.innerHeight - rect.height) / 2);
      setPosition({ x, y });
    } else {
      // 모달이 아직 렌더링되지 않았을 때 기본 중앙 위치 설정
      const x = (window.innerWidth - 600) / 2; // 대략적인 모달 너비
      const y = (window.innerHeight - 400) / 2; // 대략적인 모달 높이
      setPosition({ x: Math.max(0, x), y: Math.max(0, y) });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (modalRef.current) {
      const rect = modalRef.current.getBoundingClientRect();
      setIsDragging(true);
      setDragStart({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && modalRef.current) {
        const newX = e.clientX - dragStart.x;
        const newY = e.clientY - dragStart.y;
        
        // 화면 경계 체크
        const maxX = window.innerWidth - modalRef.current.offsetWidth;
        const maxY = window.innerHeight - modalRef.current.offsetHeight;
        
        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY)),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  if (!isOpen) return null;

  return (
    <div 
      ref={overlayRef}
      className="fixed inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      style={{ zIndex }}
    >
      <div
        ref={modalRef}
        className={`premium-modal ${maxWidth} w-full animate-fade-in`}
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          cursor: isDragging ? 'grabbing' : 'default',
          zIndex: zIndex + 1,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 드래그 가능한 헤더 */}
        <div
          onMouseDown={handleMouseDown}
          className="premium-modal-header flex items-center justify-between p-4 cursor-grab active:cursor-grabbing select-none"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg">
              <span className="text-xl">📋</span>
            </div>
            <h2 className="text-xl font-bold text-gray-800">{title}</h2>
          </div>
          <div className="flex items-center gap-3">
            {/* 위치 기억 체크박스 */}
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer hover:text-gray-800 transition-colors">
              <input
                type="checkbox"
                checked={rememberPosition}
                onChange={(e) => {
                  setRememberPosition(e.target.checked);
                  if (!e.target.checked) {
                    centerModal();
                  }
                }}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 focus:ring-2"
              />
              <span>위치 기억</span>
            </label>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-gray-500 transition-all hover:bg-gray-100 hover:text-gray-800"
            >
              <span className="text-xl">✕</span>
            </button>
          </div>
        </div>

        {/* 모달 내용 */}
        <div className="premium-modal-content p-6">{children}</div>
      </div>
    </div>
  );
}

