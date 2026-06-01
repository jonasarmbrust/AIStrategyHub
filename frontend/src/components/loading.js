/**
 * Loading spinner and skeleton components.
 */
export function showLoading(container, message = '') {
    container.innerHTML = `
        <div class="loading-container">
            <div class="loading-spinner"></div>
            ${message ? `<p class="loading-message">${message}</p>` : ''}
        </div>
    `;
}

export function showError(container, message, retryFn = null) {
    container.innerHTML = `
        <div class="error-container">
            <div class="error-icon">⚠️</div>
            <p class="error-message">${message}</p>
            ${retryFn ? '<button class="btn btn-primary retry-btn">Retry</button>' : ''}
        </div>
    `;
    if (retryFn) {
        container.querySelector('.retry-btn')?.addEventListener('click', retryFn);
    }
}

export function showEmpty(container, message) {
    container.innerHTML = `
        <div class="empty-state">
            <p>${message}</p>
        </div>
    `;
}
