// UI Enhancement Module
// Handles mobile interactions, toast notifications, and enhanced UX

class UIManager {
    constructor() {
        this.init();
    }

    init() {
        this.setupMobileMenu();
        this.setupModalSystem();
        this.setupToastSystem();
        this.setupTouchGestures();
        this.setupKeyboardShortcuts();
        this.setupFloatingActionButton();
        this.setupMobileMenuActions();
    }

    // Mobile Menu System
    setupMobileMenu() {
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const mobileMenu = document.getElementById('mobileMenu');

        if (hamburgerBtn && mobileMenu) {
            hamburgerBtn.addEventListener('click', () => {
                hamburgerBtn.classList.toggle('active');
                mobileMenu.classList.toggle('active');
            });

            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!hamburgerBtn.contains(e.target) && !mobileMenu.contains(e.target)) {
                    hamburgerBtn.classList.remove('active');
                    mobileMenu.classList.remove('active');
                }
            });

            // Close menu on escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    hamburgerBtn.classList.remove('active');
                    mobileMenu.classList.remove('active');
                }
            });
        }
    }

    // Enhanced Modal System
    setupModalSystem() {
        const modals = ['resizeModal', 'cropModal', 'hsvModal'];
        
        modals.forEach(modalId => {
            const modal = document.getElementById(modalId);
            if (modal) {
                // Close on overlay click
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        this.closeModal(modalId);
                    }
                });

                // Close on escape key
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape' && modal.classList.contains('active')) {
                        this.closeModal(modalId);
                    }
                });
            }
        });
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Focus first input
            const firstInput = modal.querySelector('input, select, button');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    // Toast Notification System
    setupToastSystem() {
        this.toastContainer = document.getElementById('toastContainer');
        if (!this.toastContainer) {
            this.toastContainer = document.createElement('div');
            this.toastContainer.className = 'toast-container';
            this.toastContainer.id = 'toastContainer';
            document.body.appendChild(this.toastContainer);
        }
    }

    showToast(message, type = 'success', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        toast.innerHTML = `
            <span class="toast-message">${message}</span>
            <button class="toast-close" aria-label="Close notification">×</button>
        `;

        this.toastContainer.appendChild(toast);

        // Show toast
        setTimeout(() => toast.classList.add('show'), 100);

        // Auto remove
        const autoRemove = setTimeout(() => this.removeToast(toast), duration);

        // Manual close
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            clearTimeout(autoRemove);
            this.removeToast(toast);
        });

        return toast;
    }

    removeToast(toast) {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }

    // Touch Gesture Support
    setupTouchGestures() {
        const imageViewingModule = document.querySelector('.imageViewingModule');
        if (!imageViewingModule) return;

        let touchStartX = 0;
        let touchStartY = 0;
        let touchStartDistance = 0;
        let initialScale = 1;
        let initialTranslate = { x: 0, y: 0 };

        // Multi-touch support for pinch-to-zoom
        imageViewingModule.addEventListener('touchstart', (e) => {
            if (window.isCropping) return;
            
            if (e.touches.length === 2) {
                // Pinch gesture start
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                touchStartDistance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );
            } else if (e.touches.length === 1) {
                // Single touch for panning
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }
        });

        imageViewingModule.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (window.isCropping) return;

            if (e.touches.length === 2) {
                // Pinch-to-zoom
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const currentDistance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );
                
                const scale = currentDistance / touchStartDistance;
                // Trigger zoom event simulation
                const centerX = (touch1.clientX + touch2.clientX) / 2;
                const centerY = (touch1.clientY + touch2.clientY) / 2;
                
                const wheelEvent = new WheelEvent('wheel', {
                    clientX: centerX,
                    clientY: centerY,
                    deltaY: scale > 1 ? -100 : 100,
                    bubbles: true
                });
                
                imageViewingModule.dispatchEvent(wheelEvent);
            }
        });
    }

    // Keyboard Shortcuts
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Only trigger if not in input field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            const shortcuts = {
                'KeyO': () => document.getElementById('openFile')?.click(),
                'KeyS': () => window.imageEditor?.quickExport(),
                'KeyR': () => this.openModal('resizeModal'),
                'KeyC': () => this.openModal('cropModal'),
                'KeyH': () => this.openModal('hsvModal'),
                'KeyZ': () => document.getElementById('resetImage')?.click(),
                'KeyG': () => document.getElementById('greyscale')?.click(),
                'Digit1': () => document.getElementById('rotateCW90')?.click(),
                'Digit2': () => document.getElementById('rotateCCW90')?.click(),
            };

            if (e.ctrlKey || e.metaKey) {
                const action = shortcuts[e.code];
                if (action) {
                    e.preventDefault();
                    action();
                }
            }
        });
    }

    // Floating Action Button
    setupFloatingActionButton() {
        const fab = document.getElementById('fabBtn');
        if (fab) {
            fab.addEventListener('click', () => {
                // Quick action menu or most common action
                if (window.imageEditor) {
                    window.imageEditor.quickExport();
                    this.showToast('Image exported!', 'success');
                } else {
                    document.getElementById('mobileOpenFile')?.click();
                }
            });
        }
    }

    // Mobile Menu Actions
    setupMobileMenuActions() {
        const mobileActions = {
            'mobileOpenFile': () => document.getElementById('openFile')?.click(),
            'mobileQuickExport': () => document.getElementById('quickExport')?.click(),
            'mobileResize': () => this.openModal('resizeModal'),
            'mobileCursorCrop': () => document.getElementById('cursorCrop')?.click(),
            'mobileCrop': () => this.openModal('cropModal'),
            'mobileRotateCW90': () => document.getElementById('rotateCW90')?.click(),
            'mobileRotateCCW90': () => document.getElementById('rotateCCW90')?.click(),
            'mobileHsv': () => this.openModal('hsvModal'),
            'mobileGreyscale': () => document.getElementById('greyscale')?.click(),
            'mobileSepia': () => document.getElementById('sepia')?.click(),
            'mobileFilmEffects': () => document.getElementById('filmEffects')?.click(),
            'mobilePaintedStylization': () => document.getElementById('paintedStylization')?.click(),
            'mobileResetImage': () => document.getElementById('resetImage')?.click(),
            'mobileToggleLayers': () => this.toggleMobileLayers(),
            'mobileToggleInfo': () => this.toggleMobileInfo(),
        };

        Object.entries(mobileActions).forEach(([id, action]) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('click', () => {
                    action();
                    // Close mobile menu after action
                    document.getElementById('hamburgerBtn')?.classList.remove('active');
                    document.getElementById('mobileMenu')?.classList.remove('active');
                });
            }
        });
    }

    // Mobile Panel Toggles
    toggleMobileLayers() {
        const layersModule = document.querySelector('.layersModule');
        if (layersModule) {
            layersModule.classList.toggle('active');
            // Close info panel if open
            document.querySelector('.contextModules')?.classList.remove('active');
        }
    }

    toggleMobileInfo() {
        const contextModules = document.querySelector('.contextModules');
        if (contextModules) {
            contextModules.classList.toggle('active');
            // Close layers panel if open
            document.querySelector('.layersModule')?.classList.remove('active');
        }
    }

    // Loading State Management
    showLoading() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.classList.add('active');
        }
    }

    hideLoading() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.classList.remove('active');
        }
    }

    // Enhanced Image Processing Feedback
    processImageWithFeedback(processFunction, successMessage = 'Image processed successfully!') {
        this.showLoading();
        
        // Use setTimeout to allow UI to update
        setTimeout(() => {
            try {
                processFunction();
                this.showToast(successMessage, 'success');
            } catch (error) {
                console.error('Image processing error:', error);
                this.showToast('Error processing image. Please try again.', 'error');
            } finally {
                this.hideLoading();
            }
        }, 100);
    }
}

// Initialize UI Manager
const uiManager = new UIManager();

// Make it globally available
window.uiManager = uiManager;

// Export for module use
export default uiManager;