/**
 * KINO — bootstrap.
 *
 * Changes vs original:
 * 1. Part 2: All views registered as lazy (dynamic import). Home is
 *    preloaded immediately after registration for zero first-paint cost.
 * 2. Part 1: store.init() called once on auth; store.destroy() on logout.
 * 3. Part 7: ThemeManager.init() for dark/light mode.
 * 4. Part 10: swipe gestures attached to view container.
 * 5. Settings uses openSettingsSheet() bottom sheet instead of router.navigate().
 */

import { onAuth, login, logout } from './core/auth.js';
import { flushOfflineQueue } from './data/repo.js';
import * as router from './core/router.js';
import { init as storeInit, destroy as storeDestroy } from './core/store.js';
import { ThemeManager } from './core/theme.js';
import { attachSwipeNav } from './core/gestures.js';
import i18n from './core/i18n.js';

// ── Theme — must init before first paint ──────────────────────────────────
ThemeManager.init();

// ── Lazy route registry ───────────────────────────────────────────────────
// Eager: home (landing), explore (primary flow)
// Lazy:  archive, watchlist, battle, vault, settings (visited later)

router.registerLazy({
    id: 'home', label: 'Home', icon: '🏠', hidden: true,
    load: () => import('./views/home.js').then(m => m.home),
});

router.registerLazy({
    id: 'explore', label: 'Explore', icon: '🔍',
    load: () => import('./views/explore.js').then(m => m.explore),
});

router.registerLazy({
    id: 'archive', label: 'Archive', icon: '🎬',
    load: () => import('./views/archive.js').then(m => m.archive),
});

router.registerLazy({
    id: 'watchlist', label: 'Watchlist', icon: '📋',
    load: () => import('./views/watchlist.js').then(m => m.watchlist),
});

router.registerLazy({
    id: 'battle', label: 'Battle', icon: '⚔️',
    load: () => import('./views/battle.js').then(m => m.battle),
});

router.registerLazy({
    id: 'vault', label: 'Vault', icon: '📊',
    load: () => import('./views/vault.js').then(m => m.vault),
});

// Settings is not a view in the router — it opens as a bottom sheet.
// Registered only so legacy hash links still work gracefully.
router.registerLazy({
    id: 'settings', label: 'Settings', icon: '⚙️', hidden: true,
    load: () => import('./views/settings.js').then(m => m.settings),
});

// Preload home + explore immediately (zero extra wait on first navigate)
router.preload('home');
router.preload('explore');

// ── DOM refs ──────────────────────────────────────────────────────────────
const gate      = document.getElementById('gate');
const appEl     = document.getElementById('app');
const viewEl    = document.getElementById('view');
const tabsEl    = document.getElementById('tabs');

document.getElementById('loginBtn').addEventListener('click', () => login());

document.getElementById('homeBtn').addEventListener('click', () => router.navigate('home'));

// Profile → full-page router view
document.getElementById('settingsBtn').addEventListener('click', () => router.navigate('settings'));

// ── Tab bar ───────────────────────────────────────────────────────────────
function buildTabs() {
    tabsEl.innerHTML = '';
    router.listViews().filter(v => !v.hidden).forEach(v => {
        const b = document.createElement('button');
        b.className    = 'kino-tab';
        b.dataset.id   = v.id;
        b.textContent  = v.label;

        // Navigate on click
        b.addEventListener('click', () => router.navigate(v.id));

        // Preload on hover / touchstart (zero-latency navigation)
        b.addEventListener('mouseenter',  () => router.preload(v.id), { passive: true });
        b.addEventListener('touchstart',  () => router.preload(v.id), { passive: true });

        tabsEl.appendChild(b);
    });
}

document.addEventListener('view:change', e => {
    tabsEl.querySelectorAll('.kino-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.id === e.detail.id));
});

// Re-render active view on language change
document.addEventListener('i18n:change', () => {
    try { router.navigate(router.getActiveId(), false); } catch (e) { console.warn('i18n re-render', e); }
});

// ── Auth state ────────────────────────────────────────────────────────────
let started    = false;
let detachSwipe = null;

onAuth(async user => {
    if (user) {
        gate.hidden  = true;
        appEl.hidden = false;
        flushOfflineQueue().catch(() => {});

        if (!started) {
            started = true;
            buildTabs();
            router.init(viewEl, { user });

            // Start store (opens Firestore listener)
            await storeInit();

            router.start();

            // Part 10: swipe gestures on the view container
            detachSwipe = attachSwipeNav(
                viewEl,
                () => router.listViews(),
                id  => router.navigate(id),
            );
        }
    } else {
        if (detachSwipe) { detachSwipe(); detachSwipe = null; }
        appEl.hidden = true;
        gate.hidden  = false;
        started      = false;
    }
});

// ── Service Worker ────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
}
