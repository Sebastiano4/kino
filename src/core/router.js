/**
 * KINO ROUTER — hash-based SPA router with lazy-loading and preload.
 *
 * Problem: main.js statically imports all 7 views at startup. On a cold load
 * the browser must parse, compile and execute every view module before the
 * user sees anything — even views they never visit this session.
 *
 * Solution: route-based code splitting via dynamic import().
 * - Views load only when first visited (lazy).
 * - Already-loaded modules are cached — zero cost on repeat visits.
 * - Tabs preload their target on mouseenter/touchstart for zero-latency navigation.
 * - Error boundaries per route prevent one broken view from killing the app.
 *
 * Performance (estimated for ~6 view modules, ~40 KB total minified):
 *   FCP:  −200–400 ms on slow 3G (less JS to parse before first render)
 *   TTI:  −300–600 ms (main thread unblocked earlier)
 *   Bundle reduction for initial load: ~70% of view code deferred
 *
 * Migration from eager to lazy:
 *   Before: import { archive } from './views/archive.js'; router.register(archive);
 *   After:  router.registerLazy({ id:'archive', label:'Archive', icon:'🎬',
 *               load: () => import('./views/archive.js').then(m => m.archive) });
 *
 * Eager views (register()) are still fully supported for zero-breaking-change.
 */

// ── types ──────────────────────────────────────────────────────────────────
// RouteEntry = {
//   id: string, label: string, icon: string, hidden?: boolean,
//   view?:  ViewObject,        // eager — always present
//   load?:  () => Promise<ViewObject>,  // lazy — loaded on first visit
//   _mod?:  ViewObject|null,   // cache for loaded lazy view
//   _loading?: boolean,        // dedup concurrent load calls
// }
//
// ViewObject = { id, label, icon, hidden?, mount(el,ctx), unmount?() }

// ── state ──────────────────────────────────────────────────────────────────

/** @type {Map<string, RouteEntry>} */
const _routes = new Map();
/** Insertion order for tab rendering */
let _order    = [];
let _activeId   = null;
let _activeView = null;
let _rootEl     = null;
let _ctx        = null;
let _loadingEl  = null; // injected loading indicator

// ── public API ─────────────────────────────────────────────────────────────

/**
 * Register an eager (already-imported) view.
 * Backward-compatible with existing code.
 */
export function register(view) {
    if (!view?.id || typeof view.mount !== 'function') {
        throw new Error(`[router] invalid view — needs { id, mount }: ${JSON.stringify(view?.id)}`);
    }
    _upsert({ id: view.id, label: view.label, icon: view.icon, hidden: view.hidden, view });
}

/**
 * Register a lazy view.
 * @param {{ id, label, icon, hidden?, load: ()=>Promise<ViewObject> }} descriptor
 */
export function registerLazy({ id, label, icon, hidden, load }) {
    if (!id || typeof load !== 'function') {
        throw new Error(`[router] registerLazy needs { id, load }: ${id}`);
    }
    _upsert({ id, label, icon, hidden, load, _mod: null, _loading: false });
}

/** Attach the router to a DOM container. Call once after auth. */
export function init(container, context) {
    _rootEl = container;
    _ctx    = context;
    window.addEventListener('hashchange', () => navigate(_hashId(), false));
}

/** Navigate to initial route. Call after init(). */
export function start() {
    navigate(_hashId(), false);
}

/**
 * Navigate to a route by id.
 * @param {string}  id
 * @param {boolean} pushHash — whether to update location.hash (default true)
 */
export async function navigate(id, pushHash = true) {
    const entry = _routes.get(id) || _routes.get(_order[0]);
    if (!entry) return;

    // Unmount previous view
    if (_activeView?.unmount) {
        try { _activeView.unmount(); } catch (e) { console.warn('[router] unmount error', e); }
    }

    _rootEl.innerHTML = '';
    _showLoadingSpinner();

    const view = await _resolve(entry);

    _hideLoadingSpinner();
    if (!view) {
        _rootEl.innerHTML = `<div class="center-screen empty"><div class="big">Errore</div>Impossibile caricare questa vista.</div>`;
        return;
    }

    _activeId   = view.id;
    _activeView = view;

    if (pushHash) location.hash = `#/${view.id}`;
    document.dispatchEvent(new CustomEvent('view:change', { detail: { id: view.id } }));

    try {
        await view.mount(_rootEl, _ctx);
    } catch (e) {
        console.error('[router] mount error', e);
        _rootEl.innerHTML = `<div class="center-screen empty"><div class="big">Errore</div>${e.message}</div>`;
    }
}

/**
 * Preload a route's module without mounting it.
 * Call on tab mouseenter/touchstart for instant perceived navigation.
 * @param {string} id
 */
export async function preload(id) {
    const entry = _routes.get(id);
    if (entry && entry.load && !entry._mod) {
        try { entry._mod = await entry.load(); } catch {}
    }
}

export const getActiveId = () => _activeId;

/** Returns all route entries in registration order. */
export function listViews() {
    return _order.map(id => _routes.get(id));
}

// ── private ────────────────────────────────────────────────────────────────

function _upsert(entry) {
    _routes.set(entry.id, entry);
    if (!_order.includes(entry.id)) _order.push(entry.id);
}

/**
 * Resolve a route entry to a ViewObject.
 * - Eager: returns entry.view immediately.
 * - Lazy: loads and caches the module, deduplicates concurrent calls.
 */
async function _resolve(entry) {
    if (entry.view) return entry.view;         // eager
    if (entry._mod) return entry._mod;         // cached lazy

    if (entry._loading) {
        // Already in flight — wait for it
        return new Promise(resolve => {
            const poll = setInterval(() => {
                if (!entry._loading) { clearInterval(poll); resolve(entry._mod); }
            }, 30);
        });
    }

    entry._loading = true;
    try {
        entry._mod    = await entry.load();
        entry._loading = false;
        return entry._mod;
    } catch (e) {
        entry._loading = false;
        console.error('[router] lazy load failed:', entry.id, e);
        return null;
    }
}

function _hashId() {
    return (location.hash || '').replace(/^#\/?/, '') || _order[0];
}

function _showLoadingSpinner() {
    if (_loadingEl) return;
    _loadingEl = document.createElement('div');
    _loadingEl.className = 'router-loading';
    _loadingEl.innerHTML = '<div class="router-spinner"></div>';
    _rootEl.appendChild(_loadingEl);
}

function _hideLoadingSpinner() {
    if (_loadingEl) { _loadingEl.remove(); _loadingEl = null; }
}
