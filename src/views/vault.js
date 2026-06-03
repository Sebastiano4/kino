/**
 * VAULT 2.0 — analytics, ranking Elo, charts.
 *
 * Part 1: reactive store subscription.
 * Part 8: 5 new Chart.js visualizations:
 *   1. Ratings vs Release Year — scatter (pre-existing: consensus delta)
 *   2. Genre Radar — avg user rating per top genre
 *   3. Elo Evolution Timeline — Elo trajectory from match history
 *   4. Watch Activity Heatmap — GitHub-style calendar heatmap
 *   5. Director Ranking — top 10 directors by avg rating
 *
 * Thematic Constellation: canvas-based force-directed clustering of movies
 * by genre + AI tags. Architecture described below after charts.
 */

import { init, subscribe } from '../core/store.js';
import { getMatches, updateMovie } from '../data/repo.js';
import i18n from '../core/i18n.js';
import { tierOf, seedElo } from '../core/elo.js';
import { sortMovies } from '../components/filters.js';
import { openDetail } from '../components/detail.js';

// ── Chart.js lazy loader ──────────────────────────────────────────────────
let _Chart = null;
async function loadChart() {
    if (_Chart) return _Chart;
    if (window.Chart) return (_Chart = window.Chart);
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src     = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
        s.onload  = () => { _Chart = window.Chart; resolve(_Chart); };
        s.onerror = () => reject(new Error('Chart.js load failed'));
        document.head.appendChild(s);
    });
}

// ── Chart registry (for cleanup on tab switch) ─────────────────────────────
const _charts = new Map();
function _destroyChart(id) {
    if (_charts.has(id)) { try { _charts.get(id).destroy(); } catch {} _charts.delete(id); }
}
function _destroyAll() { _charts.forEach(c => { try { c.destroy(); } catch {} }); _charts.clear(); }

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
              <button class="vault-tab" data-tab="charts">Charts</button>
              <button class="vault-tab" data-tab="rankings">Rankings</button>
              <button class="vault-tab" data-tab="directors">Directors</button>
            </div>
            <div id="vaultBody">
              <div class="sk" style="height:200px;border-radius:var(--r-md)"></div>
            </div>
          </div>`;

        await init();

        let rated = [], wl = [], matches = [];
        let activeTab = 'collection';
        let viewMode = 'grid';
        let sortKey = 'elo';

        const render = async () => {
            _destroyAll();
            const body = el.querySelector('#vaultBody');
            if (!body) return;
            const tab = activeTab;
            if (tab === 'collection') _renderCollection(body, rated, matches, viewMode, sortKey, next => {
                if (next.viewMode) viewMode = next.viewMode;
                if (next.sortKey) sortKey = next.sortKey;
                render();
            });
            if (tab === 'overview')  _renderOverview(body, rated, wl, matches);
            if (tab === 'charts')    await _renderCharts(body, rated, matches);
            if (tab === 'rankings')  _renderRankings(body, rated, matches);
            if (tab === 'directors') _renderDirectors(body, rated);
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
        _destroyAll();
        if (this._unsub) { this._unsub(); this._unsub = null; }
    },
};

// ── Overview ───────────────────────────────────────────────────────────────

function _renderCollection(body, rated, matches, viewMode, sortKey, onControl) {
    const sorted = sortMovies(rated, sortKey);
    const insights = _collectionInsights(rated, matches);
    body.innerHTML = `
      <div class="vault-controls">
        <div class="vault-view-modes">
          ${['grid','compact','detailed'].map(mode => `<button class="vault-mode ${viewMode === mode ? 'active' : ''}" data-view="${mode}">${i18n.t(`vault_${mode}`)}</button>`).join('')}
        </div>
        <select class="filter-select" id="vaultSort">
          ${['elo','rating','rt','release','added','title_asc','personal','wins','battles'].map(s => `<option value="${s}" ${s === sortKey ? 'selected' : ''}>${_vaultSortLabel(s)}</option>`).join('')}
        </select>
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
      ${sorted.length ? `<div class="vault-collection vault-collection--${viewMode}">
        ${sorted.map(m => _collectionCard(m, viewMode)).join('')}
      </div>` : `<div class="vault-empty">${i18n.t('vault_empty')}</div>`}`;

    body.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => onControl({ viewMode: btn.dataset.view })));
    body.querySelector('#vaultSort')?.addEventListener('change', e => onControl({ sortKey: e.target.value }));
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
    return `<article class="vault-movie-card" data-movie-id="${esc(m.id)}">
      <div class="vault-movie-poster">
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

function _renderOverview(body, rated, wl, matches) {
    const avgRating  = rated.length ? (rated.reduce((s, m) => s + Number(m.rating), 0) / rated.length).toFixed(1) : '—';
    const totalMin   = rated.reduce((s, m) => s + (m.runtime || 0), 0);
    const runtimeStr = totalMin > 0 ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}m` : '—';

    const withImdb = rated.filter(m => m.imdbRating && m.rating);
    const guilty   = withImdb.filter(m => Number(m.rating) > parseFloat(m.imdbRating))
        .sort((a, b) => (Number(b.rating)-parseFloat(b.imdbRating)) - (Number(a.rating)-parseFloat(a.imdbRating))).slice(0,3);
    const hot      = withImdb.filter(m => Number(m.rating) < parseFloat(m.imdbRating))
        .sort((a, b) => (parseFloat(b.imdbRating)-Number(b.rating)) - (parseFloat(a.imdbRating)-Number(a.rating))).slice(0,3);

    const upsets = matches.filter(m => m.isUpset)
        .sort((a, b) => Math.abs((b.movieAElo||0)-(b.movieBElo||0)) - Math.abs((a.movieAElo||0)-(a.movieBElo||0)))
        .slice(0,3);

    body.innerHTML = `
      <div class="vault-stats">
        ${_vStat(i18n.t('stat_seen'),      rated.length)}
        ${_vStat(i18n.t('stat_watchlist'), wl.length)}
        ${_vStat(i18n.t('stat_avg'),       avgRating)}
        ${_vStat(i18n.t('stat_runtime'),   runtimeStr)}
      </div>
      ${guilty.length ? `<div class="vault-section"><h3 class="vault-section-title">${i18n.t('guilty_pleasures')} <span class="vault-hint">${i18n.t('guilty_hint')}</span></h3><div class="vault-mini-list">${guilty.map(m => _miniCard(m, `+${(Number(m.rating)-parseFloat(m.imdbRating)).toFixed(1)}`, 'up')).join('')}</div></div>` : ''}
      ${hot.length    ? `<div class="vault-section"><h3 class="vault-section-title">${i18n.t('hot_takes')} <span class="vault-hint">${i18n.t('hot_takes_hint')}</span></h3><div class="vault-mini-list">${hot.map(m => _miniCard(m, `${(Number(m.rating)-parseFloat(m.imdbRating)).toFixed(1)}`, 'down')).join('')}</div></div>` : ''}
      ${upsets.length ? `<div class="vault-section"><h3 class="vault-section-title">${i18n.t('top_upsets')} <span class="vault-hint">${i18n.t('top_upsets_hint')}</span></h3><div class="vault-upsets">${upsets.map(_upsetCard).join('')}</div></div>` : ''}
      ${!rated.length ? `<div class="vault-empty">${i18n.t('vault_empty')}</div>` : ''}`;
}

// ── Charts ─────────────────────────────────────────────────────────────────

async function _renderCharts(body, rated, matches) {
    const withImdb    = rated.filter(m => m.imdbRating && m.rating);
    const withRuntime = rated.filter(m => m.runtime && m.rating);
    const withYear    = rated.filter(m => m.year && m.rating);

    body.innerHTML = `
      <div class="vault-chart-grid">
        <div class="vault-chart-card">
          <h3 class="vault-chart-title">${i18n.t('consensus_delta')}</h3>
          <p class="vault-chart-desc">${i18n.t('consensus_desc')}</p>
          ${withImdb.length >= 2 ? '<div class="vault-chart-wrap"><canvas id="chartDelta"></canvas></div>' : _emptyChart(i18n.t('vault_need_at_least_imdb'))}
        </div>
        <div class="vault-chart-card">
          <h3 class="vault-chart-title">${i18n.t('runtime_vs_rating')}</h3>
          <p class="vault-chart-desc">${i18n.t('runtime_desc')}</p>
          ${withRuntime.length >= 2 ? '<div class="vault-chart-wrap"><canvas id="chartRuntime"></canvas></div>' : _emptyChart(i18n.t('vault_need_at_least_runtime'))}
        </div>
        <div class="vault-chart-card">
          <h3 class="vault-chart-title">Rating by Year</h3>
          <p class="vault-chart-desc">Do older films rate higher?</p>
          ${withYear.length >= 2 ? '<div class="vault-chart-wrap"><canvas id="chartYear"></canvas></div>' : _emptyChart('Rate more films to see this chart.')}
        </div>
        <div class="vault-chart-card">
          <h3 class="vault-chart-title">Genre Radar</h3>
          <p class="vault-chart-desc">Average rating per genre</p>
          <div class="vault-chart-wrap"><canvas id="chartGenre"></canvas></div>
        </div>
        <div class="vault-chart-card vault-chart-card--wide">
          <h3 class="vault-chart-title">Watch Activity</h3>
          <p class="vault-chart-desc">Your film diary this year</p>
          <div id="chartHeatmap" class="vault-heatmap"></div>
        </div>
        ${matches.length >= 3 ? `
        <div class="vault-chart-card vault-chart-card--wide">
          <h3 class="vault-chart-title">Elo Evolution</h3>
          <p class="vault-chart-desc">Top 5 films Elo trajectory</p>
          <div class="vault-chart-wrap"><canvas id="chartElo"></canvas></div>
        </div>` : ''}
      </div>`;

    try {
        const Chart = await loadChart();
        if (withImdb.length >= 2)    _buildConsensusChart(Chart, withImdb);
        if (withRuntime.length >= 2) _buildRuntimeChart(Chart, withRuntime);
        if (withYear.length >= 2)    _buildYearChart(Chart, withYear);
        if (rated.length >= 3)       _buildGenreRadar(Chart, rated);
        _buildHeatmap(document.getElementById('chartHeatmap'), rated);
        if (matches.length >= 3)     _buildEloTimeline(Chart, rated, matches);
    } catch (e) {
        body.insertAdjacentHTML('beforeend', `<div class="vault-chart-error">${i18n.t('chart_load_failed')}: ${e.message}</div>`);
    }
}

// 1. Consensus Delta (existing, refactored)
function _buildConsensusChart(Chart, movies) {
    const ctx = document.getElementById('chartDelta'); if (!ctx) return;
    const data = movies.map(m => ({ x: parseFloat(m.imdbRating), y: Number(m.rating), title: m.title }));
    _charts.set('delta', new Chart(ctx, {
        type: 'scatter',
        data: { datasets: [
            { label: 'Film', data, pointRadius: 6, pointHoverRadius: 9,
              backgroundColor: data.map(d => d.y > d.x ? 'rgba(34,197,94,.7)' : d.y < d.x ? 'rgba(239,68,68,.7)' : 'rgba(6,182,212,.7)') },
            { label: 'Consensus', data: [{x:0,y:0},{x:10,y:10}], type:'line',
              borderColor:'rgba(255,255,255,.12)', borderDash:[6,4], borderWidth:1, pointRadius:0, fill:false },
        ]},
        options: _scatterOpts({ x:{min:0,max:10,title:{display:true,text:'IMDb'}}, y:{min:0,max:10,title:{display:true,text:i18n.t('your_rating')}} },
            ctx => { const d=data[ctx.dataIndex]; return d?`${d.title}: IMDb ${d.x} -> You ${d.y}`:''; }),
    }));
}

// 2. Runtime vs Rating (existing, refactored)
function _buildRuntimeChart(Chart, movies) {
    const ctx = document.getElementById('chartRuntime'); if (!ctx) return;
    const data = movies.map(m => ({ x: m.runtime, y: Number(m.rating), title: m.title }));
    const { slope, intercept } = _linReg(data);
    const xs = [Math.min(...data.map(d=>d.x)), Math.max(...data.map(d=>d.x))];
    _charts.set('runtime', new Chart(ctx, {
        type: 'scatter',
        data: { datasets: [
            { label:'Film', data, backgroundColor:'rgba(6,182,212,.55)', pointRadius:5, pointHoverRadius:8 },
            { label:'Trend', data: xs.map(x=>({x, y:_clamp(slope*x+intercept,0,10)})),
              type:'line', borderColor:'#22d3ee', borderWidth:2, pointRadius:0, fill:false },
        ]},
        options: _scatterOpts({ x:{title:{display:true,text:'Runtime (min)'}}, y:{min:0,max:10,title:{display:true,text:i18n.t('your_rating')}} },
            ctx => { const d=data[ctx.dataIndex]; return d?`${d.title}: ${d.x}min -> ${d.y}/10`:''; }),
    }));
}

// 3. Rating by Release Year
function _buildYearChart(Chart, movies) {
    const ctx = document.getElementById('chartYear'); if (!ctx) return;
    const data = movies.map(m => ({ x: Number(m.year), y: Number(m.rating), title: m.title }));
    _charts.set('year', new Chart(ctx, {
        type: 'scatter',
        data: { datasets: [{
            label: 'Film', data,
            backgroundColor: 'rgba(139,92,246,.6)',
            pointRadius: 5, pointHoverRadius: 8,
        }]},
        options: _scatterOpts(
            { x:{title:{display:true,text:'Year'}}, y:{min:0,max:10,title:{display:true,text:i18n.t('your_rating')}} },
            ctx => { const d=data[ctx.dataIndex]; return d?`${d.title} (${d.x}): ${d.y}/10`:''; },
        ),
    }));
}

// 4. Genre Radar
function _buildGenreRadar(Chart, movies) {
    const ctx = document.getElementById('chartGenre'); if (!ctx) return;

    // Collect genre → ratings
    const genreMap = {};
    movies.forEach(m => {
        const genres = Array.isArray(m.genres)
            ? m.genres.map(g => typeof g === 'string' ? g : g?.name || '').filter(Boolean)
            : String(m.genres || '').split(',').map(s => s.trim()).filter(Boolean);
        genres.forEach(g => {
            if (!genreMap[g]) genreMap[g] = [];
            genreMap[g].push(Number(m.rating));
        });
    });

    // Top 8 genres by count
    const top = Object.entries(genreMap)
        .sort(([,a],[,b]) => b.length - a.length)
        .slice(0, 8);

    const labels = top.map(([g]) => g);
    const avgs   = top.map(([, rs]) => (rs.reduce((s,r)=>s+r,0)/rs.length).toFixed(2));

    _charts.set('genre', new Chart(ctx, {
        type: 'radar',
        data: {
            labels,
            datasets: [{
                label: i18n.t('your_rating'),
                data: avgs,
                backgroundColor: 'rgba(6,182,212,.15)',
                borderColor: '#06b6d4',
                pointBackgroundColor: '#22d3ee',
                pointRadius: 4,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                r: {
                    min: 0, max: 10,
                    ticks: { stepSize: 2, color: '#7e8a9a', backdropColor: 'transparent' },
                    grid: { color: 'rgba(255,255,255,.06)' },
                    pointLabels: { color: '#edf0f5', font: { size: 11 } },
                    angleLines: { color: 'rgba(255,255,255,.06)' },
                },
            },
        },
    }));
}

// 5. Watch Activity Heatmap (canvas-rendered, no extra lib)
function _buildHeatmap(container, movies) {
    if (!container) return;

    const now  = new Date();
    const year = now.getFullYear();

    // Count films per day
    const counts = {};
    movies.forEach(m => {
        const d = m.watchedDate || '';
        if (d.startsWith(String(year))) counts[d] = (counts[d] || 0) + 1;
    });
    const max = Math.max(1, ...Object.values(counts));

    // Build 52-week grid
    const startOfYear = new Date(year, 0, 1);
    const startDay    = startOfYear.getDay(); // 0=Sun
    const totalDays   = Math.ceil((Date.now() - startOfYear) / 86400000);

    const weeks = [];
    let week = Array(startDay).fill(null);
    for (let d = 0; d <= totalDays; d++) {
        const date = new Date(year, 0, d + 1);
        const key  = date.toISOString().slice(0, 10);
        week.push({ key, count: counts[key] || 0 });
        if (week.length === 7) { weeks.push(week); week = []; }
    }
    if (week.length) {
        while (week.length < 7) week.push(null);
        weeks.push(week);
    }

    const CELL = 12, GAP = 3;
    const W = weeks.length * (CELL + GAP);
    const H = 7 * (CELL + GAP) + 24; // +24 for month labels

    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    canvas.style.cssText = 'width:100%;height:auto;display:block';
    container.appendChild(canvas);

    const cx = canvas.getContext('2d');

    // Month labels
    let lastMonth = -1;
    weeks.forEach((_, wi) => {
        const date = new Date(year, 0, wi * 7 + 1 - startDay);
        if (date.getMonth() !== lastMonth) {
            lastMonth = date.getMonth();
            cx.fillStyle = '#7e8a9a';
            cx.font = `10px 'DM Mono', monospace`;
            cx.fillText(date.toLocaleString('default', { month: 'short' }), wi * (CELL + GAP), 10);
        }
    });

    // Cells
    weeks.forEach((wk, wi) => {
        wk.forEach((cell, di) => {
            if (!cell) return;
            const x = wi * (CELL + GAP);
            const y = 16 + di * (CELL + GAP);
            const intensity = cell.count / max;
            const alpha = cell.count === 0 ? 0.08 : 0.2 + intensity * 0.8;
            cx.fillStyle = cell.count === 0
                ? `rgba(6,182,212,${alpha})`
                : `rgba(6,182,212,${alpha})`;
            _roundRect(cx, x, y, CELL, CELL, 2);
            cx.fill();
        });
    });
}

// 6. Elo Evolution Timeline
function _buildEloTimeline(Chart, rated, matches) {
    const ctx = document.getElementById('chartElo'); if (!ctx) return;

    // Top 5 by current Elo
    const top5 = [...rated].sort((a, b) => seedElo(b) - seedElo(a)).slice(0, 5);
    const colorPalette = ['#06b6d4','#22c55e','#a855f7','#f59e0b','#ef4444'];

    // Build trajectory per movie
    const datasets = top5.map((movie, i) => {
        const relevant = matches.filter(m => m.movieAId === movie.id || m.movieBId === movie.id)
            .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        const points = relevant.map((m, idx) => ({
            x: idx + 1,
            y: m.movieAId === movie.id ? m.newEloA : m.newEloB,
        }));
        if (!points.length) return null;
        return {
            label:       movie.title,
            data:        points,
            borderColor: colorPalette[i],
            backgroundColor: colorPalette[i] + '22',
            tension: 0.4, fill: false,
            pointRadius: 3, borderWidth: 2,
        };
    }).filter(Boolean);

    _charts.set('elo', new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#7e8a9a', font: { size: 11 } } } },
            scales: {
                x: { title:{ display:true, text:'Battle #', color:'#7e8a9a' },
                     grid:{ color:'rgba(255,255,255,.05)' }, ticks:{ color:'#7e8a9a' } },
                y: { title:{ display:true, text:'Elo', color:'#7e8a9a' },
                     grid:{ color:'rgba(255,255,255,.05)' }, ticks:{ color:'#7e8a9a' } },
            },
        },
    }));
}

// ── Rankings ───────────────────────────────────────────────────────────────

function _renderRankings(body, rated, matches) {
    const ranking = [...rated].sort((a, b) => seedElo(b) - seedElo(a)).slice(0, 30);
    const upsets  = matches.filter(m => m.isUpset)
        .sort((a, b) => Math.abs((b.movieAElo||0)-(b.movieBElo||0)) - Math.abs((a.movieAElo||0)-(a.movieBElo||0)))
        .slice(0, 5);

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
      </div>
      <div class="vault-section">
        <h3 class="vault-section-title">Elo Volatility <span class="vault-hint">Biggest upsets</span></h3>
        ${upsets.length ? `<div class="vault-upsets">${upsets.map(_upsetCard).join('')}</div>`
            : `<div class="vault-empty">${i18n.t('vault_no_upsets')}</div>`}
      </div>`;
}

// ── Directors ──────────────────────────────────────────────────────────────

function _renderDirectors(body, rated) {
    const dirMap = {};
    rated.forEach(m => {
        const d = m.director; if (!d) return;
        if (!dirMap[d]) dirMap[d] = { films: 0, total: 0, titles: [] };
        dirMap[d].films++;
        dirMap[d].total += Number(m.rating);
        dirMap[d].titles.push(m.title);
    });

    const dirs = Object.entries(dirMap)
        .map(([name, v]) => ({ name, films: v.films, avg: v.total / v.films, titles: v.titles }))
        .filter(d => d.films >= 2)
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 15);

    body.innerHTML = `
      <div class="vault-section">
        <h3 class="vault-section-title">Top Directors <span class="vault-hint">min. 2 films</span></h3>
        ${dirs.length ? `<div class="vault-ranking">
          ${dirs.map((d, i) => `
            <div class="vault-rank-row">
              <span class="vault-rank-pos mono">${i+1}</span>
              <span class="vault-rank-title serif">${esc(d.name)}</span>
              <span class="vault-rank-tier" style="font-size:.75rem;color:var(--ink-mute)">${d.films} films</span>
              <span class="vault-rank-elo mono accent">★ ${d.avg.toFixed(1)}</span>
            </div>`).join('')}
        </div>` : `<div class="vault-empty">${i18n.t('vault_add_directors')}</div>`}
      </div>`;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function _scatterOpts(scales, tooltipLabel) {
    const base = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: tooltipLabel } } },
        scales: {},
    };
    for (const [axis, cfg] of Object.entries(scales)) {
        base.scales[axis] = {
            ...cfg,
            grid: { color: 'rgba(255,255,255,.05)' },
            ticks: { color: '#7e8a9a' },
            title: { ...cfg.title, color: '#7e8a9a', font: { family:"'Hanken Grotesk',sans-serif", size: 12 } },
        };
    }
    return base;
}

function _linReg(pts) {
    const n = pts.length; if (n < 2) return { slope: 0, intercept: 0 };
    let sx=0, sy=0, sxy=0, sx2=0;
    for (const {x,y} of pts) { sx+=x; sy+=y; sxy+=x*y; sx2+=x*x; }
    const d = n*sx2 - sx*sx;
    if (d === 0) return { slope: 0, intercept: sy/n };
    return { slope: (n*sxy-sx*sy)/d, intercept: (sy - ((n*sxy-sx*sy)/d)*sx)/n };
}

function _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function _roundRect(cx, x, y, w, h, r) {
    cx.beginPath();
    cx.moveTo(x+r, y);
    cx.lineTo(x+w-r, y); cx.arcTo(x+w,y,x+w,y+r,r);
    cx.lineTo(x+w, y+h-r); cx.arcTo(x+w,y+h,x+w-r,y+h,r);
    cx.lineTo(x+r, y+h); cx.arcTo(x,y+h,x,y+h-r,r);
    cx.lineTo(x, y+r); cx.arcTo(x,y,x+r,y,r);
    cx.closePath();
}

function _emptyChart(msg) { return `<div class="vault-chart-empty">${msg}</div>`; }

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
