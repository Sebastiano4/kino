/**
 * Review files — an HTML or TXT review attached to a film.
 *
 * Stored on the movie doc as `reviewFile: { name, type: 'html'|'txt', content }`
 * (Firestore caps a document at 1 MiB, so files are limited to REVIEW_MAX_BYTES).
 *
 * HTML is shown with its own <style> and fonts inside a sandboxed iframe with
 * no permissions: scripts never run and the page cannot reach the app. Scripts
 * and inline handlers are also stripped before storing.
 *
 * Shared by the watched modal (upload + preview) and the detail modal (reading).
 */
import i18n from '../core/i18n.js';

export const REVIEW_MAX_BYTES = 800 * 1024;

/**
 * Read an uploaded File into a reviewFile object.
 * @throws {Error} with a user-facing message for unsupported or oversized files
 */
export async function readReviewFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const type = ext === 'html' || ext === 'htm' ? 'html' : ext === 'txt' ? 'txt' : null;
    if (!type) throw new Error(i18n.t('review_unsupported'));
    if (file.size > REVIEW_MAX_BYTES) throw new Error(i18n.t('review_too_big'));
    const raw = await file.text();
    return { name: file.name, type, content: type === 'html' ? sanitizeHtml(raw) : raw };
}

/** Drop scripts, inline event handlers and javascript: URLs; keep styles and layout. */
function sanitizeHtml(raw) {
    return raw
        .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
        .replace(/<script[^>]*\/?>/gi, '')
        .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

/** Sandboxed iframe (HTML) or <pre> (TXT) showing the file. */
function fileBody(rf, cls) {
    if (rf.type === 'html') {
        const frame = document.createElement('iframe');
        frame.className = cls;
        frame.setAttribute('sandbox', '');           // no scripts, no same-origin
        frame.setAttribute('referrerpolicy', 'no-referrer');
        frame.title = rf.name;
        frame.srcdoc = rf.content;
        return frame;
    }
    const pre = document.createElement('pre');
    pre.className = `review-preview-txt ${cls}-txt`;
    pre.textContent = rf.content;
    return pre;
}

/**
 * Inline preview: file name bar with a full-screen button, then the file.
 * @returns {HTMLElement}
 */
export function reviewPreview(rf) {
    const wrap = document.createElement('div');
    wrap.className = 'review-preview-inner';

    const bar = document.createElement('div');
    bar.className = 'review-preview-bar';
    const name = document.createElement('span');
    name.className = 'review-preview-filename';
    name.textContent = `${rf.type === 'html' ? '🌐' : '📝'} ${rf.name}`;
    const full = document.createElement('button');
    full.type = 'button';
    full.className = 'review-full-btn';
    full.textContent = `⤢ ${i18n.t('review_open_full')}`;
    full.addEventListener('click', () => openReviewReader(rf));
    bar.append(name, full);

    wrap.append(bar, fileBody(rf, 'review-preview-frame'));
    return wrap;
}

/** Full-screen reader overlay. Closes on ✕, Escape or backdrop click. */
export function openReviewReader(rf) {
    const overlay = document.createElement('div');
    overlay.className = 'review-reader';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', rf.name);

    const bar = document.createElement('div');
    bar.className = 'review-reader-bar';
    const name = document.createElement('span');
    name.className = 'review-preview-filename';
    name.textContent = rf.name;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'review-reader-close';
    closeBtn.setAttribute('aria-label', i18n.t('cancel'));
    closeBtn.textContent = '✕';
    bar.append(name, closeBtn);

    overlay.append(bar, fileBody(rf, 'review-reader-frame'));
    document.body.appendChild(overlay);

    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
    // Capture phase so Escape closes the reader before the modal underneath.
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    closeBtn.addEventListener('click', close);
    closeBtn.focus();
}
