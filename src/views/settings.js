/**
 * SETTINGS — account, preferenze, gestione dati.
 *
 * Part 10: Glassmorphism Bottom Sheet architecture.
 * The settings view is now a slide-up bottom sheet with:
 *   - Backdrop blur + glass surface
 *   - Drag handle (swipe down to dismiss)
 *   - Spring animation (CSS translate + cubic-bezier)
 *   - Touch-driven drag-to-dismiss
 *   - Theme toggle integration (Part 7)
 *   - Kino Wrapped launcher (Part 10)
 */

import { getUser, logout } from '../core/auth.js';
import { getState, destroy as storeDestroy } from '../core/store.js';
import { exportMoviesJSON, exportMoviesCSV, importMoviesJSON, getProfile, saveProfile } from '../data/repo.js';
import { ThemeManager } from '../core/theme.js';
import { openWrapped } from '../components/wrapped.js';
import i18n from '../core/i18n.js';

export const settings = {
    id: 'settings', label: 'Settings', icon: '⚙️', hidden: true,

    async mount(el, ctx) {
        // Settings renders as bottom sheet — el is used as a wrapper but the
        // actual UI is a sheet that overlays the whole app.
        el.innerHTML = '';
        _openSheet(ctx?.user);
    },

    unmount() {
        // Sheet manages its own lifecycle; unmount is a no-op.
    },
};

/**
 * Open the settings bottom sheet.
 * Can also be called directly: openSettingsSheet()
 * @param {object|null} user — Firebase Auth user
 */
export async function openSettingsSheet(user) {
    _openSheet(user);
}

async function _openSheet(user) {
    user = user || getUser();

    // Avoid duplicate sheets
    if (document.getElementById('settingsSheet')) return;

    let profile = {};
    const { movies = [] } = getState();
    try { profile = await getProfile(); } catch {}

    const watched = movies.filter(m => !m.isWatchlist && m.rating != null);
    const wl      = movies.filter(m => m.isWatchlist);
    const displayName = profile.displayName || user?.displayName || (i18n.t('profile') || 'Utente');
    const photoURL    = profile.photoURL    || user?.photoURL    || '';
    const lang        = profile.language    || 'it';

    if (i18n.getLanguage() !== lang) i18n.setLanguage(lang);

    // ── Build sheet ─────────────────────────────────────────────────────────
    const sheet = document.createElement('div');
    sheet.id        = 'settingsSheet';
    sheet.className = 'settings-sheet-backdrop';
    sheet.innerHTML = `
      <div class="settings-sheet" id="settingsSheetPanel">
        <!-- Drag handle -->
        <div class="sheet-handle" id="sheetHandle"><div class="sheet-handle-bar"></div></div>

        <div class="settings-sheet-body">
          <div class="settings-page">
            <h2 class="serif accent" style="margin-bottom:24px">${i18n.t('settings')}</h2>

            <!-- Profile -->
            <div class="settings-section">
              <h3>${i18n.t('profile')}</h3>
              <div class="settings-profile">
                <div class="settings-avatar-wrap">
                  <img src="${esc(photoURL)}" class="settings-avatar" alt=""
                       referrerpolicy="no-referrer" id="setAvatar">
                  <label class="settings-avatar-edit" title="Cambia foto">
                    ✎<input type="file" accept="image/*" id="setAvatarFile" hidden>
                  </label>
                </div>
                <div class="settings-profile-fields">
                  <div class="settings-field">
                    <label class="settings-field-label">Nome</label>
                    <input type="text" class="filter-input" id="setName"
                           value="${esc(displayName)}" style="max-width:240px">
                  </div>
                  <div class="settings-email">${esc(user?.email || '')}</div>
                </div>
              </div>
              <button class="btn btn-sm btn-accent" id="setSaveProfile" style="margin-top:8px">
                ${i18n.t('saveProfile')}
              </button>
              <div id="setProfileMsg" style="font-size:.82rem;margin-top:6px;display:none"></div>
            </div>

            <!-- Preferences -->
            <div class="settings-section">
              <h3>${i18n.t('preferences')}</h3>
              <div class="settings-row">
                <span class="settings-label">${i18n.t('theme')}</span>
                <button class="btn btn-sm" data-action="theme-toggle" id="themeToggleBtn">
                  ${ThemeManager.current === 'dark' ? '☀︎ Light' : '◗ Dark'}
                </button>
              </div>
              <div class="settings-row">
                <span class="settings-label">${i18n.t('landing')}</span>
                <select class="filter-select" id="setLanding" style="min-width:120px">
                  <option value="home"       ${profile.landing === 'home'       || !profile.landing ? 'selected' : ''}>Home</option>
                  <option value="explore"    ${profile.landing === 'explore'    ? 'selected' : ''}>Explore</option>
                  <option value="archive"    ${profile.landing === 'archive'    ? 'selected' : ''}>Archive</option>
                  <option value="watchlist"  ${profile.landing === 'watchlist'  ? 'selected' : ''}>Watchlist</option>
                </select>
              </div>
              <div class="settings-row">
                <span class="settings-label">${i18n.t('language')}</span>
                <select class="filter-select" id="setLang" style="min-width:120px">
                  <option value="it" ${lang === 'it' ? 'selected' : ''}>Italiano</option>
                  <option value="en" ${lang === 'en' ? 'selected' : ''}>English</option>
                </select>
              </div>
            </div>

            <!-- Your Data -->
            <div class="settings-section">
              <h3>${i18n.t('your_data')}</h3>
              <div class="settings-row">
                <span class="settings-label">${i18n.t('films_seen')}</span>
                <span class="settings-value mono">${watched.length}</span>
              </div>
              <div class="settings-row">
                <span class="settings-label">${i18n.t('in_watchlist')}</span>
                <span class="settings-value mono">${wl.length}</span>
              </div>
              <div class="settings-row">
                <span class="settings-label">${i18n.t('total_label')}</span>
                <span class="settings-value mono">${movies.length}</span>
              </div>
              <div class="settings-actions">
                <button class="btn btn-sm" id="setExpCSV">${i18n.t('export_csv')}</button>
                <button class="btn btn-sm" id="setExpJSON">${i18n.t('export_json')}</button>
                <label class="btn btn-sm" style="cursor:pointer">
                  ${i18n.t('import_json')}
                  <input type="file" accept=".json" id="setImpJSON" hidden>
                </label>
              </div>
              <div id="setImportMsg" style="font-size:.82rem;margin-top:8px;display:none"></div>
            </div>

            <!-- Kino Wrapped -->
            <div class="settings-section">
              <h3>✦ Kino Wrapped</h3>
              <p style="font-size:.84rem;color:var(--ink-dim);margin-bottom:12px">
                Generate your personalised ${new Date().getFullYear()} cinema year card.
              </p>
              <button class="btn btn-accent btn-sm" id="wrappedBtn">Open Wrapped</button>
            </div>

            <!-- Logout -->
            <div class="settings-section">
              <h3>${i18n.t('account_label') || 'Account'}</h3>
              <button class="btn btn-sm" id="setLogoutBtn" style="border-color:var(--red);color:var(--red)">
                ⏻ ${i18n.t('logout') || 'Logout'}
              </button>
            </div>

            <!-- Info -->
            <div class="settings-section">
              <h3>${i18n.t('info_label')}</h3>
              <div class="settings-row">
                <span class="settings-label">${i18n.t('version_label')}</span>
                <span class="settings-value mono">2.0.0</span>
              </div>
              <div class="settings-row">
                <span class="settings-label">${i18n.t('project_label')}</span>
                <span class="settings-value">Kino</span>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    document.body.appendChild(sheet);
    _animateIn(sheet.querySelector('#settingsSheetPanel'));
    _attachDragDismiss(sheet, sheet.querySelector('#settingsSheetPanel'), () => sheet.remove());

    // Backdrop click
    sheet.addEventListener('click', e => { if (e.target === sheet) _animateOut(sheet); });

    // ── Handlers ─────────────────────────────────────────────────────────────

    // Profile save
    sheet.querySelector('#setSaveProfile').addEventListener('click', async () => {
        const name = sheet.querySelector('#setName').value.trim();
        const msg  = sheet.querySelector('#setProfileMsg');
        if (!name) return;
        msg.style.display = 'block'; msg.style.color = 'var(--ink-dim)';
        msg.textContent = i18n.t('saving');
        try {
            await saveProfile({ displayName: name });
            msg.style.color = 'var(--green)'; msg.textContent = i18n.t('profileUpdated');
        } catch (e) {
            msg.style.color = 'var(--red)'; msg.textContent = `${i18n.t('error')}: ${e.message}`;
        }
    });

    // Avatar
    sheet.querySelector('#setAvatarFile').addEventListener('change', async e => {
        const file = e.target.files?.[0]; if (!file) return;
        const msg  = sheet.querySelector('#setProfileMsg');
        try {
            const dataUrl = await _fileToDataUrl(file);
            sheet.querySelector('#setAvatar').src = dataUrl;
            await saveProfile({ photoURL: dataUrl });
            msg.style.display = 'block'; msg.style.color = 'var(--green)';
            msg.textContent = i18n.t('photo_updated');
        } catch (e) {
            msg.style.display = 'block'; msg.style.color = 'var(--red)';
            msg.textContent = `${i18n.t('avatarError')}: ${e.message}`;
        }
    });

    // Logout
    sheet.querySelector('#setLogoutBtn').addEventListener('click', () => {
        storeDestroy();
        logout();
    });

    // Theme toggle
    sheet.querySelector('#themeToggleBtn').addEventListener('click', () => {
        ThemeManager.toggle();
        const btn = sheet.querySelector('#themeToggleBtn');
        if (btn) btn.textContent = ThemeManager.current === 'dark' ? '☀︎ Light' : '◗ Dark';
    });

    // Landing + Language
    sheet.querySelector('#setLanding').addEventListener('change', async e => {
        try { await saveProfile({ landing: e.target.value }); } catch {}
    });
    sheet.querySelector('#setLang').addEventListener('change', async e => {
        try { await saveProfile({ language: e.target.value }); i18n.setLanguage(e.target.value); } catch {}
    });

    // Export / Import
    sheet.querySelector('#setExpCSV').addEventListener('click', () => exportMoviesCSV(movies));
    sheet.querySelector('#setExpJSON').addEventListener('click', () => exportMoviesJSON(movies));
    sheet.querySelector('#setImpJSON').addEventListener('change', async e => {
        const file = e.target.files?.[0]; if (!file) return;
        const msg  = sheet.querySelector('#setImportMsg');
        msg.style.display = 'block'; msg.style.color = 'var(--ink-dim)';
        msg.textContent = i18n.t('saving');
        try {
            const count = await importMoviesJSON(JSON.parse(await file.text()));
            msg.style.color = 'var(--green)';
            msg.textContent = i18n.t('import_success').replace('{count}', String(count));
        } catch (err) {
            msg.style.color = 'var(--red)';
            msg.textContent = `${i18n.t('error')}: ${err.message}`;
        }
    });

    // Wrapped
    sheet.querySelector('#wrappedBtn').addEventListener('click', () => {
        _animateOut(sheet);
        setTimeout(() => openWrapped(movies), 300);
    });
}

// ── Animation helpers ──────────────────────────────────────────────────────

function _animateIn(panel) {
    panel.style.transform = 'translateY(100%)';
    panel.style.transition = 'none';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            panel.style.transition = 'transform 0.38s cubic-bezier(0.23, 1, 0.32, 1)';
            panel.style.transform  = 'translateY(0)';
        });
    });
}

function _animateOut(sheet) {
    const panel = sheet.querySelector('#settingsSheetPanel');
    if (panel) {
        panel.style.transition = 'transform 0.28s cubic-bezier(0.4, 0, 1, 1)';
        panel.style.transform  = 'translateY(100%)';
    }
    setTimeout(() => sheet.remove(), 300);
}

function _attachDragDismiss(sheet, panel, onDismiss) {
    const handle = sheet.querySelector('#sheetHandle');
    if (!handle) return;

    let startY = 0, lastY = 0, dragging = false;
    const ac = new AbortController();
    const sig = { signal: ac.signal };

    handle.addEventListener('touchstart', e => {
        startY = lastY = e.touches[0].clientY;
        dragging = true;
        panel.style.transition = 'none';
    }, { passive: true, ...sig });

    handle.addEventListener('touchmove', e => {
        if (!dragging) return;
        lastY = e.touches[0].clientY;
        const dy = Math.max(0, lastY - startY);
        panel.style.transform = `translateY(${dy}px)`;
    }, { passive: true, ...sig });

    handle.addEventListener('touchend', () => {
        if (!dragging) return;
        dragging = false;
        const dy = lastY - startY;
        if (dy > 120) {
            ac.abort();
            _animateOut(sheet);
            setTimeout(onDismiss, 300);
        } else {
            panel.style.transition = 'transform 0.28s cubic-bezier(0.23,1,0.32,1)';
            panel.style.transform  = 'translateY(0)';
        }
    }, sig);
}

// ── Utilities ──────────────────────────────────────────────────────────────

function _fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const img    = new Image();
        img.onload = () => {
            const size = 128;
            canvas.width = size; canvas.height = size;
            const ctx = canvas.getContext('2d');
            const s   = Math.min(img.width, img.height);
            ctx.drawImage(img, (img.width-s)/2, (img.height-s)/2, s, s, 0, 0, size, size);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = () => reject(new Error('Immagine non valida'));
        img.src = URL.createObjectURL(file);
    });
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
