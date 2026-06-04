/**
 * EXPLORE — TMDB discovery, redesigned.
 *
 * Toolbar: search · Filters accordion · custom sort dropdown.
 * Filter panel (accordion): single-select chip rows for Genre / Runtime / Year,
 * mapped to TMDB /discover params.
 * Grid: poster cards with an always-visible bottom caption and a hover overlay
 * carrying quick actions — 🎯 Priority and + Watchlist add the film straight to
 * the watchlist (tier priority / standard) without leaving the page.
 * Infinite scroll + lazy IMDb-rating pill are preserved.
 */
import { searchMovies as tmdbSearch, discoverMovies, posterUrl, movieDetails } from '../services/tmdb.js';
import { imdbRating } from '../services/omdb.js';
import { openDetail } from '../components/detail.js';
import { addMovie, updateMovie } from '../data/repo.js';
import { getState, appendMovie, patchMovie } from '../core/store.js';
import { showToast } from '../components/toast.js';
import i18n from '../core/i18n.js';

// ── Genre id → name + colour (TMDB canonical ids) ────────────────────────────
const GENRE_NAMES = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
    99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
    27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
    53: 'Thriller', 10752: 'War', 37: 'Western',
};
const GCOL = {
    Drama: '#C8A97E', Thriller: '#D4714A', Horror: '#8C6A6A', 'Sci-Fi': '#7E8BC8',
    Comedy: '#A0B85E', Action: '#A08C6E', Romance: '#C87EA9', War: '#9898C0',
    Documentary: '#5E9C8A', Animation: '#5E8C65', Crime: '#B8523A',
};
const genreColor = name => GCOL[name] || '#998f83';

// ── Filter chip definitions → discover params ────────────────────────────────
const GENRE_ROW = [
    { id: 'all', label: 'wl_all' },
    { id: 18, label: 'Drama' }, { id: 53, label: 'Thriller' }, { id: 27, label: 'Horror' },
    { id: 878, label: 'Sci-Fi' }, { id: 35, label: 'Comedy' }, { id: 28, label: 'Action' },
    { id: 10749, label: 'Romance' }, { id: 10752, label: 'War' }, { id: 99, label: 'Docs' },
];
const RUNTIME_ROW = [
    { id: 'any', label: 'ex_any' },
    { id: 'u90', label: 'ex_rt_u90', p: { 'with_runtime.lte': 90 } },
    { id: '90120', label: 'ex_rt_90120', p: { 'with_runtime.gte': 90, 'with_runtime.lte': 120 } },
    { id: '23h', label: 'ex_rt_23h', p: { 'with_runtime.gte': 120, 'with_runtime.lte': 180 } },
    { id: 'o3h', label: 'ex_rt_o3h', p: { 'with_runtime.gte': 180 } },
];
const YEAR_ROW = [
    { id: 'any', label: 'ex_any' },
    { id: '2020s', label: '2020s', p: { 'primary_release_date.gte': '2020-01-01', 'primary_release_date.lte': '2029-12-31' } },
    { id: '2010s', label: '2010s', p: { 'primary_release_date.gte': '2010-01-01', 'primary_release_date.lte': '2019-12-31' } },
    { id: '2000s', label: '2000s', p: { 'primary_release_date.gte': '2000-01-01', 'primary_release_date.lte': '2009-12-31' } },
    { id: 'classic', label: 'ex_classic', p: { 'primary_release_date.lte': '1999-12-31' } },
];
const SORT_ROW = [
    { id: 'popularity.desc', label: 'ex_sort_pop' },
    { id: 'primary_release_date.desc', label: 'ex_sort_year_new' },
    { id: 'primary_release_date.asc', label: 'ex_sort_year_old' },
    { id: 'vote_average.desc', label: 'ex_sort_rating' },
    { id: 'title.asc', label: 'wl_sort_alpha' },
];

const lbl = key => (/[a-z]/.test(key) && i18n.t(key) !== key ? i18n.t(key) : key);

export const explore = {
    id: 'explore', label: 'Explore', icon: '🔍',
    _observer: null,
    _docClick: null,

    async mount(el) {
        // ── State ─────────────────────────────────────────────────────────────
        let q = '';
        let genre = 'all', runtime = 'any', year = 'any';
        let sort = 'popularity.desc';
        let mode = 'discover';
        let currentPage = 0, totalPages = 1, loading = false;

        el.innerHTML = `
          <div class="ex-view">
            <div class="ex-toolbar">
              <div class="ex-search-wrap">
                <input class="ex-search" id="exSearch" type="search" placeholder="${esc(i18n.t('search_explore'))}">
              </div>
              <button class="ex-filter-btn" id="exFilterBtn">
                <span>${esc(i18n.t('filters'))}</span>${CHEVRON}
              </button>
              <div class="ex-sort-btn" id="exSortBtn">
                <span id="exSortLabel">${esc(lbl(SORT_ROW[0].label))}</span>${CHEVRON}
                <div class="sort-dropdown">
                  ${SORT_ROW.map((o, i) => `<button class="sopt${i === 0 ? ' active' : ''}" data-val="${o.id}">${esc(lbl(o.label))}<span class="sopt-ck">✓</span></button>`).join('')}
                </div>
              </div>
            </div>

            <div class="acc-panel" id="exFilterPanel">
              <div class="acc-inner">
                <div class="fp-row" data-row="genre">
                  <span class="fp-label">${esc(i18n.t('genre'))}</span>
                  ${GENRE_ROW.map(g => chip('genre', g.id, lbl(g.label), g.id === 'all')).join('')}
                </div>
                <div class="fp-row" data-row="runtime">
                  <span class="fp-label">${esc(i18n.t('runtime'))}</span>
                  ${RUNTIME_ROW.map(r => chip('runtime', r.id, lbl(r.label), r.id === 'any')).join('')}
                  <button class="fp-clear" id="exClear">${esc(i18n.t('clearFilters'))}</button>
                </div>
                <div class="fp-row" data-row="year">
                  <span class="fp-label">${esc(i18n.t('year'))}</span>
                  ${YEAR_ROW.map(y => chip('year', y.id, lbl(y.label), y.id === 'any')).join('')}
                </div>
              </div>
            </div>

            <div class="ex-grid" id="exGrid"></div>
            <div id="exSentinel" class="scroll-sentinel"></div>
          </div>`;

        const grid     = el.querySelector('#exGrid');
        const sentinel = el.querySelector('#exSentinel');
        const sortBtn  = el.querySelector('#exSortBtn');

        const discoverParams = () => {
            const p = { sort_by: sort };
            if (genre !== 'all') p.with_genres = genre;
            const r = RUNTIME_ROW.find(x => x.id === runtime); if (r?.p) Object.assign(p, r.p);
            const y = YEAR_ROW.find(x => x.id === year);        if (y?.p) Object.assign(p, y.p);
            if (sort === 'vote_average.desc') p['vote_count.gte'] = 200;
            return p;
        };

        const reset = () => { currentPage = 0; totalPages = 1; grid.innerHTML = ''; };

        const loadNext = async () => {
            if (loading || currentPage >= totalPages) return;
            loading = true;
            const isFirst = currentPage === 0;
            if (isFirst) skeleton(grid, 12);
            else sentinel.innerHTML = '<div class="scroll-loading"><div class="sk" style="width:32px;height:32px;border-radius:50%;margin:0 auto"></div></div>';
            try {
                const data = mode === 'search' && q
                    ? await tmdbSearch(q, currentPage + 1)
                    : await discoverMovies(discoverParams(), currentPage + 1);
                currentPage = data.page || currentPage + 1;
                totalPages  = Math.min(data.total_pages || 1, 50);
                const results = normalize(data.results || []);
                if (isFirst) grid.innerHTML = '';
                sentinel.innerHTML = '';
                if (!results.length && isFirst) {
                    grid.innerHTML = `<div class="empty"><div class="big">${esc(i18n.t('no_results'))}</div></div>`;
                } else {
                    appendCards(grid, results);
                }
            } catch (e) {
                if (isFirst) grid.innerHTML = `<div class="empty"><div class="big">${esc(i18n.t('tmdb_error'))}</div>${esc(e.message)}</div>`;
                sentinel.innerHTML = '';
            }
            loading = false;
        };

        const rerun = () => { mode = q ? 'search' : 'discover'; reset(); loadNext(); };

        // ── Search ────────────────────────────────────────────────────────────
        let searchTimer = null;
        el.querySelector('#exSearch').addEventListener('input', e => {
            q = e.target.value.trim();
            clearTimeout(searchTimer);
            searchTimer = setTimeout(rerun, 300);
        });

        // ── Filters accordion ─────────────────────────────────────────────────
        const filterBtn = el.querySelector('#exFilterBtn');
        const panel     = el.querySelector('#exFilterPanel');
        filterBtn.addEventListener('click', () => {
            const open = panel.classList.toggle('open');
            filterBtn.classList.toggle('open', open);
        });

        el.querySelectorAll('.fp-row').forEach(row => {
            row.addEventListener('click', e => {
                const c = e.target.closest('.fp-chip'); if (!c) return;
                row.querySelectorAll('.fp-chip').forEach(x => x.classList.toggle('on', x === c));
                const val = c.dataset.val;
                if (row.dataset.row === 'genre')   genre   = val;
                if (row.dataset.row === 'runtime') runtime = val;
                if (row.dataset.row === 'year')    year    = val;
                if (mode !== 'search') rerun();
            });
        });
        el.querySelector('#exClear').addEventListener('click', () => {
            genre = 'all'; runtime = 'any'; year = 'any';
            el.querySelectorAll('.fp-row').forEach(row =>
                row.querySelectorAll('.fp-chip').forEach((c, i) => c.classList.toggle('on', i === 0)));
            if (mode !== 'search') rerun();
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
                el.querySelector('#exSortLabel').textContent = opt.textContent.replace('✓', '').trim();
                sortBtn.querySelectorAll('.sopt').forEach(o => o.classList.toggle('active', o === opt));
                sortBtn.classList.remove('open');
                if (mode !== 'search') rerun();
            });
        });
        this._docClick = () => sortBtn.classList.remove('open');
        document.addEventListener('click', this._docClick);

        // ── Card actions (delegated) ──────────────────────────────────────────
        grid.addEventListener('click', e => {
            const actEl = e.target.closest('[data-act]');
            const cardEl = e.target.closest('.poster-card');
            if (!cardEl) return;
            const r = cardEl._film;
            if (!r) return;
            if (actEl) {
                e.stopPropagation();
                quickAdd(r, actEl.dataset.act === 'priority' ? 'priority' : 'standard', cardEl);
                return;
            }
            openDetail({ tmdbId: r.tmdbId, title: r.title, year: r.year, poster: r.poster, plot: r.plot }, { mode: 'explore' });
        });

        // ── Infinite scroll ───────────────────────────────────────────────────
        this._observer = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) loadNext();
        }, { rootMargin: '400px' });
        this._observer.observe(sentinel);

        rerun();
    },

    unmount() {
        if (this._observer) { this._observer.disconnect(); this._observer = null; }
        if (this._docClick) { document.removeEventListener('click', this._docClick); this._docClick = null; }
    },
};

// ── Quick-add to watchlist ───────────────────────────────────────────────────
function quickAdd(r, tier, cardEl) {
    const movies = getState().movies || [];
    if (movies.some(m => String(m.tmdbId) === String(r.tmdbId) && m.isWatchlist)) {
        showToast(i18n.t('ex_already_wl'), { tone: 'neutral' });
        return;
    }
    const genres = (r.genreIds || []).map(id => GENRE_NAMES[id]).filter(Boolean);
    const payload = {
        title: r.title, year: r.year, poster: r.poster, plot: r.plot || '',
        tmdbId: r.tmdbId, genreIds: r.genreIds || [], genres,
        originalLanguage: r.originalLanguage || '', releaseDate: r.releaseDate || '',
        isWatchlist: true, isFavorite: false, rating: null, tier,
    };
    cardEl.classList.add('ex-added');
    addMovie(payload).then(id => {
        if (!id) return;
        appendMovie({ ...payload, id });
        // Enrich to match cards added via the detail modal: director, full
        // genre names, runtime — so the watchlist card is uniform.
        movieDetails(r.tmdbId, 'credits').then(d => {
            const patch = {};
            const director = (d?.credits?.crew || []).find(c => c.job === 'Director')?.name;
            if (director)          patch.director = director;
            if (d?.genres?.length) patch.genres = d.genres.map(g => g.name);
            if (d?.runtime)        patch.runtime = d.runtime;
            if (Object.keys(patch).length) { patchMovie(id, patch); updateMovie(id, patch).catch(() => {}); }
        }).catch(() => {});
    }).catch(() => {});
    const label = tier === 'priority' ? i18n.t('wl_tier_priority') : i18n.t('status_watchlist');
    showToast(`${esc(r.title)} → ${label}`, { tone: 'neutral' });
}

// ── Rendering ────────────────────────────────────────────────────────────────
function normalize(results) {
    return results.map(r => ({
        tmdbId: r.id, title: r.title || r.name || '', genreIds: r.genre_ids || [],
        originalLanguage: r.original_language,
        year: (r.release_date || '').slice(0, 4),
        releaseDate: r.release_date,
        poster: posterUrl(r.poster_path), plot: r.overview,
    }));
}

function appendCards(grid, results) {
    results.forEach(r => {
        const gname = GENRE_NAMES[(r.genreIds || [])[0]] || '';
        const card = document.createElement('div');
        card.className = 'poster-card';
        card._film = r;
        const art = r.poster
            ? `<img class="poster-img" loading="lazy" decoding="async" alt="" src="${esc(r.poster)}" onerror="this.classList.add('is-broken')">`
            : exArt(r.title);
        card.innerHTML = `
          ${art}
          <span class="imdb-pill">IMDb …</span>
          <div class="poster-base-info">
            <div class="poster-title">${esc(r.title)}</div>
            <div class="poster-meta">
              ${gname ? `<span class="poster-genre-dot" style="background:${genreColor(gname)}"></span><span>${esc(gname)}</span><span style="opacity:.4">·</span>` : ''}
              <span>${esc(r.year || '')}</span>
            </div>
          </div>
          <div class="poster-overlay">
            <div class="ov-title">${esc(r.title)}</div>
            <div class="ov-sub">${esc([r.year, gname].filter(Boolean).join(' · '))}</div>
            <div class="ov-actions">
              <button class="ov-btn primary" data-act="priority">🎯 ${esc(i18n.t('wl_tier_priority'))}</button>
              <button class="ov-btn sec" data-act="watchlist">+ ${esc(i18n.t('status_watchlist'))}</button>
            </div>
          </div>`;
        grid.appendChild(card);

        // Lazy IMDb rating pill
        movieDetails(r.tmdbId, 'external_ids')
            .then(d => imdbRating({ imdbId: d?.external_ids?.imdb_id || null, title: r.title, year: r.year }))
            .catch(() => imdbRating({ title: r.title, year: r.year }))
            .then(({ rating } = {}) => {
                const pill = card.querySelector('.imdb-pill');
                if (!pill) return;
                if (rating) {
                    pill.textContent = `IMDb ${rating}`;
                    const n = parseFloat(rating);
                    pill.classList.toggle('imdb-high', n >= 7);
                    pill.classList.toggle('imdb-low', n < 5);
                } else pill.remove();
            });
    });
}

function exArt(title) {
    const first = (title.split(' ')[0] || '');
    const abbr  = (title.split(' ').slice(0, 2).map(w => w[0] || '').join('') || '?').toUpperCase();
    return `<div class="ex-art">
        <span class="ex-art-abbr">${esc(abbr)}</span>
        <span class="ex-art-word">${esc(first)}</span>
      </div>`;
}

function chip(row, val, label, on) {
    return `<button class="fp-chip${on ? ' on' : ''}" data-val="${esc(val)}">${esc(label)}</button>`;
}

function skeleton(g, n) {
    g.innerHTML = '';
    for (let i = 0; i < n; i++) {
        const d = document.createElement('div');
        d.className = 'poster-card';
        d.innerHTML = '<div class="poster-img sk" style="width:100%;height:100%"></div>';
        g.appendChild(d);
    }
}

const CHEVRON = `<svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
