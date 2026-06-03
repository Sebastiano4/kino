import i18n from '../core/i18n.js';

const TOAST_ROOT_ID = 'kinoToastRoot';

export function showToast(message, { tone = 'neutral', timeout = 3200 } = {}) {
    const root = _root();
    const toast = document.createElement('div');
    toast.className = `kino-toast kino-toast--${tone}`;
    toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    toast.innerHTML = `
      <span>${esc(message || i18n.t('notification'))}</span>
      <button type="button" aria-label="${esc(i18n.t('dismiss'))}">&times;</button>`;

    const close = () => {
        toast.classList.add('is-leaving');
        setTimeout(() => toast.remove(), 180);
    };
    toast.querySelector('button').addEventListener('click', close);
    root.appendChild(toast);
    setTimeout(close, timeout);
    return close;
}

function _root() {
    let root = document.getElementById(TOAST_ROOT_ID);
    if (!root) {
        root = document.createElement('div');
        root.id = TOAST_ROOT_ID;
        root.className = 'kino-toast-root';
        document.body.appendChild(root);
    }
    return root;
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
