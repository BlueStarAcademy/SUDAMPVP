// Modal System with Drag and Position Saving
class Modal {
    constructor() {
        this.modals = new Map();
        this.init();
    }

    init() {
        // Create overlay if it doesn't exist
        if (!document.getElementById('modal-overlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'modal-overlay';
            overlay.className = 'modal-overlay';
            document.body.appendChild(overlay);
        }
    }

    open(id, content, options = {}) {
        const {
            title = '',
            width = 'auto',
            height = 'auto',
            showClose = true,
            footer = null,
            onClose = null
        } = options;

        // Remove existing modal if present
        this.close(id);

        const overlay = document.getElementById('modal-overlay');
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = `modal-${id}`;
        modal.style.width = width;
        modal.style.height = height;

        // Load saved position
        const savedPosition = this.loadPosition(id);
        if (savedPosition) {
            modal.style.position = 'fixed';
            modal.style.left = `${savedPosition.x}px`;
            modal.style.top = `${savedPosition.y}px`;
            modal.style.margin = '0';
        }

        modal.innerHTML = `
            <div class="modal-header" id="modal-header-${id}">
                <h2>${title}</h2>
                ${showClose ? '<button class="modal-close" id="modal-close-' + id + '">&times;</button>' : ''}
            </div>
            <div class="modal-body" id="modal-body-${id}">
                ${content}
            </div>
            ${footer ? `<div class="modal-footer" id="modal-footer-${id}">${footer}</div>` : ''}
        `;

        overlay.appendChild(modal);
        overlay.classList.add('active');
        
        // z-index를 동적으로 증가시켜 항상 최상위에 표시
        // 현재 열려있는 모든 모달의 최대 z-index를 찾아서 +1
        const allModals = document.querySelectorAll('.modal-overlay, .stats-modal');
        let maxZIndex = 100000;
        allModals.forEach(modalEl => {
            const zIndex = parseInt(window.getComputedStyle(modalEl).zIndex) || 0;
            if (zIndex > maxZIndex) {
                maxZIndex = zIndex;
            }
        });
        overlay.style.zIndex = (maxZIndex + 1).toString();

        // Store modal info
        this.modals.set(id, {
            element: modal,
            overlay: overlay,
            onClose: onClose
        });

        // Setup drag functionality
        this.setupDrag(id);

        // Setup close button
        if (showClose) {
            const closeBtn = document.getElementById(`modal-close-${id}`);
            closeBtn.addEventListener('click', () => this.close(id));
        }

        // Close on overlay click (but not on modal click)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.close(id);
            }
        });

        return modal;
    }

    close(id) {
        const modalInfo = this.modals.get(id);
        if (!modalInfo) return;

        const { element, overlay, onClose } = modalInfo;

        // Save position before closing
        this.savePosition(id, element);

        // Remove modal
        if (element && element.parentNode) {
            element.parentNode.removeChild(element);
        }

        // Remove overlay if no modals left
        if (overlay && overlay.children.length === 0) {
            overlay.classList.remove('active');
        }

        // Call onClose callback
        if (onClose) {
            onClose();
        }

        this.modals.delete(id);
    }

    setupDrag(id) {
        const modalInfo = this.modals.get(id);
        if (!modalInfo) return;

        const modal = modalInfo.element;
        const header = document.getElementById(`modal-header-${id}`);
        if (!header) return;

        let isDragging = false;
        let currentX = 0;
        let currentY = 0;
        let initialX = 0;
        let initialY = 0;

        header.addEventListener('mousedown', (e) => {
            // Don't drag if clicking close button
            if (e.target.classList.contains('modal-close')) {
                return;
            }

            isDragging = true;
            modal.classList.add('dragging');

            // Get initial mouse position
            initialX = e.clientX;
            initialY = e.clientY;

            // Get current modal position
            const rect = modal.getBoundingClientRect();
            currentX = rect.left;
            currentY = rect.top;

            // Make modal position fixed if not already
            if (getComputedStyle(modal).position !== 'fixed') {
                modal.style.position = 'fixed';
                modal.style.left = `${rect.left}px`;
                modal.style.top = `${rect.top}px`;
                modal.style.margin = '0';
            }

            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            // Calculate new position
            const deltaX = e.clientX - initialX;
            const deltaY = e.clientY - initialY;

            let newX = currentX + deltaX;
            let newY = currentY + deltaY;

            // Boundary check - keep modal within viewport
            const rect = modal.getBoundingClientRect();
            const maxX = window.innerWidth - rect.width;
            const maxY = window.innerHeight - rect.height;

            newX = Math.max(0, Math.min(newX, maxX));
            newY = Math.max(0, Math.min(newY, maxY));

            modal.style.left = `${newX}px`;
            modal.style.top = `${newY}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                modal.classList.remove('dragging');

                // Save position
                this.savePosition(id, modal);
            }
        });
    }

    savePosition(id, modal) {
        const rect = modal.getBoundingClientRect();
        const position = {
            x: rect.left,
            y: rect.top
        };

        try {
            const saved = localStorage.getItem('modal-positions') || '{}';
            const positions = JSON.parse(saved);
            positions[id] = position;
            localStorage.setItem('modal-positions', JSON.stringify(positions));
        } catch (e) {
            console.error('Failed to save modal position:', e);
        }
    }

    loadPosition(id) {
        try {
            const saved = localStorage.getItem('modal-positions') || '{}';
            const positions = JSON.parse(saved);
            return positions[id] || null;
        } catch (e) {
            console.error('Failed to load modal position:', e);
            return null;
        }
    }
}

// Create global instance
window.Modal = new Modal();

// 안내 모달 함수 (alert 대체용)
window.showAlertModal = function(message, title = '안내', type = 'info') {
    const modalId = 'alert-modal-' + Date.now();
    const iconMap = {
        'info': 'ℹ️',
        'success': '✅',
        'warning': '⚠️',
        'error': '❌'
    };
    const icon = iconMap[type] || iconMap['info'];
    
    const content = `
        <div style="text-align: center; padding: 20px;">
            <div style="font-size: 48px; margin-bottom: 15px;">${icon}</div>
            <div style="font-size: 16px; line-height: 1.6; color: #374151; white-space: pre-wrap;">${escapeHtml(message)}</div>
        </div>
    `;
    
    const footer = `
        <button class="modal-btn modal-btn-primary" onclick="window.Modal.close('${modalId}')" style="min-width: 100px;">확인</button>
    `;
    
    window.Modal.open(modalId, content, {
        title: `${icon} ${title}`,
        width: '400px',
        footer: footer,
        showClose: true
    });
    
    // ESC 키로 닫기
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            window.Modal.close(modalId);
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
    
    // 모달이 닫힐 때 이벤트 리스너 제거
    const originalClose = window.Modal.close.bind(window.Modal);
    window.Modal.close = function(id) {
        if (id === modalId) {
            document.removeEventListener('keydown', handleEscape);
        }
        originalClose(id);
    };
};

// 확인 모달 함수 (confirm 대체용)
window.showConfirmModal = function(message, title = '확인', onConfirm, onCancel) {
    const modalId = 'confirm-modal-' + Date.now();
    
    // 젬 값이 포함된 메시지인지 확인하고 이미지로 변환
    let processedMessage = escapeHtml(message);
    // 젬 값 패턴 찾기: (숫자젬 소모) 또는 (숫자젬) 또는 (숫자젬 소모, 추가 텍스트)
    processedMessage = processedMessage.replace(/\((\d+)젬\s*(소모)?([^)]*)\)/g, (match, gemAmount, hasSomo, additionalText) => {
        const gemImg = `<img src="/images/Zem.webp" alt="젬" style="width: 16px; height: 16px; vertical-align: middle; margin: 0 2px;">`;
        const gemValue = `<span style="font-weight: 700; vertical-align: middle;">${gemAmount}</span>`;
        const somoText = hasSomo ? ' 소모' : '';
        const additional = additionalText ? additionalText : '';
        return `(${gemImg}${gemValue}${somoText}${additional})`;
    });
    
    const content = `
        <div style="text-align: center; padding: 20px;">
            <div style="font-size: 48px; margin-bottom: 15px;">⚠️</div>
            <div style="font-size: 16px; line-height: 1.6; color: #374151; white-space: pre-wrap;">${processedMessage}</div>
        </div>
    `;
    
    const footer = `
        <button class="modal-btn modal-btn-secondary" id="confirm-cancel-btn-${modalId}" style="min-width: 100px; margin-right: 10px;">취소</button>
        <button class="modal-btn modal-btn-primary" id="confirm-ok-btn-${modalId}" style="min-width: 100px;">확인</button>
    `;
    
    window.Modal.open(modalId, content, {
        title: `⚠️ ${title}`,
        width: '400px',
        footer: footer,
        showClose: true
    });
    
    // 확인 버튼 클릭
    const confirmBtn = document.getElementById(`confirm-ok-btn-${modalId}`);
    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            window.Modal.close(modalId);
            if (typeof onConfirm === 'function') {
                onConfirm();
            }
        });
    }
    
    // 취소 버튼 클릭
    const cancelBtn = document.getElementById(`confirm-cancel-btn-${modalId}`);
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            window.Modal.close(modalId);
            if (typeof onCancel === 'function') {
                onCancel();
            }
        });
    }
    
    // ESC 키로 닫기 (취소로 처리)
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            window.Modal.close(modalId);
            document.removeEventListener('keydown', handleEscape);
            if (typeof onCancel === 'function') {
                onCancel();
            }
        }
    };
    document.addEventListener('keydown', handleEscape);
    
    // 모달이 닫힐 때 이벤트 리스너 제거
    const originalClose = window.Modal.close.bind(window.Modal);
    window.Modal.close = function(id) {
        if (id === modalId) {
            document.removeEventListener('keydown', handleEscape);
        }
        originalClose(id);
    };
};

// HTML 이스케이프 함수
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
