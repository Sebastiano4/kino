/**
 * PROFILE — full-page account / preferences / data screen.
 *
 * Was a slide-up bottom sheet; redesigned into a real router view reached from
 * the nav profile icon. Sections: profile header (avatar + name + email),
 * Preferences (theme · landing · language), Kino Wrapped, Your data
 * (counts + export/import), Account (logout), version.
 *
 * Counts are reactive via the singleton store. `openSettingsSheet` is kept as a
 * thin alias that navigates here, so legacy callers keep working.
 */
import { getUser, logout } from '../core/auth.js';
import { init, subscribe, getState, destroy as storeDestroy } from '../core/store.js';
import { exportMoviesJSON, exportMoviesCSV, importMoviesJSON, getProfile, saveProfile } from '../data/repo.js';
import { ThemeManager } from '../core/theme.js';
import { openWrapped } from '../components/wrapped.js';
import { showToast } from '../components/toast.js';
import { navigate } from '../core/router.js';
import i18n from '../core/i18n.js';

const LANDINGS = ['home', 'explore', 'archive', 'watchlist'];
const LANGS    = [{ id: 'it', label: 'Italiano' }, { id: 'en', label: 'English' }];

export const settings = {
    id: 'settings', label: 'Settings', icon: '⚙️', hidden: true,
    _unsub: null,

    async mount(el, ctx) {
        const user = ctx?.user || getUser();
        let profile = {};
        try { profile = await getProfile(); } catch {}

        const displayName = profile.displayName || user?.displayName || (i18n.t('profile') || 'Profile');
        const photoURL    = profile.photoURL    || user?.photoURL    || '';
        const lang        = profile.language    || i18n.getLanguage?.() || 'it';
        const landing     = profile.landing     || 'home';
        if (i18n.getLanguage?.() !== lang) i18n.setLanguage(lang);

        const initials = displayName.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';

        el.innerHTML = `
          <div class="profile-page">

            <div class="profile-head">
              <div class="avatar" id="pfAvatar">
                ${photoURL ? `<img src="${esc(photoURL)}" alt="" referrerpolicy="no-referrer">` : esc(initials)}
                <label class="avatar-edit" title="${esc(i18n.t('change_photo') || 'Change photo')}">✎<input type="file" accept="image/*" id="pfAvatarFile" hidden></label>
              </div>
              <div class="profile-info">
                <div class="profile-name-wrap" id="pfNameWrap">
                  <span class="profile-name" id="pfName">${esc(displayName)}</span>
                  <button class="profile-edit-btn" id="pfEdit">${esc(i18n.t('edit') || 'edit')}</button>
                </div>
                <div class="profile-email">${esc(user?.email || '')}</div>
              </div>
            </div>

            <div class="pf-section">
              <div class="pf-section-title">${esc(i18n.t('preferences'))}</div>
              <div class="pref-row">
                <span class="pref-label">${esc(i18n.t('theme'))}</span>
                <div class="seg" id="pfTheme">
                  <button class="seg-opt${ThemeManager.current !== 'dark' ? ' active' : ''}" data-theme="light">☀ ${esc(i18n.t('theme_light') || 'Light')}</button>
                  <button class="seg-opt${ThemeManager.current === 'dark' ? ' active' : ''}" data-theme="dark">☾ ${esc(i18n.t('theme_dark') || 'Dark')}</button>
                </div>
              </div>
              <div class="pref-row">
                <span class="pref-label">${esc(i18n.t('landing'))}</span>
                <div class="pref-chips" id="pfLanding">
                  ${LANDINGS.map(l => `<button class="pchip${landing === l ? ' active' : ''}" data-val="${l}">${esc(cap(l))}</button>`).join('')}
                </div>
              </div>
              <div class="pref-row">
                <span class="pref-label">${esc(i18n.t('language'))}</span>
                <div class="pref-chips" id="pfLang">
                  ${LANGS.map(l => `<button class="pchip${lang === l.id ? ' active' : ''}" data-val="${l.id}">${esc(l.label)}</button>`).join('')}
                </div>
              </div>
            </div>

            <div class="pf-section">
              <div class="pf-section-title">✦ Kino Wrapped</div>
              <div class="wrapped">
                <div class="wrapped-yr">${new Date().getFullYear()}</div>
                <div class="wrapped-eyebrow">✦ ${esc(i18n.t('wrapped_eyebrow') || 'Your year in film')}</div>
                <div class="wrapped-title">Kino Wrapped ${new Date().getFullYear()}</div>
                <div class="wrapped-body">${esc(i18n.t('wrapped_body') || 'Your personal cinema story — films, directors, obsessions and discoveries from the whole year.')}</div>
                <button class="wrapped-cta" id="pfWrapped">${esc(i18n.t('wrapped_open') || 'Open Wrapped')} →</button>
              </div>
            </div>

            <div class="pf-section">
              <div class="pf-section-title">${esc(i18n.t('your_data'))}</div>
              <div class="data-block">
                <div class="data-row"><span class="data-row-label">${esc(i18n.t('films_seen'))}</span><span class="data-row-val" id="pfSeen">—</span></div>
                <div class="data-row"><span class="data-row-label">${esc(i18n.t('in_watchlist'))}</span><span class="data-row-val" id="pfWl">—</span></div>
                <div class="data-row"><span class="data-row-label">${esc(i18n.t('total_label'))}</span><span class="data-row-val" id="pfTotal">—</span></div>
                <div class="data-exp-row">
                  <button class="dexp" id="pfExpCSV">${esc(i18n.t('export_csv'))}</button>
                  <button class="dexp" id="pfExpJSON">${esc(i18n.t('export_json'))}</button>
                  <label class="dexp dimp">${esc(i18n.t('import_json'))}<input type="file" accept=".json" id="pfImp" hidden></label>
                </div>
              </div>
            </div>

            <div class="pf-section">
              <div class="pf-section-title">${esc(i18n.t('account_label') || 'Account')}</div>
              <div class="account-row">
                <span class="account-email">${esc(user?.email || '')}</span>
                <button class="logout-btn" id="pfLogout">⏻ ${esc(i18n.t('logout') || 'Logout')}</button>
              </div>
            </div>

            <div class="version-note">Kino v2.0.0</div>
          </div>`;

        // ── Reactive counts ───────────────────────────────────────────────────
        await init();
        const paintCounts = ({ movies = [] }) => {
            const seen = movies.filter(m => !m.isWatchlist && m.rating != null).length;
            const wl   = movies.filter(m => m.isWatchlist).length;
            el.querySelector('#pfSeen').textContent  = seen;
            el.querySelector('#pfWl').textContent    = wl;
            el.querySelector('#pfTotal').textContent = movies.length;
        };
        this._unsub = subscribe('settings', paintCounts);

        const movies = () => getState().movies || [];

        // ── Name edit ─────────────────────────────────────────────────────────
        el.querySelector('#pfEdit').addEventListener('click', () => {
            const wrap = el.querySelector('#pfNameWrap');
            const cur  = el.querySelector('#pfName')?.textContent || '';
            wrap.innerHTML = `<input class="profile-name-input" id="pfNameInput" value="${esc(cur)}">
              <button class="save-btn vis" id="pfNameSave">${esc(i18n.t('save'))}</button>`;
            const input = el.querySelector('#pfNameInput');
            input.focus();
            const save = async () => {
                const v = input.value.trim() || cur;
                wrap.innerHTML = `<span class="profile-name" id="pfName">${esc(v)}</span>
                  <button class="profile-edit-btn" id="pfEdit2">${esc(i18n.t('edit') || 'edit')}</button>`;
                el.querySelector('#pfEdit2').addEventListener('click', () => el.querySelector('#pfEdit')?.click());
                try { await saveProfile({ displayName: v }); showToast(i18n.t('profileUpdated'), { tone: 'neutral' }); } catch {}
            };
            el.querySelector('#pfNameSave').addEventListener('click', save);
            input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
        });

        // ── Avatar ────────────────────────────────────────────────────────────
        el.querySelector('#pfAvatarFile').addEventListener('change', async e => {
            const file = e.target.files?.[0]; if (!file) return;
            try {
                const dataUrl = await _fileToDataUrl(file);
                const av = el.querySelector('#pfAvatar');
                av.innerHTML = `<img src="${dataUrl}" alt="">
                  <label class="avatar-edit">✎<input type="file" accept="image/*" id="pfAvatarFile2" hidden></label>`;
                av.querySelector('#pfAvatarFile2').addEventListener('change', ev => {
                    el.querySelector('#pfAvatarFile').files = ev.target.files;
                });
                await saveProfile({ photoURL: dataUrl });
                showToast(i18n.t('photo_updated') || 'Photo updated', { tone: 'neutral' });
            } catch (err) { showToast(`${i18n.t('avatarError')}: ${err.message}`, { tone: 'error' }); }
        });

        // ── Theme ─────────────────────────────────────────────────────────────
        el.querySelector('#pfTheme').addEventListener('click', e => {
            const b = e.target.closest('.seg-opt'); if (!b) return;
            const want = b.dataset.theme;
            if (ThemeManager.current !== want) ThemeManager.toggle();
            el.querySelectorAll('#pfTheme .seg-opt').forEach(o => o.classList.toggle('active', o === b));
        });

        // ── Landing / Language chips ──────────────────────────────────────────
        el.querySelector('#pfLanding').addEventListener('click', async e => {
            const b = e.target.closest('.pchip'); if (!b) return;
            el.querySelectorAll('#pfLanding .pchip').forEach(c => c.classList.toggle('active', c === b));
            try { await saveProfile({ landing: b.dataset.val }); } catch {}
        });
        el.querySelector('#pfLang').addEventListener('click', async e => {
            const b = e.target.closest('.pchip'); if (!b) return;
            el.querySelectorAll('#pfLang .pchip').forEach(c => c.classList.toggle('active', c === b));
            try { await saveProfile({ language: b.dataset.val }); } catch {}
            i18n.setLanguage(b.dataset.val);   // triggers i18n:change → view re-render
        });

        // ── Data export / import ──────────────────────────────────────────────
        el.querySelector('#pfExpCSV').addEventListener('click', () => exportMoviesCSV(movies()));
        el.querySelector('#pfExpJSON').addEventListener('click', () => exportMoviesJSON(movies()));
        el.querySelector('#pfImp').addEventListener('change', async e => {
            const file = e.target.files?.[0]; if (!file) return;
            showToast(i18n.t('saving'), { tone: 'neutral' });
            try {
                const count = await importMoviesJSON(JSON.parse(await file.text()));
                showToast((i18n.t('import_success') || '{count} imported').replace('{count}', String(count)), { tone: 'neutral' });
            } catch (err) { showToast(`${i18n.t('error')}: ${err.message}`, { tone: 'error' }); }
        });

        // ── Wrapped / Logout ──────────────────────────────────────────────────
        el.querySelector('#pfWrapped').addEventListener('click', () => openWrapped(movies()));
        el.querySelector('#pfLogout').addEventListener('click', () => { storeDestroy(); logout(); });
    },

    unmount() {
        if (this._unsub) { this._unsub(); this._unsub = null; }
    },
};

/** Legacy alias — old callers opened a sheet; now we route to the page. */
export async function openSettingsSheet() {
    navigate('settings');
}

// ── Utilities ────────────────────────────────────────────────────────────────
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function _fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const img    = new Image();
        img.onload = () => {
            const size = 128;
            canvas.width = size; canvas.height = size;
            const ctx = canvas.getContext('2d');
            const s   = Math.min(img.width, img.height);
            ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = () => reject(new Error('Invalid image'));
        img.src = URL.createObjectURL(file);
    });
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
