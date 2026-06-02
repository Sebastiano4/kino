/**
 * SWIPE GESTURE ENGINE — tab-swipe navigation with momentum + haptics.
 *
 * Part 10 — Navigation.
 * Attaches to the view container and translates horizontal swipes into
 * router.navigate() calls. Handles:
 *   - Touch swipe left/right
 *   - Momentum: only fires on velocity > threshold
 *   - Haptic feedback via navigator.vibrate() (best-effort)
 *   - Scroll conflict: ignores swipes with significant vertical component
 *   - CSS spring animation on the view during drag (translateX)
 *   - cleanup() removes all listeners
 *
 * Usage:
 *   import { attachSwipeNav } from './core/gestures.js';
 *   const detach = attachSwipeNav(viewEl, () => router.listViews(), router.navigate);
 *   // later:
 *   detach();
 */

const MIN_SWIPE_DISTANCE  = 60;   // px
const MIN_SWIPE_VELOCITY  = 0.3;  // px/ms
const MAX_VERTICAL_RATIO  = 0.7;  // ignore if dy/dx > this
const SPRING_STIFFNESS    = 0.12; // CSS translate spring
const HAPTIC_DURATION     = 8;    // ms

/**
 * @param {HTMLElement} el            — the view container
 * @param {function}    getViews      — returns ordered visible route entries
 * @param {function}    navigate      — router.navigate(id)
 * @returns {function}                — detach (cleanup)
 */
export function attachSwipeNav(el, getViews, navigate) {
    let startX = 0, startY = 0, startT = 0;
    let dragging = false;
    let lastX = 0;
    let rafId = null;

    const ac = new AbortController();
    const sig = { signal: ac.signal };

    el.addEventListener('touchstart', onStart, { passive: true, ...sig });
    el.addEventListener('touchmove',  onMove,  { passive: true, ...sig });
    el.addEventListener('touchend',   onEnd,   sig);

    function onStart(e) {
        const t = e.touches[0];
        startX = lastX = t.clientX;
        startY = t.clientY;
        startT = Date.now();
        dragging = true;
        el.style.willChange = 'transform';
    }

    function onMove(e) {
        if (!dragging) return;
        const t   = e.touches[0];
        const dx  = t.clientX - startX;
        const dy  = Math.abs(t.clientY - startY);
        lastX     = t.clientX;

        // Cancel if the gesture is more vertical than horizontal
        if (dy / Math.max(Math.abs(dx), 1) > MAX_VERTICAL_RATIO) {
            dragging = false;
            _spring(el, 0);
            return;
        }

        // Live rubber-band translate
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
            const rubber = dx * SPRING_STIFFNESS;
            el.style.transform = `translateX(${rubber}px)`;
        });
    }

    function onEnd() {
        if (!dragging) return;
        dragging = false;

        el.style.willChange = '';
        _spring(el, 0);

        const dt = Date.now() - startT;
        const dx = lastX - startX;
        const velocity = Math.abs(dx) / dt;

        if (Math.abs(dx) < MIN_SWIPE_DISTANCE || velocity < MIN_SWIPE_VELOCITY) return;

        const views    = getViews().filter(v => !v.hidden);
        const activeId = _getActiveId();
        const idx      = views.findIndex(v => v.id === activeId);
        if (idx < 0) return;

        if (dx < 0 && idx < views.length - 1) {
            // Swipe left → next tab
            _haptic();
            navigate(views[idx + 1].id);
        } else if (dx > 0 && idx > 0) {
            // Swipe right → previous tab
            _haptic();
            navigate(views[idx - 1].id);
        }
    }

    return () => ac.abort();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _spring(el, targetX) {
    el.style.transition = 'transform 0.28s cubic-bezier(0.23,1,0.32,1)';
    el.style.transform  = `translateX(${targetX}px)`;
    setTimeout(() => { el.style.transition = ''; el.style.transform = ''; }, 300);
}

function _haptic() {
    try { navigator.vibrate?.(HAPTIC_DURATION); } catch {}
}

function _getActiveId() {
    // Read from location.hash (the router's source of truth)
    return (location.hash || '').replace(/^#\/?/, '');
}
