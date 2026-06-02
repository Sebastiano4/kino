/**
 * KINO THEME MANAGER — dark / light / system preference.
 *
 * No-FOUC guarantee: index.html inlines a tiny script that reads localStorage
 * and sets data-theme on <html> BEFORE any CSS is parsed. This module then
 * hydrates the toggle button and handles runtime switching.
 *
 * Usage:
 *   import { ThemeManager } from './core/theme.js';
 *   ThemeManager.init(); // call once in main.js after auth
 *
 * Toggle button:
 *   Any element with data-action="theme-toggle" gets wired automatically.
 *
 * Persistence: localStorage key "kino-theme" → 'dark' | 'light' | 'system'
 */

const LS_KEY   = 'kino-theme';
const DARK     = 'dark';
const LIGHT    = 'light';
const SYSTEM   = 'system';

let _current     = DARK; // effective resolved theme (never 'system')
let _preference  = DARK; // stored preference (can be 'system')
let _mqListener  = null;
let _subscribers = new Set();

// ── public API ─────────────────────────────────────────────────────────────

export const ThemeManager = {
    /**
     * Initialise the theme manager. Call once in main.js.
     * Reads localStorage, applies the resolved theme, wires up toggle buttons.
     */
    init() {
        _preference = localStorage.getItem(LS_KEY) || SYSTEM;
        _apply(_resolve(_preference));
        _watchSystem();
        _wireButtons();
    },

    /** Returns the *effective* theme ('dark' | 'light'). */
    get current() { return _current; },

    /** Returns the stored preference ('dark' | 'light' | 'system'). */
    get preference() { return _preference; },

    /** Set the theme. Pass 'dark', 'light', or 'system'. */
    set(theme) {
        if (![DARK, LIGHT, SYSTEM].includes(theme)) return;
        _preference = theme;
        localStorage.setItem(LS_KEY, theme);
        _apply(_resolve(theme));
    },

    /** Toggle between dark and light (ignores 'system'). */
    toggle() {
        this.set(_current === DARK ? LIGHT : DARK);
    },

    /**
     * Subscribe to theme changes.
     * @param {function} fn  — receives 'dark' | 'light'
     * @returns {function}   — unsubscribe
     */
    subscribe(fn) {
        _subscribers.add(fn);
        return () => _subscribers.delete(fn);
    },
};

// ── private ────────────────────────────────────────────────────────────────

function _resolve(pref) {
    if (pref === SYSTEM) {
        return window.matchMedia('(prefers-color-scheme: light)').matches ? LIGHT : DARK;
    }
    return pref;
}

function _apply(theme) {
    _current = theme;
    document.documentElement.dataset.theme = theme;
    // Update theme-color meta for PWA chrome
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === LIGHT ? '#f4f5f7' : '#060a10';
    // Sync toggle buttons
    _wireButtons();
    // Notify subscribers
    _subscribers.forEach(fn => { try { fn(theme); } catch {} });
}

function _watchSystem() {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    // Remove old listener if any
    if (_mqListener) { try { mq.removeEventListener('change', _mqListener); } catch {} }
    _mqListener = () => {
        if (_preference === SYSTEM) _apply(_resolve(SYSTEM));
    };
    mq.addEventListener('change', _mqListener);
}

function _wireButtons() {
    document.querySelectorAll('[data-action="theme-toggle"]').forEach(btn => {
        btn.textContent = _current === DARK ? '☀︎' : '◗';
        btn.title       = _current === DARK ? 'Switch to Light Mode' : 'Switch to Dark Mode';
        // Avoid duplicate listeners by cloning
        const fresh = btn.cloneNode(true);
        btn.replaceWith(fresh);
        fresh.addEventListener('click', () => ThemeManager.toggle());
    });
}

/**
 * Inline script to paste into index.html <head> BEFORE any CSS link.
 * Prevents the flash of unstyled (dark) content when user prefers light.
 *
 * <script>
 *   (function(){
 *     var t=localStorage.getItem('kino-theme')||'system';
 *     var d=(t==='system')?(window.matchMedia('(prefers-color-scheme:light)').matches?'light':'dark'):t;
 *     document.documentElement.dataset.theme=d;
 *   })();
 * </script>
 */
