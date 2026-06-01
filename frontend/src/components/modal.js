/**
 * Reusable modal dialog component.
 */
import { t } from '../i18n.js';

export function createModal({ title, content, onClose, size = 'medium' }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal modal-${size}">
            <div class="modal-header">
                <h2>${title}</h2>
                <button class="modal-close" aria-label="${t('common.close')}">&times;</button>
            </div>
            <div class="modal-body">${content}</div>
        </div>
    `;

    const closeBtn = overlay.querySelector('.modal-close');
    const close = () => {
        overlay.remove();
        if (onClose) onClose();
    };
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

    document.body.appendChild(overlay);
    return { overlay, close };
}
