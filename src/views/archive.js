/**
 * ARCHIVE — watched & rated films, redesigned.
 *
 * Toolbar: search · Filters accordion · film count · custom sort dropdown.
 * Filter panel (accordion): single-select chip rows for Rating / Decade / Genre
 * (genre chips are derived from the films actually present), all client-side.
 * Grid: poster card + external caption below; a circular, colour-coded rating
 * badge (r10/r9/r8) sits top-right and fades on hover, revealing an overlay with
 * the big rating and Edit / Note / Remove actions.
 * Reactive via the singleton store.
 */
import { init, subscribe, removeMovie } from '../core/store.js';
import { deleteMovie } from '../data/repo.js';
import i18n from '../core/i18n.js';
import { openDetail } from '../components/detail.js';

const RATING_ROW = [
    { id: 'all', label: 'wl_all' },
    { id: '10', label: '★ 10' }, { id: '9', label: '★ 9' }, { id: '8', label: '★ 8' },
    { id: '7', label: '★ 7' }, { id: 'le6', label: '≤ 6' },
];
const DECADE_ROW = [
    { id: 'any', label: 'ex_any' },
    { id: '2020', label: '2020s' }, { id: '2010', label: '2010s' },
    { id: '2000', label: '2000s' }, { id: '1990', label: '90s' }, { id: 'classic', label: 'ex_classic' },
];
const SORT_ROW = [
    { id: 'rating', label: 'ex_sort_rating' },
    { id: 'seen', label: 'ar_sort_seen' },
    { id: 'year-new', label: 'ex_sort_year_new' },
    { id: 'year-old', label: 'ex_sort_year_old' },
    { id: 'alpha', label: 'wl_sort_alpha' },
];
const GCOL = {
    Drama: '#C8A97E', Thriller: '#D4714A', Horror: '#8C6A6A', 'Science Fiction': '#7E8BC8',
    'Sci-Fi': '#7E8BC8', Comedy: '#A0B85E', Action: '#A08C6E', Romance: '#C87EA9',
    War: '#9898C0', Documentary: '#5E9C8A', Animation: '#5E8C65', Crime: '#B8523A',
    Mystery: '#9648C8', Fantasy: '#6E9CA0', Adventure: '#A08C6E',
};
const genreColor = n => GCOL[n] || '#998f83';
const lbl = key => (/^[a-z_]+$/.test(key) && i18n.t(key) !== key ? i18n.t(key) : key);

export const archive = {
    id: 'archive', label: 'Archive', icon: '🎬',
    _unsub: null,
    _docClick: null,

    async mount(el) {
        let all = [];
        let q = '', rating = 'all', decade = 'any', genre = 'all', sort = 'rating';

        el.innerHTML = `
          <div class="ar-view">
            <div class="ar-toolbar">
              <div class="ar-search-wrap">
                <input class="ar-search" id="arSearch" type="search" placeholder="${esc(i18n.t('search_archive'))}">
              </div>
              <button class="ar-filter-btn" id="arFilterBtn"><span>${esc(i18n.t('filters'))}</span>${CHEVRON}</button>
              <span class="ar-count" id="arCount"></span>
              <div class="ar-sort-btn" id="arSortBtn">
                <span id="arSortLabel">${esc(lbl(SORT_ROW[0].label))}</span>${CHEVRON}
                <div class="sort-dropdown">
                  ${SORT_ROW.map((o, i) => `<button class="sopt${i === 0 ? ' active' : ''}" data-val="${o.id}">${esc(lbl(o.label))}<span class="sopt-ck">✓</span></button>`).join('')}
                </div>
              </div>
            </div>

            <div class="filter-panel" id="arFilterPanel">
              <div class="filter-panel-inner">
                <div class="fp-row" data-row="rating">
                  <span class="fp-label">${esc(i18n.t('rating'))}</span>
                  ${RATING_ROW.map(r => chip(r.id, lbl(r.label), r.id === 'all')).join('')}
                  <button class="fp-clear" id="arClear">${esc(i18n.t('clearFilters'))}</button>
                </div>
                <div class="fp-row" data-row="decade">
                  <span class="fp-label">${esc(i18n.t('year'))}</span>
                  ${DECADE_ROW.map(d => chip(d.id, lbl(d.label), d.id === 'any')).join('')}
                </div>
                <div class="fp-row" data-row="genre" id="arGenreRow">
                  <span class="fp-label">${esc(i18n.t('genre'))}</span>
                  ${chip('all', i18n.t('wl_all'), true)}
                </div>
              </div>
            </div>

            <div class="ar-grid" id="arGrid"></div>
          </div>`;

        const grid    = el.querySelector('#arGrid');
        const countEl = el.querySelector('#arCount');
        const sortBtn = el.querySelector('#arSortBtn');
        _skeleton(grid, 12);

        // ── Filtering / sorting ───────────────────────────────────────────────
        const visible = () => {
            let list = all;
            if (q) list = list.filter(m => `${m.title || ''} ${m.director || ''}`.toLowerCase().includes(q));
            if (rating !== 'all') list = list.filter(m => matchRating(m.rating, rating));
            if (decade !== 'any') list = list.filter(m => matchDecade(filmYear(m), decade));
            if (genre !== 'all')  list = list.filter(m => (m.genres || []).some(g => String(g) === genre));
            return sortFilms(list, sort);
        };

        const render = () => {
            const list = visible();
            countEl.textContent = `${list.length} ${i18n.t('wl_films')}`;
            if (!list.length) {
                grid.innerHTML = `<div class="empty"><div class="big">${esc(i18n.t('archive_empty'))}</div>${esc(i18n.t('add_from_explore'))}</div>`;
                return;
            }
            grid.innerHTML = list.map(arCell).join('');
        };

        const refreshGenreChips = () => {
            const row = el.querySelector('#arGenreRow');
            const counts = new Map();
            all.forEach(m => (m.genres || []).forEach(g => counts.set(String(g), (counts.get(String(g)) || 0) + 1)));
            const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);
            row.innerHTML = `<span class="fp-label">${esc(i18n.t('genre'))}</span>` +
                chip('all', i18n.t('wl_all'), genre === 'all') +
                top.map(g => chip(g, g, genre === g)).join('');
        };

        // ── Search ────────────────────────────────────────────────────────────
        el.querySelector('#arSearch').addEventListener('input', e => {
            q = e.target.value.toLowerCase().trim(); render();
        });

        // ── Filters accordion + chips (delegated) ─────────────────────────────
        const filterBtn = el.querySelector('#arFilterBtn');
        const panel     = el.querySelector('#arFilterPanel');
        filterBtn.addEventListener('click', () => {
            const open = panel.classList.toggle('open');
            filterBtn.classList.toggle('open', open);
        });
        panel.addEventListener('click', e => {
            if (e.target.closest('#arClear')) {
                rating = 'all'; decade = 'any'; genre = 'all';
                panel.querySelectorAll('.fp-row').forEach(row =>
                    row.querySelectorAll('.fp-chip').forEach((c, i) => c.classList.toggle('on', i === 0)));
                render(); return;
            }
            const c = e.target.closest('.fp-chip'); if (!c) return;
            const row = c.closest('.fp-row');
            row.querySelectorAll('.fp-chip').forEach(x => x.classList.toggle('on', x === c));
            const val = c.dataset.val;
            if (row.dataset.row === 'rating') rating = val;
            if (row.dataset.row === 'decade') decade = val;
            if (row.dataset.row === 'genre')  genre  = val;
            render();
        });

        // ── Sort dropdown ─────────────────────────────────────────────────────
        sortBtn.addEventListener('click', e => {
            if (e.target.closest('.sopt')) return;
            e.stopPropagation();
            sortBtn.classList.toggle('open');
        });
        sortBtn.querySelectorAll('.sopt').forEach(opt => {
            opt.addEventListener('click', e => {
                e.stopPropagation();
                sort = opt.dataset.val;
                el.querySelector('#arSortLabel').textContent = opt.textContent.replace('✓', '').trim();
                sortBtn.querySelectorAll('.sopt').forEach(o => o.classList.toggle('active', o === opt));
                sortBtn.classList.remove('open');
                render();
            });
        });
        this._docClick = () => sortBtn.classList.remove('open');
        document.addEventListener('click', this._docClick);

        // ── Card actions (delegated) ──────────────────────────────────────────
        grid.addEventListener('click', e => {
            const cell = e.target.closest('.ar-cell'); if (!cell) return;
            const id = cell.dataset.id;
            const m  = all.find(x => x.id === id); if (!m) return;
            const actEl = e.target.closest('[data-act]');
            if (actEl && actEl.dataset.act === 'remove') {
                e.stopPropagation();
                cell.classList.add('card-out');
                deleteMovie(id).then(() => removeMovie(id)).catch(() => cell.classList.remove('card-out'));
                return;
            }
            // Edit / Note / card body → detail modal
            openDetail(m, { mode: 'archive' });
        });

        // ── Boot ──────────────────────────────────────────────────────────────
        await init();
        this._unsub = subscribe('archive', ({ movies }) => {
            all = (movies || []).filter(m => !m.isWatchlist && m.rating != null);
            refreshGenreChips();
            render();
        });
    },

    unmount() {
        if (this._unsub)    { this._unsub(); this._unsub = null; }
        if (this._docClick) { document.removeEventListener('click', this._docClick); this._docClick = null; }
    },
};

// ── Cell template ────────────────────────────────────────────────────────────
function arCell(m) {
    const r       = Number(m.rating);
    const rTxt    = Number.isInteger(r) ? String(r) : r.toFixed(1);
    const rClass  = r >= 10 ? 'r10' : r >= 9 ? 'r9' : r >= 8 ? 'r8' : '';
    const genre   = (m.genres || [])[0] || '';
    const gc      = genreColor(genre);
    const dir     = m.director && m.director !== 'Unknown' ? m.director : '';
    const yr      = filmYear(m);
    const art     = m.poster
        ? `<img loading="lazy" decoding="async" alt="" src="${esc(m.poster)}" onerror="this.classList.add('is-broken')">`
        : arArt(m.title || '');
    return `
      <div class="ar-cell" data-id="${esc(m.id)}">
        <div class="ar-card">
          ${art}
          <div class="ar-rating ${rClass}">${esc(rTxt)}</div>
          <div class="ar-overlay">
            <div class="ov-rating-big">${esc(rTxt)}</div>
            <div class="ov-r-sub">${esc(i18n.t('ar_your_rating'))}</div>
            <div class="ov-film-title">${esc(m.title || '')}</div>
            ${dir ? `<div class="ov-film-director">${esc(dir)}</div>` : ''}
            <div class="ov-film-meta">
              ${genre ? `<span class="ar-cap-dot" style="background:${gc}"></span>${esc(genre)}${yr ? ' · ' : ''}` : ''}${esc(yr)}
            </div>
            <div class="ov-ar-actions">
              <button class="ov-ar-btn edit" data-act="edit">${esc(i18n.t('ar_edit_rating'))}</button>
              <button class="ov-ar-btn note" data-act="note">+ ${esc(i18n.t('ar_note'))}</button>
              <button class="ov-ar-btn rm" data-act="remove">${esc(i18n.t('ar_remove'))}</button>
            </div>
          </div>
        </div>
        <div class="ar-caption">
          <div class="ar-cap-title">${esc(m.title || '')}</div>
          <div class="ar-cap-meta">
            ${genre ? `<span class="ar-cap-dot" style="background:${gc}"></span>` : ''}
            ${dir ? `<span class="ar-cap-dir">${esc(dir)}</span>` : ''}
            ${dir && yr ? `<span style="opacity:.4;flex-shrink:0">·</span>` : ''}
            ${yr ? `<span style="flex-shrink:0">${esc(yr)}</span>` : ''}
          </div>
        </div>
      </div>`;
}

function arArt(title) {
    const first = (title.split(' ')[0] || '');
    const abbr  = (title.split(' ').filter(w => w.length > 2).slice(0, 2).map(w => w[0]).join('') || (title[0] || '?')).toUpperCase();
    return `<div class="ar-art">
        <span class="ar-art-abbr">${esc(abbr)}</span>
        <span class="ar-art-word">${esc(first)}</span>
      </div>`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function filmYear(m) {
    return Number(m.year) || Number((m.releaseDate || '').slice(0, 4)) || '';
}
function matchRating(rv, key) {
    const r = Number(rv) || 0;
    if (key === '10') return r >= 10;
    if (key === '9')  return r >= 9 && r < 10;
    if (key === '8')  return r >= 8 && r < 9;
    if (key === '7')  return r >= 7 && r < 8;
    if (key === 'le6') return r > 0 && r < 7;
    return true;
}
function matchDecade(year, key) {
    const y = Number(year) || 0;
    if (!y) return false;
    if (key === 'classic') return y < 1990;
    const d = Number(key);
    return y >= d && y <= d + 9;
}
function sortFilms(list, key) {
    const s = [...list];
    switch (key) {
        case 'rating':   return s.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
        case 'seen':     return s.sort((a, b) => String(b.watchedDate || '').localeCompare(String(a.watchedDate || '')));
        case 'year-new': return s.sort((a, b) => (Number(filmYear(b)) || 0) - (Number(filmYear(a)) || 0));
        case 'year-old': return s.sort((a, b) => (Number(filmYear(a)) || 9999) - (Number(filmYear(b)) || 9999));
        case 'alpha':    return s.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
        default:         return s;
    }
}

function chip(val, label, on) {
    return `<button class="fp-chip${on ? ' on' : ''}" data-val="${esc(val)}">${esc(label)}</button>`;
}

function _skeleton(g, n) {
    g.innerHTML = '';
    for (let i = 0; i < n; i++) {
        const d = document.createElement('div');
        d.className = 'ar-cell';
        d.innerHTML = '<div class="ar-card"><div class="sk" style="width:100%;height:100%"></div></div><div class="ar-caption"></div>';
        g.appendChild(d);
    }
}

const CHEVRON = `<svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
