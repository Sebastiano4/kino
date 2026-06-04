/**
 * VAULT — analytics, Elo ranking, people.
 *
 * Tabs:
 *   Collection — badge-tiered, searchable grid of rated films.
 *   Overview   — KPI tiles, genre breakdown, decade distribution, world map.
 *   Rankings   — Elo leaderboard.
 *   People     — directors (min 3 films, by avg rating) & actors (by films
 *                seen, then avg), each with a Wikipedia portrait.
 *
 * Reactive: subscribes to the movie store and re-renders the active tab.
 */

import { init, subscribe } from '../core/store.js';
import { getMatches, updateMovie } from '../data/repo.js';
import i18n from '../core/i18n.js';
import { tierOf, seedElo } from '../core/elo.js';
import { computeBadgeBreakpoints, getBadge, tallyBadges, BADGE_TIERS } from '../core/badges.js';
import { aggregateByISO } from '../core/countries.js';
import { backfillCountries, mergeCachedCountries } from '../services/geoEnrich.js';
import { sortMovies } from '../components/filters.js';
import { openDetail } from '../components/detail.js';
import { personImage } from '../services/people.js';

export const vault = {
    id: 'vault', label: 'Vault', icon: '📊',
    _unsub: null,

    async mount(el) {
        el.innerHTML = `
          <div class="vault-page">
            <h2 class="serif accent" style="margin-bottom:4px">Vault</h2>
            <div class="vault-tabs" id="vaultTabs">
              <button class="vault-tab active" data-tab="collection">${i18n.t('vault_collection')}</button>
              <button class="vault-tab" data-tab="overview">Overview</button>
              <button class="vault-tab" data-tab="rankings">Rankings</button>
              <button class="vault-tab" data-tab="directors">People</button>
            </div>
            <div id="vaultBody">
              <div class="sk" style="height:200px;border-radius:var(--r-md)"></div>
            </div>
          </div>`;

        await init();

        let rated = [], wl = [], matches = [];
        let activeTab = 'collection';
        let viewMode = 'grid';
        let activeBadge = 'all';   // 'all' | one of BADGE_TIERS.key
        let searchQuery = '';
        let peopleMode  = 'directors'; // 'directors' | 'actors'

        const render = async () => {
            const body = el.querySelector('#vaultBody');
            if (!body) return;
            const tab = activeTab;
            if (tab === 'collection') _renderCollection(body, rated, matches, viewMode, activeBadge, searchQuery, next => {
                if (next.viewMode    !== undefined) viewMode    = next.viewMode;
                if (next.activeBadge !== undefined) activeBadge = next.activeBadge;
                if (next.searchQuery !== undefined) searchQuery = next.searchQuery;
                render();
            });
            if (tab === 'overview')  _renderOverview(body, rated, wl, matches);
            if (tab === 'rankings')  _renderRankings(body, rated, matches);
            if (tab === 'directors') _renderPeople(body, rated, peopleMode, next => {
                if (next.peopleMode) peopleMode = next.peopleMode;
                render();
            });
        };

        // Load match history once (not in store — separate collection)
        getMatches().then(m => { matches = m; }).catch(() => {});

        this._unsub = subscribe('vault', ({ movies }) => {
            rated   = (movies || []).filter(m => m.rating != null && !m.isWatchlist);
            wl      = (movies || []).filter(m => m.isWatchlist);
            render();
        });

        el.querySelector('#vaultTabs').addEventListener('click', e => {
            const tab = e.target.closest('.vault-tab');
            if (!tab) return;
            el.querySelectorAll('.vault-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeTab = tab.dataset.tab;
            render();
        });
    },

    unmount() {
        if (this._unsub) { this._unsub(); this._unsub = null; }
    },
};

// ── Overview ───────────────────────────────────────────────────────────────

function _renderCollection(body, rated, matches, viewMode, activeBadge, searchQuery, onControl) {
    // Always sort by Elo descending — the browser has one home for ordering.
    const sortedAll = sortMovies(rated, 'elo');

    // Auto-calibrated tier breakpoints over the full rated pool.
    const breakpoints = computeBadgeBreakpoints(rated);
    const tally       = tallyBadges(rated, breakpoints);

    // Annotate each movie with its badge for cheap downstream access.
    sortedAll.forEach(m => { m._badge = getBadge(m, breakpoints); });

    // Apply tier + search filters.
    const q = String(searchQuery || '').toLowerCase().trim();
    const filtered = sortedAll.filter(m => {
        if (activeBadge !== 'all' && (m._badge?.key || null) !== activeBadge) return false;
        if (q) {
            const hay = [m.title, m.director, m.year, ...(m.genres || []).map(g => typeof g === 'string' ? g : g?.name || '')]
                .filter(Boolean).join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });

    const insights = _collectionInsights(rated, matches);

    body.innerHTML = `
      <div class="vault-controls">
        <div class="vault-view-modes">
          ${['grid','compact','detailed'].map(mode => `<button class="vault-mode ${viewMode === mode ? 'active' : ''}" data-view="${mode}">${i18n.t(`vault_${mode}`)}</button>`).join('')}
        </div>
        <input class="filter-input vault-search" type="search" placeholder="${i18n.t('search') || 'Search…'}" value="${esc(searchQuery)}">
      </div>

      <div class="vault-badge-bar">
        <button class="vault-badge-pill ${activeBadge === 'all' ? 'active' : ''}" data-badge="all">
          <span>${i18n.t('all_label') || 'All'}</span>
          <span class="vault-badge-count">${rated.length}</span>
        </button>
        ${BADGE_TIERS.map(t => `
          <button class="vault-badge-pill ${activeBadge === t.key ? 'active' : ''}" data-badge="${t.key}" style="--tier-color:${t.var}" ${!tally[t.key] ? 'disabled' : ''}>
            <span class="vault-badge-dot" style="background:${t.var}"></span>
            <span>${t.label}</span>
            <span class="vault-badge-count">${tally[t.key] || 0}</span>
          </button>`).join('')}
      </div>

      <div class="vault-section">
        <h3 class="vault-section-title">${i18n.t('vault_insights')}</h3>
        <div class="vault-insights">
          ${_vStat(i18n.t('vault_top_genre'), insights.genre)}
          ${_vStat(i18n.t('vault_avg_rating'), insights.avg)}
          ${_vStat(i18n.t('vault_top_decade'), insights.decade)}
          ${_vStat(i18n.t('vault_highest_elo'), insights.highest)}
          ${_vStat(i18n.t('vault_controversial'), insights.controversial)}
        </div>
      </div>
      ${filtered.length ? `<div class="vault-collection vault-collection--${viewMode}">
        ${filtered.map(m => _collectionCard(m, viewMode)).join('')}
      </div>` : `<div class="vault-empty">${i18n.t('vault_empty')}</div>`}`;

    body.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => onControl({ viewMode: btn.dataset.view })));
    body.querySelectorAll('[data-badge]').forEach(btn => btn.addEventListener('click', () => onControl({ activeBadge: btn.dataset.badge })));

    const searchEl = body.querySelector('.vault-search');
    if (searchEl) {
        let dq;
        searchEl.addEventListener('input', () => {
            clearTimeout(dq);
            const v = searchEl.value;
            dq = setTimeout(() => onControl({ searchQuery: v }), 180);
        });
    }

    body.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', async e => {
        e.stopPropagation();
        const id = btn.closest('[data-movie-id]')?.dataset.movieId;
        const movie = rated.find(m => m.id === id);
        if (!movie) return;
        const action = btn.dataset.action;
        if (action === 'view') openDetail(movie, { mode: 'archive' });
        if (action === 'favorite') await updateMovie(id, { isFavorite: !movie.isFavorite });
        if (action === 'watchlist') await updateMovie(id, { isWatchlist: true });
    }));
    body.querySelectorAll('[data-movie-id]').forEach(card => card.addEventListener('click', () => {
        const movie = rated.find(m => m.id === card.dataset.movieId);
        if (movie) openDetail(movie, { mode: 'archive' });
    }));
}

function _collectionCard(m, viewMode) {
    const poster = m.poster || '';
    const meta = [m.year, m.director, m.runtime ? `${m.runtime} min` : ''].filter(Boolean).join(' • ');
    const badge = m._badge;
    const badgeChip = badge
        ? `<span class="vault-badge-chip" style="--tier-color:${badge.var}" title="${badge.label}">${badge.label}</span>`
        : '';
    return `<article class="vault-movie-card" data-movie-id="${esc(m.id)}">
      <div class="vault-movie-poster">
        ${badgeChip}
        <img src="${esc(poster)}" alt="${esc(m.title || '')} poster" loading="lazy">
        <div class="vault-poster-overlay">
          <button class="vault-quick" data-action="view">${i18n.t('vault_view')}</button>
          <button class="vault-quick" data-action="favorite">${m.isFavorite ? '★' : '☆'} ${i18n.t('vault_favorite')}</button>
          <button class="vault-quick" data-action="watchlist">${i18n.t('vault_watchlist')}</button>
        </div>
      </div>
      <div class="vault-movie-info">
        <h4>${esc(m.title || '')}</h4>
        <p>${esc(meta)}</p>
        ${viewMode !== 'grid' ? `<div class="vault-movie-metrics">
          <span>Elo ${seedElo(m)}</span>
          <span>IMDb ${m.imdbRating || '—'}</span>
          <span>Your ${m.rating || '—'}</span>
          <span>${m.eloMatches || 0} battles</span>
        </div>` : ''}
      </div>
    </article>`;
}

function _collectionInsights(rated, matches) {
    const genres = {};
    const decades = {};
    rated.forEach(m => {
        _movieGenres(m).forEach(g => { genres[g] = (genres[g] || 0) + 1; });
        const y = Number(m.year) || Number((m.releaseDate || '').slice(0, 4));
        if (y) {
            const d = `${Math.floor(y / 10) * 10}s`;
            decades[d] = (decades[d] || 0) + 1;
        }
    });
    const withImdb = rated.filter(m => m.imdbRating && m.rating);
    const controversial = withImdb.sort((a, b) => Math.abs(Number(b.rating) - parseFloat(b.imdbRating)) - Math.abs(Number(a.rating) - parseFloat(a.imdbRating)))[0]?.title || '—';
    return {
        genre: _topKey(genres),
        avg: rated.length ? (rated.reduce((s, m) => s + Number(m.rating || 0), 0) / rated.length).toFixed(1) : '—',
        decade: _topKey(decades),
        highest: [...rated].sort((a, b) => seedElo(b) - seedElo(a))[0]?.title || '—',
        controversial,
    };
}

function _movieGenres(m) {
    return Array.isArray(m.genres)
        ? m.genres.map(g => typeof g === 'string' ? g : g?.name || '').filter(Boolean)
        : String(m.genres || '').split(',').map(s => s.trim()).filter(Boolean);
}

function _topKey(obj) {
    return Object.entries(obj).sort(([, a], [, b]) => b - a)[0]?.[0] || '—';
}

function _vaultSortLabel(key) {
    const map = {
        elo: 'sort_elo', rating: 'sort_rating', rt: 'sort_rt', release: 'sort_release',
        added: 'sort_added', title_asc: 'sort_title_asc', personal: 'sort_personal',
        wins: 'sort_wins', battles: 'sort_battles',
    };
    return i18n.t(map[key] || key);
}

/**
 * Overview tab — Kino V2 analytics architecture.
 * Section order:
 *   1. Overview stats   (tinted KPI tiles)
 *   2. Genre breakdown  (films per genre + avg rating)
 *   3. By decade        (distribution over time)
 *   4. World Map        (production countries — bubble map)
 */
function _renderOverview(body, rated, wl, matches) {
    if (!rated.length) {
        body.innerHTML = `<div class="vault-empty">${i18n.t('vault_empty')}</div>`;
        return;
    }

    const avgRating  = (rated.reduce((s, m) => s + Number(m.rating || 0), 0) / rated.length).toFixed(1);
    const totalMin   = rated.reduce((s, m) => s + (m.runtime || 0), 0);
    const runtimeStr = totalMin > 0 ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}m` : '—';
    const ins        = _collectionInsights(rated, matches);

    // ── 1. Overview KPI tiles ────────────────────────────────────────────
    const tiles = [
        { value: rated.length, label: i18n.t('stat_seen'),        color: 'var(--gold)'     },
        { value: avgRating,    label: i18n.t('stat_avg'),         color: 'var(--teal)'     },
        { value: ins.genre,    label: i18n.t('vault_top_genre'),  color: 'var(--amber)'    },
        { value: ins.decade,   label: i18n.t('vault_top_decade'), color: 'var(--indigo)'   },
        { value: wl.length,    label: i18n.t('stat_watchlist'),   color: 'var(--ink-mute)' },
        { value: runtimeStr,   label: i18n.t('stat_runtime'),     color: 'var(--ink-mute)' },
    ];

    // ── 2. By decade — continuous timeline of vertical columns ───────────
    const decadeCounts = {};
    rated.forEach(m => {
        const y = Number(m.year) || Number((m.releaseDate || '').slice(0, 4));
        if (y) { const d = Math.floor(y / 10) * 10; decadeCounts[d] = (decadeCounts[d] || 0) + 1; }
    });
    const present  = Object.keys(decadeCounts).map(Number);
    let decades = [];
    if (present.length) {
        const lo = Math.min(...present), hi = Math.max(...present);
        for (let d = lo; d <= hi; d += 10) decades.push({ decade: d, count: decadeCounts[d] || 0 });
    }
    const decadeMax = Math.max(1, ...decades.map(d => d.count));

    // ── 3. Genre breakdown — films per genre (bar = count) + avg rating ──
    const gMap = {};
    rated.forEach(m => _movieGenres(m).forEach(g => {
        (gMap[g] ||= []).push(Number(m.rating || 0));
    }));
    const genres = Object.entries(gMap)
        .map(([name, rs]) => ({
            name, count: rs.length,
            avg: rs.reduce((s, r) => s + r, 0) / rs.length,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
    const genreMax = Math.max(1, ...genres.map(g => g.count));

    body.innerHTML = `
      <div class="vault-stats vault-stats--tinted">
        ${tiles.map(t => `<div class="vault-stat vault-stat--tinted" style="--tile-color:${t.color}">
            <div class="vault-stat-value">${esc(String(t.value))}</div>
            <div class="vault-stat-label">${esc(t.label)}</div>
          </div>`).join('')}
      </div>

      <div class="vault-chart-grid">
        <div class="vault-chart-card">
          <h3 class="vault-chart-title">${i18n.t('vault_genre_breakdown')}</h3>
          <p class="vault-chart-desc">${i18n.t('vault_genre_breakdown_hint')}</p>
          ${genres.length ? `<div class="vault-genre-list">
            ${genres.map(g => {
              const c = _genreColor(g.name);
              return `<div class="vault-genre-row">
                <span class="vault-genre-name">${esc(g.name)}</span>
                <div class="vault-genre-track">
                  <div class="vault-genre-fill" style="width:${(g.count / genreMax * 100).toFixed(1)}%;background:${c}"></div>
                </div>
                <span class="vault-genre-count mono">${g.count}</span>
                <span class="vault-genre-rating mono" style="color:${c}">&#9733;${g.avg.toFixed(1)}</span>
              </div>`;
            }).join('')}
          </div>` : `<div class="vault-chart-empty">${i18n.t('vault_comfort_zone_empty')}</div>`}
        </div>

        <div class="vault-chart-card">
          <h3 class="vault-chart-title">${i18n.t('vault_by_decade')}</h3>
          <p class="vault-chart-desc">${i18n.t('vault_by_decade_hint')}</p>
          ${decades.length ? `<div class="vault-decade-chart">
            ${decades.map(d => {
              const ratio = d.count / decadeMax;
              const op    = (0.35 + ratio * 0.65).toFixed(2);
              return `<div class="vault-decade-col" title="${d.decade}s · ${d.count}">
                <div class="vault-decade-bar-wrap">
                  <div class="vault-decade-bar" style="height:${Math.max(ratio * 100, 2).toFixed(1)}%;opacity:${op}"></div>
                </div>
                <span class="vault-decade-label mono">'${String(d.decade % 100).padStart(2, '0')}s</span>
                <span class="vault-decade-count mono">${d.count}</span>
              </div>`;
            }).join('')}
          </div>` : `<div class="vault-chart-empty">${i18n.t('vault_comfort_zone_empty')}</div>`}
        </div>
      </div>

      <div class="vault-section vault-worldmap-section">
        <h3 class="vault-section-title">${i18n.t('vault_world_map')} <span class="vault-hint">${i18n.t('vault_world_map_hint')}</span></h3>
        <div id="overviewWorldMap" class="vault-worldmap"></div>
      </div>`;

    // ── 4. World Map — production countries (moved here from Charts) ──────
    _buildWorldMap(body.querySelector('#overviewWorldMap'), rated);
}

// ── Genre color palette (shared by Overview genre breakdown) ────────────────
const GENRE_COLORS = {
    Drama:           '#C8A97E',
    Thriller:        '#D4714A',
    Animation:       '#5E9C8A',
    Comedy:          '#A0B85E',
    'Sci-Fi':        '#7E8BC8',
    'Science Fiction':'#7E8BC8',
    Action:          '#C85E5E',
    Romance:         '#C87EA9',
    Horror:          '#8C6A6A',
    Documentary:     '#9CA68C',
    Adventure:       '#D4A55E',
    Crime:           '#806060',
    Mystery:         '#6E6A8C',
    Fantasy:         '#A07EC8',
    Family:          '#C8B86E',
    History:         '#9C8C70',
    War:             '#6E5C50',
    Music:           '#8CB8B0',
    Western:         '#B8945E',
};

function _genreColor(name) {
    return GENRE_COLORS[name] || '#9A8A7A'; // warm fallback
}

// ── World choropleth ────────────────────────────────────────────────────────
//
// A real equirectangular world map: every country is drawn from local GeoJSON
// (src/data/world-110m.json) and shaded on a continuous thermal scale by how
// many of my films come from there. Zero-film countries stay neutral. Hover
// shows name / count / avg rating; clicking opens a sortable film list.

const WORLD_W = 1000, WORLD_H = 500;
let _worldGeo = null; // cached fetch promise for the GeoJSON

function _loadWorldGeo() {
    if (_worldGeo) return _worldGeo;
    _worldGeo = fetch(new URL('../data/world-110m.json', import.meta.url))
        .then(r => { if (!r.ok) throw new Error(`geo HTTP ${r.status}`); return r.json(); })
        .catch(err => { _worldGeo = null; throw err; });
    return _worldGeo;
}

// Thermal scale: t in [0,1] over the non-zero count range, cool → hot.
const HEAT_STOPS = [
    [0.00, [ 38,  82, 104]],
    [0.35, [ 46, 150, 142]],
    [0.65, [212, 165,  94]],
    [1.00, [201,  72,  48]],
];
const HEAT_ZERO = 'rgb(46,49,56)'; // neutral — countries with no films

function _heatColor(t) {
    const c = Math.max(0, Math.min(1, t));
    for (let i = 1; i < HEAT_STOPS.length; i++) {
        const [t0, a] = HEAT_STOPS[i - 1];
        const [t1, b] = HEAT_STOPS[i];
        if (c <= t1) {
            const f = (c - t0) / (t1 - t0 || 1);
            return `rgb(${Math.round(a[0]+(b[0]-a[0])*f)},${Math.round(a[1]+(b[1]-a[1])*f)},${Math.round(a[2]+(b[2]-a[2])*f)})`;
        }
    }
    return `rgb(${HEAT_STOPS.at(-1)[1].join(',')})`;
}

// Project one ring to an SVG path. Drops dateline-crossing fragments (span>180°)
// so the far-east tips of Russia/US don't smear across an equirectangular canvas.
function _ringPath(ring) {
    let lo = Infinity, hi = -Infinity;
    for (const p of ring) { if (p[0] < lo) lo = p[0]; if (p[0] > hi) hi = p[0]; }
    if (hi - lo > 180) return '';
    let d = '';
    for (let i = 0; i < ring.length; i++) {
        const x = ((ring[i][0] + 180) / 360) * WORLD_W;
        const y = ((90 - ring[i][1]) / 180) * WORLD_H;
        d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    return d + 'Z';
}

function _geoPath(geometry) {
    const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    let d = '';
    polys.forEach(rings => rings.forEach(ring => { d += _ringPath(ring); }));
    return d;
}

async function _buildWorldMap(container, movies) {
    if (!container) return;

    // Paint immediately with the countries we already have (cached/persisted)…
    await _paintWorldMap(container, mergeCachedCountries(movies || []));

    // …then recover any missing production countries from OMDb (one network
    // pass per session). Hits persist to Firestore → the store re-renders and
    // the map fills in; we also repaint here for films still mid-write.
    try {
        const filled = await backfillCountries(movies || []);
        if (container.isConnected) await _paintWorldMap(container, filled);
    } catch {}
}

async function _paintWorldMap(container, movies) {
    if (!container) return;

    const agg = aggregateByISO((movies || []).filter(m => m.countries?.length));
    let maxCount = 0;
    agg.forEach(r => { if (r.count > maxCount) maxCount = r.count; });

    if (!container.querySelector('svg')) {
        container.innerHTML = `<div class="vault-chart-empty">…</div>`;
    }

    let geo;
    try { geo = await _loadWorldGeo(); }
    catch { container.innerHTML = `<div class="vault-chart-empty">${i18n.t('vault_no_country_data')}</div>`; return; }
    if (!container.isConnected) return;

    const paths = geo.features.map(f => {
        const d = _geoPath(f.geometry);
        if (!d) return '';
        const iso   = f.properties.iso2;
        const rec   = iso ? agg.get(iso) : null;
        const count = rec ? rec.count : 0;
        const fill  = count > 0 && maxCount > 0 ? _heatColor(count / maxCount) : HEAT_ZERO;
        const avg   = rec && rec.avg != null ? rec.avg.toFixed(1) : '';
        return `<path d="${d}" fill="${fill}" class="vault-geo-country${rec ? ' has-data' : ''}"`
             + ` data-iso="${esc(iso || '')}" data-name="${esc(rec ? rec.name : f.properties.name)}"`
             + ` data-count="${count}" data-avg="${avg}"></path>`;
    }).join('');

    const counted    = [...agg.values()].sort((a, b) => b.count - a.count);
    const totalFilms = counted.reduce((s, r) => s + r.count, 0);

    container.innerHTML = `
      <div class="vault-worldmap-wrap">
        <svg viewBox="0 0 ${WORLD_W} ${WORLD_H}" xmlns="http://www.w3.org/2000/svg" class="vault-worldmap-svg" role="img" aria-label="World choropleth of films by production country">
          <rect width="${WORLD_W}" height="${WORLD_H}" fill="var(--bg)"/>
          <g class="vault-geo-countries">${paths}</g>
        </svg>
        <div class="vault-worldmap-tooltip" hidden></div>
      </div>
      <div class="vault-geo-legend">
        <span class="vault-geo-legend-label mono">${counted.length} ${counted.length === 1 ? 'country' : 'countries'} · ${totalFilms} films</span>
        <span class="vault-geo-scale">
          <span class="vault-geo-scale-min mono">1</span>
          <span class="vault-geo-scale-bar"></span>
          <span class="vault-geo-scale-max mono">${maxCount}</span>
          <span class="vault-geo-scale-na"><i></i>${i18n.t('vault_geo_no_data')}</span>
        </span>
      </div>
      <div class="vault-geo-detail">
        <div class="vault-geo-detail-empty">${i18n.t('vault_geo_prompt')}</div>
      </div>`;

    const bar = container.querySelector('.vault-geo-scale-bar');
    if (bar) bar.style.background = `linear-gradient(90deg, ${[0, .25, .5, .75, 1].map(_heatColor).join(',')})`;

    _wireWorldMap(container, agg);
}

function _wireWorldMap(container, agg) {
    const svg  = container.querySelector('svg');
    const wrap = container.querySelector('.vault-worldmap-wrap');
    const tip  = container.querySelector('.vault-worldmap-tooltip');
    if (!svg) return;

    svg.addEventListener('mouseover', e => {
        const p = e.target.closest('.vault-geo-country');
        if (!p) return;
        const count = Number(p.dataset.count);
        const avg   = p.dataset.avg;
        tip.innerHTML = `<strong>${esc(p.dataset.name)}</strong>`
            + `<span>${count} ${count === 1 ? 'film' : 'films'}${avg ? ` · ★ ${avg}` : ''}</span>`;
        tip.hidden = false;
    });
    svg.addEventListener('mousemove', e => {
        const r = wrap.getBoundingClientRect();
        tip.style.left = (e.clientX - r.left + 14) + 'px';
        tip.style.top  = (e.clientY - r.top  + 14) + 'px';
    });
    svg.addEventListener('mouseleave', () => { tip.hidden = true; });

    svg.addEventListener('click', e => {
        const p = e.target.closest('.vault-geo-country.has-data');
        if (!p) return;
        const rec = agg.get(p.dataset.iso);
        if (!rec) return;
        svg.querySelectorAll('.vault-geo-country.selected').forEach(n => n.classList.remove('selected'));
        p.classList.add('selected');
        _renderGeoDetail(container.querySelector('.vault-geo-detail'), rec);
    });
}

function _geoSortLabel(k) {
    return i18n.t(k === 'rating' ? 'vault_geo_rating' : k === 'year' ? 'vault_geo_year' : 'vault_geo_title');
}

function _sortGeoFilms(films, { key, dir }) {
    const s = films.slice().sort((a, b) => {
        if (key === 'title') return String(a.title || '').localeCompare(String(b.title || ''));
        if (key === 'year')  return (Number(a.year) || 0) - (Number(b.year) || 0);
        return (Number(a.rating) || 0) - (Number(b.rating) || 0);
    });
    return dir === 'desc' ? s.reverse() : s;
}

function _renderGeoDetail(panel, rec) {
    if (!panel) return;
    const sort = { key: 'rating', dir: 'desc' };

    const draw = () => {
        const films = _sortGeoFilms(rec.films, sort);
        panel.innerHTML = `
          <div class="vault-geo-detail-head">
            <h4 class="serif">${esc(rec.name)}
              <span class="vault-hint">${rec.count} ${rec.count === 1 ? 'film' : 'films'}${rec.avg != null ? ` · ★ ${rec.avg.toFixed(1)}` : ''}</span>
            </h4>
            <div class="vault-geo-sort">
              ${['rating', 'year', 'title'].map(k =>
                `<button class="vault-geo-sort-btn ${sort.key === k ? 'active' : ''}" data-sort="${k}">${_geoSortLabel(k)}${sort.key === k ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</button>`
              ).join('')}
            </div>
          </div>
          <div class="vault-geo-list">
            ${films.map(f => `<div class="vault-people-film-row" data-film-id="${esc(f.id)}">
              ${f.poster
                ? `<img class="vault-people-film-poster" src="${esc(f.poster)}" alt="" loading="lazy">`
                : `<span class="vault-people-film-poster vault-people-film-poster--blank"></span>`}
              <span class="vault-people-film-title serif">${esc(f.title)}</span>
              <span class="vault-people-film-year mono">${f.year || ''}</span>
              <span class="vault-people-film-rating mono accent">★ ${f.rating != null ? Number(f.rating).toFixed(1) : '—'}</span>
            </div>`).join('')}
          </div>`;

        panel.querySelectorAll('[data-sort]').forEach(b => b.addEventListener('click', () => {
            const k = b.dataset.sort;
            if (sort.key === k) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
            else { sort.key = k; sort.dir = k === 'title' ? 'asc' : 'desc'; }
            draw();
        }));
        panel.querySelectorAll('[data-film-id]').forEach(row => row.addEventListener('click', () => {
            const m = rec.films.find(x => x.id === row.dataset.filmId);
            if (m) openDetail(m, { mode: 'archive' });
        }));
    };

    draw();
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Rankings ───────────────────────────────────────────────────────────────

function _renderRankings(body, rated, matches) {
    const ranking = [...rated].sort((a, b) => seedElo(b) - seedElo(a)).slice(0, 30);

    body.innerHTML = `
      <div class="vault-section">
        <h3 class="vault-section-title">Elo Ranking</h3>
        ${ranking.length ? `<div class="vault-ranking">
          ${ranking.map((m, i) => `
            <div class="vault-rank-row">
              <span class="vault-rank-pos mono">${i+1}</span>
              <span class="vault-rank-title serif">${esc(m.title)}</span>
              <span class="vault-rank-tier">${tierOf(seedElo(m)).label}</span>
              <span class="vault-rank-elo mono">${seedElo(m)}</span>
            </div>`).join('')}
        </div>` : `<div class="vault-empty">${i18n.t('vault_no_rated')}</div>`}
      </div>`;
}

// ── Directors ──────────────────────────────────────────────────────────────

function _renderPeople(body, rated, mode, onControl) {
    const dirs   = _aggregateDirectors(rated);
    const actors = _aggregateActors(rated);

    body.innerHTML = `
      <div class="vault-people-toggle">
        <button class="vault-people-tab ${mode === 'directors' ? 'active' : ''}" data-mode="directors">
          Directors <span class="vault-people-tab-count">${dirs.length}</span>
        </button>
        <button class="vault-people-tab ${mode === 'actors' ? 'active' : ''}" data-mode="actors">
          Actors <span class="vault-people-tab-count">${actors.length}</span>
        </button>
      </div>
      <div id="vaultPeopleBody"></div>`;

    body.querySelectorAll('[data-mode]').forEach(btn =>
        btn.addEventListener('click', () => onControl({ peopleMode: btn.dataset.mode }))
    );

    const inner = body.querySelector('#vaultPeopleBody');
    if (mode === 'actors') _renderActors(inner, actors, rated);
    else                   _renderDirectors(inner, dirs, rated);

    _hydratePeopleImages(inner);
}

function _aggregateDirectors(rated) {
    const dirMap = {};
    rated.forEach(m => {
        const d = m.director; if (!d) return;
        if (!dirMap[d]) dirMap[d] = { films: [] };
        dirMap[d].films.push(m);
    });

    return Object.entries(dirMap)
        .map(([name, v]) => {
            const films = v.films
                .slice()
                .sort((a, b) => Number(b.rating) - Number(a.rating));
            const total = films.reduce((s, m) => s + Number(m.rating || 0), 0);
            return {
                name,
                count: films.length,
                avg:   total / films.length,
                films,
                country: _topKey(films.reduce((acc, m) => {
                    (m.countries || []).forEach(c => { acc[c] = (acc[c] || 0) + 1; });
                    return acc;
                }, {})),
            };
        })
        // Min. 3 films — drop statistically thin samples.
        .filter(d => d.count >= 3)
        .sort((a, b) => b.avg - a.avg);
}

function _aggregateActors(rated) {
    const actorMap = {};
    rated.forEach(m => {
        (m.cast || []).forEach(name => {
            if (!name) return;
            if (!actorMap[name]) actorMap[name] = { films: [] };
            actorMap[name].films.push(m);
        });
    });
    return Object.entries(actorMap)
        .map(([name, v]) => {
            const films = v.films.slice().sort((a, b) => Number(b.rating) - Number(a.rating));
            const total = films.reduce((s, m) => s + Number(m.rating || 0), 0);
            return {
                name,
                count: films.length,
                avg:   total / films.length,
                films,
                country: _topKey(films.reduce((acc, m) => {
                    (m.countries || []).forEach(c => { acc[c] = (acc[c] || 0) + 1; });
                    return acc;
                }, {})),
            };
        })
        .filter(a => a.count >= 1)
        // Primary: films seen (desc). Tiebreak: average rating (desc).
        .sort((a, b) => b.count - a.count || b.avg - a.avg);
}

function _renderDirectors(body, dirs, rated) {
    body.innerHTML = `
      <div class="vault-section">
        <h3 class="vault-section-title">Top Directors <span class="vault-hint">min. 3 films · ranked by avg rating</span></h3>
        ${dirs.length ? `<div class="vault-people-grid">
          ${dirs.map((d, i) => _peopleCard(d, i, { expandable: true })).join('')}
        </div>` : `<div class="vault-empty">${i18n.t('vault_add_directors')}</div>`}
      </div>`;

    _wirePeopleCards(body, rated);
}

function _renderActors(body, actors, rated) {
    if (!actors.length) {
        body.innerHTML = `<div class="vault-section">
          <div class="vault-empty">No cast data yet — open films in the detail modal to populate cast.</div>
        </div>`;
        return;
    }
    // Show top 40 — keeps the list digestible since actors come in higher numbers than directors.
    const top = actors.slice(0, 40);
    body.innerHTML = `
      <div class="vault-section">
        <h3 class="vault-section-title">Top Actors <span class="vault-hint">ranked by films seen · then avg rating</span></h3>
        <div class="vault-people-grid">
          ${top.map((a, i) => _peopleCard(a, i, { expandable: true })).join('')}
        </div>
      </div>`;

    _wirePeopleCards(body, rated);
}

/** Shared accordion + film-row wiring for both directors and actors. */
function _wirePeopleCards(body, rated) {
    body.querySelectorAll('.vault-people-card.is-expandable').forEach(card => {
        const head = card.querySelector('.vault-people-head');
        head?.addEventListener('click', () => card.classList.toggle('expanded'));
    });
    body.querySelectorAll('[data-film-id]').forEach(row => {
        row.addEventListener('click', e => {
            e.stopPropagation();
            const m = rated.find(x => x.id === row.dataset.filmId);
            if (m) openDetail(m, { mode: 'archive' });
        });
    });
}

function _peopleCard(p, rank, { expandable = true } = {}) {
    const [c1, c2] = _avatarGradient(p.name);
    const initials = _initials(p.name);
    const gallery  = p.films.slice(0, 5).map(f => f.poster
        ? `<img class="vault-people-thumb" src="${esc(f.poster)}" alt="" loading="lazy" title="${esc(f.title)}">`
        : `<span class="vault-people-thumb vault-people-thumb--blank"></span>`
    ).join('');
    const filmsWord = p.count === 1 ? 'film' : 'films';
    const cls   = expandable ? 'vault-people-card is-expandable' : 'vault-people-card';
    return `<article class="${cls}">
      <div class="vault-people-head"${expandable ? ' role="button" tabindex="0"' : ''}>
        <span class="vault-people-rank mono">${String(rank + 1).padStart(2, '0')}</span>
        <span class="vault-people-avatar" data-person="${esc(p.name)}" style="background:linear-gradient(135deg, ${c1} 0%, ${c2} 100%)"><span class="vault-people-avatar-initials">${initials}</span></span>
        <div class="vault-people-info">
          <h4 class="vault-people-name serif">${esc(p.name)}</h4>
          <span class="vault-people-meta">${esc(p.country || '—')}</span>
        </div>
        <div class="vault-people-gallery">${gallery}</div>
        <div class="vault-people-stats">
          <span class="vault-people-count mono"><strong>${p.count}</strong> ${filmsWord}</span>
          <span class="vault-people-score mono accent">★ ${p.avg.toFixed(1)}</span>
        </div>
        ${expandable ? '<span class="vault-people-chev" aria-hidden="true">▾</span>' : '<span></span>'}
      </div>
      ${expandable ? `<div class="vault-people-films">
        ${p.films.map(f => `<div class="vault-people-film-row" data-film-id="${esc(f.id)}">
          ${f.poster
            ? `<img class="vault-people-film-poster" src="${esc(f.poster)}" alt="" loading="lazy">`
            : `<span class="vault-people-film-poster vault-people-film-poster--blank"></span>`}
          <span class="vault-people-film-title serif">${esc(f.title)}</span>
          <span class="vault-people-film-year mono">${f.year || ''}</span>
          <span class="vault-people-film-rating mono accent">★ ${Number(f.rating).toFixed(1)}</span>
        </div>`).join('')}
      </div>` : ''}
    </article>`;
}

// ── Avatar helpers ─────────────────────────────────────────────────────────

/**
 * Asynchronously swap initials placeholders for real portraits.
 * Each avatar carries data-person; personImage() resolves a Wikipedia portrait
 * (cached). We pre-load the bitmap so the swap is flicker-free, then paint it
 * as a face-centered background. On miss the gradient + initials remain.
 */
function _hydratePeopleImages(scope) {
    if (!scope) return;
    scope.querySelectorAll('.vault-people-avatar[data-person]').forEach(el => {
        const name = el.dataset.person;
        personImage(name).then(url => {
            if (!url || !el.isConnected) return;
            const img = new Image();
            img.onload = () => {
                if (!el.isConnected) return;
                el.style.backgroundImage    = `url("${url}")`;
                el.style.backgroundSize     = 'cover';
                el.style.backgroundPosition = 'center 22%';
                el.classList.add('has-photo');
            };
            img.src = url;
        }).catch(() => {});
    });
}

function _initials(name) {
    return String(name)
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(p => p[0]?.toUpperCase() || '')
        .join('') || '?';
}

function _avatarGradient(name) {
    const h = String(name).split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 0) % 360;
    return [`hsl(${h}, 22%, 18%)`, `hsl(${h}, 18%, 28%)`];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function _vStat(label, val) {
    return `<div class="vault-stat"><div class="vault-stat-value">${val}</div><div class="vault-stat-label">${label}</div></div>`;
}

function _miniCard(m, delta, dir) {
    const poster = m.poster ? `<img class="vault-mini-poster" src="${esc(m.poster)}" alt="" loading="lazy">` : '';
    return `<div class="vault-mini-card">${poster}
      <div class="vault-mini-info">
        <span class="vault-mini-title">${esc(m.title)}</span>
        <span class="vault-mini-sub">${Number(m.rating).toFixed(1)} vs IMDb ${m.imdbRating}</span>
      </div>
      <span class="vault-mini-delta ${dir}">${delta}</span>
    </div>`;
}

function _upsetCard(m, i) {
    const winnerIsA = m.winnerId === m.movieAId;
    const winner    = winnerIsA ? m.movieATitle : m.movieBTitle;
    const loser     = winnerIsA ? m.movieBTitle : m.movieATitle;
    const wElo      = winnerIsA ? m.movieAElo : m.movieBElo;
    const lElo      = winnerIsA ? m.movieBElo : m.movieAElo;
    return `<div class="vault-upset-card">
      <span class="vault-upset-rank">#${i+1}</span>
      <div class="vault-upset-info">
        <span class="vault-upset-winner">${esc(winner)} <span class="mono">(${wElo})</span></span>
        <span class="vault-upset-beat">${i18n.t('vault_beat')}</span>
        <span class="vault-upset-loser">${esc(loser)} <span class="mono">(${lElo})</span></span>
      </div>
      <span class="vault-upset-gap">${Math.abs(lElo-wElo)}</span>
    </div>`;
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
