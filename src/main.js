/** KINO — bootstrap. */
import { onAuth, login, logout } from './core/auth.js';
import { flushOfflineQueue } from './data/repo.js';
import * as router from './core/router.js';
import i18n from './core/i18n.js';
import { home }      from './views/home.js';
import { explore }   from './views/explore.js';
import { archive }   from './views/archive.js';
import { watchlist } from './views/watchlist.js';
import { battle }    from './views/battle.js';
import { vault }     from './views/vault.js';
import { settings }  from './views/settings.js';

// Home e Settings sono hidden (non compaiono come tab)
[home, explore, archive, watchlist, battle, vault, settings].forEach(router.register);

const gate    = document.getElementById('gate');
const appEl   = document.getElementById('app');
const viewEl  = document.getElementById('view');
const tabsEl  = document.getElementById('tabs');

document.getElementById('loginBtn').addEventListener('click', () => login());
document.getElementById('logoutBtn').addEventListener('click', () => logout());
document.getElementById('homeBtn').addEventListener('click', () => router.navigate('home'));
document.getElementById('settingsBtn').addEventListener('click', () => router.navigate('settings'));

// Tab bar generata dal registry (esclude viste hidden)
function buildTabs() {
    tabsEl.innerHTML = '';
    router.listViews().filter(v => !v.hidden).forEach(v => {
        const b = document.createElement('button');
        b.className = 'kino-tab'; b.dataset.id = v.id;
        b.textContent = v.label;
        b.addEventListener('click', () => router.navigate(v.id));
        tabsEl.appendChild(b);
    });
}
document.addEventListener('view:change', e => {
    tabsEl.querySelectorAll('.kino-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.id === e.detail.id));
});

// Re-render active view when language changes
document.addEventListener('i18n:change', () => {
    try { router.navigate(router.getActiveId(), false); } catch (e) { console.warn('re-render on i18n change failed', e); }
});

let started = false;
onAuth(user => {
    if (user) {
        gate.hidden = true; appEl.hidden = false;
        flushOfflineQueue().catch(() => {});
        if (!started) {
            buildTabs();
            router.init(viewEl, { user });
            router.start();
            started = true;
        }
    } else {
        appEl.hidden = true; gate.hidden = false;
    }
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
