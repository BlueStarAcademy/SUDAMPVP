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

