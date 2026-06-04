/**
 * WATCHLIST — a *decision system*, not a flat list.
 *
 * Redesign (Jun 2026): the watchlist is organised into three tiers stored on
 * each film (`tier ∈ priority | standard | backlog`, default 'standard'):
 *
 *   ┌ Tonight's Pick   hero card cycling through the Priority tier
 *   ┌ Filter bar       Tier chips + Runtime chips
 *   ┌ Toolbar          search · custom sort dropdown · grid/list toggle
 *   ┌ Poster grid      auto-fill grid, sectioned by tier (default view)
 *   └ List view        flat rows with a coloured tier pill (toggle)
 *
 * Card overlay actions reuse the existing flows:
 *   • Seen   → openWatchedModal → updateMovie({ isWatchlist:false, rating… })
 *   • ×      → deleteMovie (watchlist films are unwatched-only → clean removal)
 *   • ↑ / ↓  → updateMovie({ tier }) to promote / demote between tiers
 *
 * Everything is reactive via the singleton store; tier moves patch optimistically.
 */
import { init, subscribe, patchMovie, removeMovie } from '../core/store.js';
import { updateMovie, deleteMovie, getMovie } from '../data/repo.js';
import i18n from '../core/i18n.js';
import { openDetail } from '../components/detail.js';
import { openWatchedModal } from '../components/watched.js';
import { showToast } from '../components/toast.js';
import { movieDetails } from '../services/tmdb.js';

// ── Tier model ───────────────────────────────────────────────────────────────
const TIERS = ['priority', 'standard', 'backlog'];
const TIER_CFG = {
    priority: { labelKey: 'wl_tier_priority', hintKey: 'wl_tier_priority_hint', dot: 'var(--gold)' },
    standard: { labelKey: 'wl_tier_standard', hintKey: 'wl_tier_standard_hint', dot: '#998f83' },
    backlog:  { labelKey: 'wl_tier_backlog',  hintKey: 'wl_tier_backlog_hint',  dot: '#5c554d' },
};
const tierOf      = m => (TIERS.includes(m.tier) ? m.tier : 'standard');
const tierLabel   = t => i18n.t(TIER_CFG[t].labelKey);
const prevTier    = t => (t === 'standard' ? 'priority' : t === 'backlog' ? 'standard' : null);
const nextTier    = t => (t === 'priority' ? 'standard' : t === 'standard' ? 'backlog' : null);

// ── Runtime quick-filter predicates (films lacking runtime show only in "All") ─
const RT_PRED = {
    all:      () => true,
    short:    m => m.runtime && m.runtime < 120,
    standard: m => m.runtime && m.runtime >= 120 && m.runtime <= 180,
    long:     m => m.runtime && m.runtime > 180,
};
const RT_OPTS = [
    { id: 'all',      labelKey: 'wl_all' },
    { id: 'short',    labelKey: 'wl_rt_short' },
    { id: 'standard', labelKey: 'wl_rt_standard' },
    { id: 'long',     labelKey: 'wl_rt_long' },
];

const SORT_OPTS = [
    { id: 'added',    labelKey: 'wl_sort_added' },
    { id: 'imdb',     labelKey: 'wl_sort_imdb' },
    { id: 'year-new', labelKey: 'wl_sort_year_new' },
    { id: 'year-old', labelKey: 'wl_sort_year_old' },
    { id: 'runtime',  labelKey: 'wl_sort_runtime' },
    { id: 'alpha',    labelKey: 'wl_sort_alpha' },
];

export const watchlist = {
    id: 'watchlist', label: 'Watchlist', icon: '📋',
    _unsub:    null,
    _docClick: null,

    async mount(el) {
        // ── State ─────────────────────────────────────────────────────────────
        let allMovies  = [];          // current watchlist films
        let tonightIdx = 0;
        let searchQ    = '';
        let sortMode   = 'added';
        let rtFilter   = 'all';
        let tierFilter = 'all';
        let viewMode   = 'grid';

        // ── Shell ─────────────────────────────────────────────────────────────
        el.innerHTML = `
          <div class="wl-page">
            <div class="wl-head">
              <h1 class="wl-title">${i18n.t('status_watchlist') || 'Watchlist'}</h1>
              <div class="wl-meta" id="wlMeta"></div>
            </div>

            <div class="tonight" id="wlTonight"></div>

            <div class="wl-filterbar" id="wlFilterBar">
              <span class="wl-flabel">${i18n.t('wl_tier')}</span>
              <div class="wl-fgroup" id="wlTierChips"></div>
              <div class="wl-fsep"></div>
              <span class="wl-flabel">${i18n.t('wl_runtime')}</span>
              <div class="wl-fgroup" id="wlRtChips"></div>
            </div>

            <div class="wl-bar">
              <div class="search-wrap">
                <span class="search-icon">⌕</span>
                <input class="search-inp" id="wlSearch" type="search"
                       placeholder="${i18n.t('search_watchlist')}">
              </div>
              <div class="sort-btn" id="wlSortBtn">
                <span id="wlSortLabel">${i18n.t('wl_sort')}: ${i18n.t('wl_sort_added')}</span>
                <span class="sort-chevron">▾</span>
                <div class="sort-menu" id="wlSortMenu">
                  ${SORT_OPTS.map(o => `
                    <button class="sort-opt${o.id === 'added' ? ' active' : ''}" data-sort="${o.id}">
                      ${i18n.t(o.labelKey)}<span class="sort-opt-check">✓</span>
                    </button>`).join('')}
                </div>
              </div>
              <div class="view-toggle">
                <button class="vbtn active" id="wlBtnGrid" title="Grid" aria-label="Grid">⊞</button>
                <button class="vbtn" id="wlBtnList" title="List" aria-label="List">☰</button>
              </div>
            </div>

            <div class="poster-grid" id="wlGrid"></div>
            <div class="wl-list" id="wlList"></div>
          </div>`;

        const $ = sel => el.querySelector(sel);
        const metaEl    = $('#wlMeta');
        const tonightEl = $('#wlTonight');
        const tierChips = $('#wlTierChips');
        const rtChips   = $('#wlRtChips');
        const gridEl    = $('#wlGrid');
        const listEl    = $('#wlList');
        const sortBtn   = $('#wlSortBtn');
        const sortLabel = $('#wlSortLabel');

        // ── Derived helpers ────────────────────────────────────────────────────
        const byTier = t => allMovies.filter(m => tierOf(m) === t);

        const applyFilters = films => {
            let f = films;
            if (searchQ) {
                f = f.filter(m =>
                    String(m.title || '').toLowerCase().includes(searchQ) ||
                    String(m.director || '').toLowerCase().includes(searchQ));
            }
            f = f.filter(RT_PRED[rtFilter] || RT_PRED.all);
            return applySort(f, sortMode);
        };

        // ── Renderers ──────────────────────────────────────────────────────────
        const renderMeta = () => {
            const total = allMovies.length;
            const rt    = allMovies.reduce((s, m) => s + (m.runtime || 0), 0);
            const prio  = byTier('priority').length;
            metaEl.innerHTML = `
              <span><b>${total}</b><i>${i18n.t('wl_films')}</i></span>
              <span><b>${fmtRt(rt)}</b><i>${i18n.t('wl_total_runtime')}</i></span>
              <span><b>${prio}</b><i>${i18n.t('wl_priority_count')}</i></span>`;
        };

        const renderTonight = () => {
            const prio = byTier('priority');
            if (!prio.length) {
                tonightEl.innerHTML = `<div class="tonight-empty">${i18n.t('wl_no_priority')}</div>`;
                return;
            }
            const idx = ((tonightIdx % prio.length) + prio.length) % prio.length;
            const f   = prio[idx];
            const [c1, c2] = pClr(f.title || '');
            tonightEl.style.setProperty('--tonight-grad', `linear-gradient(90deg,${c1},${c2},transparent)`);
            const sub = [f.year, f.director && f.director !== 'Unknown' ? f.director : null, f.runtime ? fmtRt(f.runtime) : null]
                .filter(Boolean).join(' · ');
            tonightEl.innerHTML = `
              <div class="tonight-inner">
                <div class="tonight-poster" data-card="${esc(f.id)}">${posterCell(f, true)}</div>
                <div class="tonight-body" data-card="${esc(f.id)}">
                  <div class="tonight-eyebrow">${i18n.t('wl_tonight_eyebrow')}</div>
                  <div class="tonight-title">${esc(f.title || '')}</div>
                  <div class="tonight-sub">${esc(sub)}</div>
                  ${f.notes ? `<div class="tonight-note">${esc(f.notes)}</div>` : ''}
                </div>
                <div class="tonight-right">
                  <button class="tonight-cta" data-action="seen" data-id="${esc(f.id)}">✓ ${i18n.t('mark_watched')}</button>
                  <button class="tonight-skip" data-action="skip">${i18n.t('wl_not_tonight')} →</button>
                  <div class="tonight-idx">${idx + 1} ${i18n.t('wl_of')} ${prio.length} ${i18n.t('wl_in_priority')}</div>
                </div>
              </div>`;
        };

        const renderTierChips = () => {
            const opts = [{ id: 'all', label: i18n.t('wl_all'), dot: null },
                ...TIERS.map(t => ({ id: t, label: tierLabel(t), dot: TIER_CFG[t].dot }))];
            tierChips.innerHTML = opts.map(o => {
                const count = o.id === 'all' ? allMovies.length : byTier(o.id).length;
                const dot   = o.dot ? `<span class="fchip-dot" style="background:${o.dot}"></span>` : '';
                return `<button class="fchip${tierFilter === o.id ? ' active' : ''}" data-tier="${o.id}">
                    ${dot}${o.label}<span class="fchip-count">${count}</span></button>`;
            }).join('');
        };

        const renderRtChips = () => {
            rtChips.innerHTML = RT_OPTS.map(o =>
                `<button class="fchip${rtFilter === o.id ? ' active' : ''}" data-rt="${o.id}">${i18n.t(o.labelKey)}</button>`
            ).join('');
        };

        const renderGrid = () => {
            const tiers = tierFilter === 'all' ? TIERS : [tierFilter];
            let html = '', total = 0;
            tiers.forEach(t => {
                const films = applyFilters(byTier(t));
                if (!films.length) return;
                if (tierFilter === 'all') {
                    const rt = films.reduce((s, m) => s + (m.runtime || 0), 0);
                    html += `<div class="grid-section-label">
                        <span class="gsl-dot" style="background:${TIER_CFG[t].dot}"></span>
                        <span class="gsl-text">${tierLabel(t)}</span>
                        <span class="gsl-count">${films.length} ${i18n.t('wl_films')} · ${fmtRt(rt)}</span>
                      </div>`;
                }
                html += films.map(m => gridCard(m, t)).join('');
                total += films.length;
            });
            gridEl.innerHTML = total ? html
                : `<div class="grid-empty">${i18n.t('wl_grid_empty')}<br>
                     <span class="grid-empty-hint">${i18n.t('wl_grid_empty_hint')}</span></div>`;
        };

        const renderList = () => {
            const tiers = tierFilter === 'all' ? TIERS : [tierFilter];
            const rows = tiers.flatMap(t => applyFilters(byTier(t)).map(m => listRow(m, t)));
            listEl.innerHTML = rows.join('') ||
                `<div class="wl-list-empty">${i18n.t('wl_grid_empty')}</div>`;
        };

        const renderAll = () => {
            renderMeta();
            renderTonight();
            renderTierChips();
            renderRtChips();
            renderGrid();
            renderList();
        };

        // ── Card open (detail modal) ───────────────────────────────────────────
        const openCard = id => {
            const m = allMovies.find(x => x.id === id);
            if (!m) return;
            openDetail(m, {
                mode: 'watchlist',
                onUpdate: updated => {
                    if (updated && (updated.isWatchlist === false || updated.rating != null)) {
                        removeMovie(updated.id);          // moved to archive
                    } else if (updated) {
                        patchMovie(updated.id, updated);
                    }
                },
            });
        };

        // ── Actions ────────────────────────────────────────────────────────────
        const markSeen = id => {
            const m = allMovies.find(x => x.id === id);
            if (!m) return;
            openWatchedModal(m, {
                initialRating: m.rating,
                initialNotes:  m.notes,
                onSave: async data => {
                    if (m.id) { try { await updateMovie(m.id, data); } catch {} }
                    removeMovie(m.id);
                },
            });
        };

        const removeFilm = async id => {
            const node = el.querySelector(`[data-card-root="${cssEsc(id)}"]`);
            if (node) node.classList.add('card-out');
            try {
                await deleteMovie(id);     // confirm server-side before dropping it
                removeMovie(id);
            } catch (e) {
                if (node) node.classList.remove('card-out');
                const msg = e?.code || e?.message || String(e);
                console.warn('[watchlist] remove failed:', e);
                showToast(`${i18n.t('error')}: ${msg}`, { tone: 'error', timeout: 8000 });
            }
        };

        const moveFilm = async (id, to) => {
            if (!TIERS.includes(to)) return;
            const prev = (allMovies.find(x => x.id === id) || {}).tier;
            patchMovie(id, { tier: to });               // optimistic → re-renders via store
            try {
                await updateMovie(id, { tier: to });    // persist (offline → queued by repo)
                // Read the doc back to confirm it actually persisted server-side.
                // This catches silent failures (rules rejection swallowed offline,
                // wrong doc path, merge dropping the field, etc.).
                const fresh = await getMovie(id);
                if (!fresh)            throw new Error('readback: document not found');
                if (fresh.tier !== to) throw new Error(`readback tier="${fresh.tier}" expected "${to}"`);
            } catch (e) {
                // Surface the real cause and undo the optimistic move so the UI
                // never claims a change that didn't actually save.
                const msg = e?.code || e?.message || String(e);
                console.warn('[watchlist] tier save failed:', e);
                showToast(`Tier non salvato: ${msg}`, { tone: 'error', timeout: 8000 });
                patchMovie(id, { tier: prev || 'standard' });
            }
        };

        // ── Event delegation (single listener on the view root) ────────────────
        el.addEventListener('click', e => {
            const actEl = e.target.closest('[data-action]');
            if (actEl) {
                e.stopPropagation();
                const id = actEl.dataset.id;
                switch (actEl.dataset.action) {
                    case 'seen':   markSeen(id); break;
                    case 'remove': removeFilm(id); break;
                    case 'move':   moveFilm(id, actEl.dataset.to); break;
                    case 'skip':   tonightIdx++; renderTonight(); break;
                }
                return;
            }
            const cardEl = e.target.closest('[data-card]');
            if (cardEl) { openCard(cardEl.dataset.card); }
        });

        // Search
        $('#wlSearch').addEventListener('input', e => {
            searchQ = e.target.value.toLowerCase().trim();
            renderGrid(); renderList();
        });

        // Tier chips
        tierChips.addEventListener('click', e => {
            const b = e.target.closest('.fchip'); if (!b) return;
            tierFilter = b.dataset.tier; renderTierChips(); renderGrid(); renderList();
        });
        // Runtime chips
        rtChips.addEventListener('click', e => {
            const b = e.target.closest('.fchip'); if (!b) return;
            rtFilter = b.dataset.rt; renderRtChips(); renderGrid(); renderList();
        });

        // Custom sort dropdown
        sortBtn.addEventListener('click', e => {
            // ignore clicks on the menu options' own handler below
            if (e.target.closest('.sort-opt')) return;
            e.stopPropagation();
            sortBtn.classList.toggle('open');
        });
        sortBtn.querySelectorAll('.sort-opt').forEach(opt => {
            opt.addEventListener('click', e => {
                e.stopPropagation();
                sortMode = opt.dataset.sort;
                sortLabel.textContent = `${i18n.t('wl_sort')}: ${opt.textContent.trim().replace('✓', '').trim()}`;
                sortBtn.querySelectorAll('.sort-opt').forEach(o => o.classList.toggle('active', o === opt));
                sortBtn.classList.remove('open');
                renderGrid(); renderList();
            });
        });
        this._docClick = () => sortBtn.classList.remove('open');
        document.addEventListener('click', this._docClick);

        // View toggle
        const setView = mode => {
            viewMode = mode;
            $('#wlBtnGrid').classList.toggle('active', mode === 'grid');
            $('#wlBtnList').classList.toggle('active', mode === 'list');
            gridEl.style.display = mode === 'grid' ? '' : 'none';
            listEl.classList.toggle('vis', mode === 'list');
        };
        $('#wlBtnGrid').addEventListener('click', () => setView('grid'));
        $('#wlBtnList').addEventListener('click', () => setView('list'));

        // ── Runtime backfill ───────────────────────────────────────────────────
        // Most watchlist films are added without a runtime (imported / quick-add),
        // so the "total runtime" reads 0. Fetch the missing runtimes once from
        // TMDB, update the total live, and persist so it sticks.
        const self = this;
        const rtTried = new Set();
        const backfillRuntimes = async () => {
            const todo = allMovies.filter(m =>
                !m.runtime && m.tmdbId && !rtTried.has(m.tmdbId) && !String(m.id || '').startsWith('offline-'));
            if (!todo.length) return;
            todo.forEach(m => rtTried.add(m.tmdbId));
            const q = todo.slice();
            const worker = async () => {
                while (q.length && self._alive) {
                    const m = q.shift();
                    try {
                        const d = await movieDetails(m.tmdbId);
                        if (d?.runtime) {
                            m.runtime = d.runtime;          // local copy → total updates
                            renderMeta();
                            updateMovie(m.id, { runtime: d.runtime }).catch(() => {});
                        }
                    } catch {}
                }
            };
            await Promise.all(Array.from({ length: 3 }, worker));
        };

        // ── Boot ───────────────────────────────────────────────────────────────
        this._alive = true;
        await init();
        let firstLoad = true;
        this._unsub = subscribe('watchlist', ({ movies }) => {
            allMovies = (movies || []).filter(m => m.isWatchlist);
            if (tonightIdx >= byTier('priority').length) tonightIdx = 0;
            renderAll();
            if (firstLoad) { firstLoad = false; backfillRuntimes(); }
        });
    },

    unmount() {
        this._alive = false;
        if (this._unsub)    { this._unsub(); this._unsub = null; }
        if (this._docClick) { document.removeEventListener('click', this._docClick); this._docClick = null; }
    },
};

// ── Card / row templates ─────────────────────────────────────────────────────
function gridCard(m, t) {
    const cfg  = TIER_CFG[t];
    const prev = prevTier(t), next = nextTier(t);
    const dir  = m.director && m.director !== 'Unknown' ? m.director : '';
    const genre = Array.isArray(m.genres) ? (m.genres[0] || '') : (m.genres || '');
    const gc   = genre ? `hsl(${hashHue(genre)},42%,62%)` : 'var(--ink-mute)';
    const subL = [m.year, dir].filter(Boolean).join(' · ');
    const foot = [genre, m.runtime ? fmtRt(m.runtime) : ''].filter(Boolean).join(' · ');
    const up   = prev ? `<button class="wl-act up" data-action="move" data-id="${esc(m.id)}" data-to="${prev}">↑ ${tierLabel(prev)}</button>` : '';
    const dn   = next ? `<button class="wl-act dn" data-action="move" data-id="${esc(m.id)}" data-to="${next}">↓ ${tierLabel(next)}</button>` : '';
    return `
      <div class="wl-card card-in" data-card-root="${esc(m.id)}">
        <span class="wl-tier-pip" style="background:${cfg.dot}"></span>
        <div class="wl-card-poster" data-card="${esc(m.id)}">
          ${posterCell(m, true)}
          <div class="wl-overlay">
            <div class="wl-ov-title">${esc(m.title || '')}</div>
            <div class="wl-ov-sub">${esc([m.year, m.runtime ? fmtRt(m.runtime) : ''].filter(Boolean).join(' · '))}</div>
            <div class="wl-act-row">
              <button class="wl-act ok" data-action="seen" data-id="${esc(m.id)}">✓ ${i18n.t('wl_seen')}</button>
              <button class="wl-act rm" data-action="remove" data-id="${esc(m.id)}" aria-label="Remove">✕</button>
            </div>
            ${(up || dn) ? `<div class="wl-act-row">${up}${dn}</div>` : ''}
          </div>
        </div>
        <div class="wl-card-info" data-card="${esc(m.id)}">
          <div class="wl-card-title">${esc(m.title || '')}</div>
          ${subL ? `<div class="wl-card-sub">${esc(subL)}</div>` : ''}
          ${foot ? `<div class="wl-card-rt" style="color:${gc}">${esc(foot)}</div>` : ''}
        </div>
      </div>`;
}

function listRow(m, t) {
    const cfg   = TIER_CFG[t];
    const dir   = m.director && m.director !== 'Unknown' ? m.director : '';
    const genre = Array.isArray(m.genres) ? (m.genres[0] || '') : (m.genres || '');
    const gc    = genre ? `hsl(${hashHue(genre)},42%,62%)` : 'var(--ink-mute)';
    const subL  = [m.year, dir].filter(Boolean).join(' · ');
    return `
      <div class="wl-lrow" data-card-root="${esc(m.id)}">
        <span class="lrow-tier" style="color:${cfg.dot};border-color:${cfg.dot}55">${tierLabel(t)}</span>
        <div class="lrow-poster" data-card="${esc(m.id)}">${posterCell(m, false)}</div>
        <div class="lrow-info" data-card="${esc(m.id)}">
          <div class="lrow-title">${esc(m.title || '')}</div>
          ${subL ? `<div class="lrow-sub">${esc(subL)}</div>` : ''}
        </div>
        ${genre ? `<span class="lrow-genre" style="color:${gc};border-color:${gc}40">${esc(genre)}</span>` : ''}
        <span class="lrow-rt">${m.runtime ? fmtRt(m.runtime) : '—'}</span>
        <div class="lrow-acts">
          <button class="lrow-btn seen" data-action="seen" data-id="${esc(m.id)}">✓ ${i18n.t('wl_seen')}</button>
          <button class="lrow-btn del" data-action="remove" data-id="${esc(m.id)}" aria-label="Remove">✕</button>
        </div>
      </div>`;
}

// ── Poster cell: real poster over a generated placeholder fallback ───────────
function posterCell(m, big) {
    const ph = placeholderHTML(m.title || '');
    const img = m.poster
        ? `<img class="wl-poster-img" loading="lazy" decoding="async" alt="" src="${esc(m.poster)}" onerror="this.remove()">`
        : '';
    return `<div class="wl-poster">${ph}${img}</div>`;
}

function placeholderHTML(title) {
    const [c1, c2] = pClr(title);
    const accent = `hsl(${(hashHue(title) + 180) % 360},22%,20%)`;
    const first  = (title.split(' ')[0] || '');
    return `<div class="wl-poster-ph" style="background:linear-gradient(160deg,${c1},${c2} 60%,${accent})">
        <span class="wl-poster-abbr">${esc(abbr(title))}</span>
        <span class="wl-poster-word">${esc(first)}</span>
      </div>`;
}

// ── Sort ─────────────────────────────────────────────────────────────────────
function applySort(list, mode) {
    const a = [...list];
    switch (mode) {
        case 'year-new': a.sort((x, y) => (y.year || 0) - (x.year || 0)); break;
        case 'year-old': a.sort((x, y) => (x.year || 9999) - (y.year || 9999)); break;
        case 'runtime':  a.sort((x, y) => (x.runtime || 0) - (y.runtime || 0)); break;
        case 'alpha':    a.sort((x, y) => String(x.title || '').localeCompare(String(y.title || ''))); break;
        case 'imdb':     a.sort((x, y) => (parseFloat(y.imdbRating) || 0) - (parseFloat(x.imdbRating) || 0)); break;
        default: break; // 'added' → store order
    }
    return a;
}

// ── Small utilities ──────────────────────────────────────────────────────────
function fmtRt(min) {
    const m = Math.round(min || 0);
    if (!m) return '—';
    const h = Math.floor(m / 60), mn = m % 60;
    return h ? (mn ? `${h}h ${mn}m` : `${h}h`) : `${mn}m`;
}
function abbr(s) { return (s.split(' ').slice(0, 2).map(w => w[0] || '').join('') || '?').toUpperCase(); }
function hashHue(s) { return (String(s).split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 0) & 0x7ff) % 360; }
function pClr(s) { const h = hashHue(s); return [`hsl(${h},18%,11%)`, `hsl(${(h + 32) % 360},14%,17%)`]; }
function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function cssEsc(s) { return String(s ?? '').replace(/["\\]/g, '\\$&'); }
