'use client';

import { useState, useEffect, useRef, ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
  // localStorage에서 초기값 읽기
  const getInitialRememberPosition = () => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem(`modal_${modalId}_remember`);
    return saved === 'true';
  };

  const getInitialPosition = () => {
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    const savedRemember = localStorage.getItem(`modal_${modalId}_remember`);
    const savedPosition = localStorage.getItem(`modal_${modalId}_position`);
    
    if (savedRemember === 'true' && savedPosition) {
      try {
        return JSON.parse(savedPosition);
      } catch (e) {
        return { x: 0, y: 0 };
      }
    }
    return { x: 0, y: 0 };
  };

  const [position, setPosition] = useState(getInitialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [rememberPosition, setRememberPosition] = useState(getInitialRememberPosition);
  const [zIndex, setZIndex] = useState(1000);
  const modalRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const positionInitialized = useRef(false);

  // 모달이 열릴 때 z-index 설정 및 위치 초기화
  useEffect(() => {
    if (isOpen) {
      // 새로운 z-index 할당 (마지막에 열린 모달이 위에 오도록) - 높은 값으로 설정
      const newZIndex = getNextZIndex();
      setZIndex(newZIndex);
      
      // 클릭 시 해당 모달을 최상단으로
      const handleClick = () => {
        const newZ = getNextZIndex();
        setZIndex(newZ);
      };
      
      const overlay = overlayRef.current;
      if (overlay) {
        overlay.addEventListener('mousedown', handleClick);
      }
      
      // 위치 설정 - 저장된 위치가 있으면 사용, 없으면 중앙 배치
      if (!positionInitialized.current) {
        const savedRemember = localStorage.getItem(`modal_${modalId}_remember`);
        const savedPosition = localStorage.getItem(`modal_${modalId}_position`);
        
        if (savedRemember === 'true' && savedPosition) {
          try {
            const pos = JSON.parse(savedPosition);
            setRememberPosition(true);
            // 모달이 렌더링된 후 위치 설정
            const timer = setTimeout(() => {
              if (modalRef.current) {
                const maxX = window.innerWidth - modalRef.current.offsetWidth;
                const maxY = window.innerHeight - modalRef.current.offsetHeight;
                setPosition({
                  x: Math.max(0, Math.min(pos.x, maxX)),
                  y: Math.max(0, Math.min(pos.y, maxY)),
                });
                positionInitialized.current = true;
              }
            }, 10);
            return () => {
              clearTimeout(timer);
              if (overlay) {
                overlay.removeEventListener('mousedown', handleClick);
              }
            };
          } catch (e) {
            // 기본값 사용 - 중앙 배치
            setRememberPosition(false);
          }
        } else {
          setRememberPosition(false);
        }
        
        // 위치 기억이 없으면 중앙에 배치
        if (savedRemember !== 'true') {
          const timer = setTimeout(() => {
            if (modalRef.current) {
              const rect = modalRef.current.getBoundingClientRect();
              const x = (window.innerWidth - rect.width) / 2;
              const y = (window.innerHeight - rect.height) / 2;
              setPosition({ 
                x: Math.max(0, x), 
                y: Math.max(0, y) 
              });
              positionInitialized.current = true;
            }
          }, 10);
          return () => {
            clearTimeout(timer);
            if (overlay) {
              overlay.removeEventListener('mousedown', handleClick);
            }
          };
        }
      }
      
      return () => {
        if (overlay) {
          overlay.removeEventListener('mousedown', handleClick);
        }
      };
    } else {
      // 모달이 닫힐 때 위치 초기화 플래그 리셋
      positionInitialized.current = false;
    }
  }, [isOpen, modalId]);

  // 위치 기억 설정 저장 (드래그가 끝난 후에만 저장)
  useEffect(() => {
    if (rememberPosition && !isDragging && position.x !== 0 && position.y !== 0) {
      localStorage.setItem(`modal_${modalId}_remember`, 'true');
      localStorage.setItem(`modal_${modalId}_position`, JSON.stringify(position));
    } else if (!rememberPosition) {
      localStorage.setItem(`modal_${modalId}_remember`, 'false');
      localStorage.removeItem(`modal_${modalId}_position`);
    }
  }, [rememberPosition, position, modalId, isDragging]);

  const centerModal = () => {
    // 모달이 렌더링된 후 중앙 위치 계산
    if (modalRef.current) {
      const rect = modalRef.current.getBoundingClientRect();
      const x = (window.innerWidth - rect.width) / 2;
      const y = (window.innerHeight - rect.height) / 2;
      setPosition({ 
        x: Math.max(0, x), 
        y: Math.max(0, y) 
      });
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
      // 드래그가 끝난 후 위치 저장
      if (rememberPosition && modalRef.current) {
        const rect = modalRef.current.getBoundingClientRect();
        const currentPos = {
          x: rect.left,
          y: rect.top,
        };
        setPosition(currentPos);
        localStorage.setItem(`modal_${modalId}_remember`, 'true');
        localStorage.setItem(`modal_${modalId}_position`, JSON.stringify(currentPos));
      }
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

  // 모달이 렌더링된 후 중앙 배치 (위치 기억이 없을 때만)
  useEffect(() => {
    if (isOpen && modalRef.current && !rememberPosition && !positionInitialized.current) {
      // 모달이 렌더링된 후 약간의 지연을 두고 위치 계산
      const timer = setTimeout(() => {
        if (modalRef.current && !rememberPosition) {
          const rect = modalRef.current.getBoundingClientRect();
          const x = (window.innerWidth - rect.width) / 2;
          const y = (window.innerHeight - rect.height) / 2;
          setPosition({ 
            x: Math.max(0, x), 
            y: Math.max(0, y) 
          });
          positionInitialized.current = true;
        }
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [isOpen, rememberPosition]);

  if (!isOpen) return null;

  const modalContent = (
    <div 
      ref={overlayRef}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
      style={{ zIndex: zIndex }}
      onClick={(e) => {
        if (e.target === overlayRef.current) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className={`bg-panel text-on-panel ${maxWidth} w-auto min-w-[320px] mx-4 animate-fade-in`}
        style={{
          position: 'fixed',
          left: rememberPosition && position.x > 0 ? `${position.x}px` : (position.x > 0 ? `${position.x}px` : '50%'),
          top: rememberPosition && position.y > 0 ? `${position.y}px` : (position.y > 0 ? `${position.y}px` : '50%'),
          transform: (!rememberPosition && position.x === 0 && position.y === 0) ? 'translate(-50%, -50%)' : 'none',
          cursor: isDragging ? 'grabbing' : 'default',
          zIndex: zIndex + 1,
          maxHeight: '90vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 드래그 가능한 헤더 */}
        <div
          onMouseDown={handleMouseDown}
          className="flex items-center justify-between px-4 py-3 border-b border-color cursor-grab active:cursor-grabbing select-none bg-tertiary/30"
        >
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-on-panel">{title}</h2>
          </div>
          <div className="flex items-center gap-3">
            {/* 위치 기억 체크박스 */}
            <label className="flex items-center gap-2 text-xs text-secondary cursor-pointer hover:text-on-panel transition-colors">
              <input
                type="checkbox"
                checked={rememberPosition}
                onChange={(e) => {
                  setRememberPosition(e.target.checked);
                  if (!e.target.checked) {
                    centerModal();
                  }
                }}
                className="w-3.5 h-3.5 rounded border-color bg-secondary text-accent focus:ring-accent focus:ring-1"
              />
              <span>위치 기억</span>
            </label>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-secondary transition-all hover:bg-tertiary hover:text-on-panel"
              aria-label="닫기"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 모달 내용 */}
        <div className="px-4 py-4 text-on-panel">{children}</div>
      </div>
    </div>
  );

  // Portal을 사용하여 document.body에 직접 렌더링
  if (typeof window !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  
  return null;
}

