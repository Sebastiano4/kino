/**
 * ROUTER / REGISTRY VISTE — il perno dell'estensibilità.
 *
 * Aggiungere una nuova modalità = 2 righe:
 *   import { myView } from '../views/my-view.js';
 *   register(myView);
 *
 * Ogni vista è un oggetto:
 *   { id, label, icon, mount(el, ctx), unmount?() }
 * - mount: riceve il container DOM e un ctx (services, data, user). Disegna la UI.
 * - unmount: cleanup opzionale (listener, timer) quando si lascia la vista.
 */

const views = new Map();
let order = [];
let activeId = null;
let activeView = null;
let rootEl = null;
let ctx = null;

export function register(view) {
    if (!view?.id || typeof view.mount !== 'function') {
        throw new Error('View non valida: serve { id, mount }');
    }
    views.set(view.id, view);
    if (!order.includes(view.id)) order.push(view.id);
}

export function listViews() {
    return order.map(id => views.get(id));
}

export function init(container, context) {
    rootEl = container;
    ctx = context;
    window.addEventListener('hashchange', () => navigate(currentHashId(), false));
}

function currentHashId() {
    return (location.hash || '').replace(/^#\/?/, '') || order[0];
}

export function start() {
    navigate(currentHashId(), false);
}

export async function navigate(id, pushHash = true) {
    const view = views.get(id) || views.get(order[0]);
    if (!view) return;
    if (activeView?.unmount) {
        try { activeView.unmount(); } catch (e) { console.warn('unmount error', e); }
    }
    rootEl.innerHTML = '';
    activeId = view.id;
    activeView = view;
    if (pushHash) location.hash = `#/${view.id}`;
    document.dispatchEvent(new CustomEvent('view:change', { detail: { id: view.id } }));
    await view.mount(rootEl, ctx);
}

export const getActiveId = () => activeId;
