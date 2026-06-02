/**
 * HOME — dashboard cinematografica immersiva.
 * Part 1: migrated to reactive store subscription.
 * Guard against stale renders: each store update aborts the previous render.
 */
import { init, subscribe } from '../core/store.js';
import { discoverMovies, posterUrl, backdropUrl, movieDetails, posterImg } from '../services/tmdb.js';
import { openDetail } from '../components/detail.js';
import * as router from '../core/router.js';
import i18n from '../core/i18n.js';

export const home = {
    id: 'home', label: 'Home', icon: '🏠', hidden: true,
    _unsub:    null,
    _renderVer: 0, // monotonic counter to abort stale renders

    async mount(el) {
        el.innerHTML = `
          <div style="padding:40px;text-align:center">
            <div class="sk" style="width:48px;height:48px;border-radius:50%;margin:0 auto"></div>
          </div>`;

        await init();

        this._unsub = subscribe('home', ({ movies }) => {
            this._renderVer++;
            const ver = this._renderVer;
            _renderHome(el, movies || [], ver, () => this._renderVer !== ver).catch(() => {});
        });
    },

    unmount() {
        this._renderVer++; // invalidate any in-flight render
        if (this._unsub) { this._unsub(); this._unsub = null; }
    },
};

async function _renderHome(el, movies, ver, isStale) {
    const watched = movies
        .filter(m => !m.isWatchlist && m.rating != null)
        .sort((a, b) => (b.updatedAt?.seconds || b.order || 0) - (a.updatedAt?.seconds || a.order || 0));
    const wl = movies
        .filter(m => m.isWatchlist)
        .sort((a, b) => (b.createdAt?.seconds || b.order || 0) - (a.createdAt?.seconds || a.order || 0));
    const favorites = movies.filter(m => m.isFavorite);

    const heroFilm = watched.length
        ? [...watched].sort((a, b) => (b.rating || 0) - (a.rating || 0))[0]
        : null;

    // Fetch backdrop (async — check staleness)
    let heroBg = '';
    if (heroFilm) {
        if (heroFilm.backdropPath) {
            heroBg = backdropUrl(heroFilm.backdropPath);
        } else if (heroFilm.tmdbId) {
            try {
                const t = await movieDetails(heroFilm.tmdbId);
                if (isStale()) return;
                heroBg = backdropUrl(t.backdrop_path);
            } catch {}
        }
    }

    if (isStale()) return;

    // Trending
    let trending = [];
    try { trending = ((await discoverMovies({}, 1)).results || []).slice(0, 12); } catch {}
    if (isStale()) return;

    const avgRating = watched.length
        ? (watched.reduce((s, m) => s + Number(m.rating || 0), 0) / watched.length).toFixed(1)
        : '—';

    el.innerHTML = `
      ${heroFilm ? _heroSection(heroFilm, heroBg) : _welcomeSection()}
      <div class="stats-bar" style="margin-top:-20px;position:relative;z-index:1">
        ${_stat(i18n.t('stat_seen'),      watched.length)}
        ${_stat(i18n.t('stat_watchlist'), wl.length)}
        ${_stat(i18n.t('stat_avg'),       avgRating)}
        ${_stat(i18n.t('stat_favorites'), favorites.length)}
      </div>
      ${watched.length ? _sectionHTML(i18n.t('recent_seen'),       watched.slice(0, 12),  'archive')   : ''}
      ${wl.length      ? _sectionHTML(i18n.t('in_your_watchlist'), wl.slice(0, 12),       'watchlist') : ''}
      ${trending.length ? _trendingSection(trending) : ''}
    `;

    // Inject optimized poster images
    el.querySelectorAll('.carousel-card').forEach(card => {
        const path = card.dataset.posterPath;
        if (!path) return;
        const wrap = card.querySelector('.poster');
        if (!wrap) return;
        wrap.innerHTML = '';
        wrap.appendChild(posterImg(path, { context: 'thumb', alt: '' }));
    });

    // Card events
    el.querySelectorAll('.carousel-card[data-id]').forEach(card => {
        card.addEventListener('click', () => {
            const m = movies.find(x => x.id === card.dataset.id);
            if (m) openDetail(m, { mode: m.isWatchlist ? 'watchlist' : 'archive' });
        });
    });
    el.querySelectorAll('.carousel-card[data-tmdb]').forEach(card => {
        card.addEventListener('click', () => {
            const t = trending.find(x => String(x.id) === card.dataset.tmdb);
            if (t) openDetail({
                tmdbId: t.id, title: t.title,
                year: (t.release_date || '').slice(0, 4),
                poster: posterUrl(t.poster_path), plot: t.overview,
            }, { mode: 'explore' });
        });
    });

    el.querySelector('[data-action="hero-detail"]')?.addEventListener('click', () => {
        if (heroFilm) openDetail(heroFilm, { mode: 'archive' });
    });
    el.querySelector('[data-action="go-explore"]')?.addEventListener('click', () => router.navigate('explore'));
    el.querySelectorAll('[data-nav]').forEach(link => {
        link.addEventListener('click', () => router.navigate(link.dataset.nav));
    });
}

// ── Templates ──────────────────────────────────────────────────────────────

function _heroSection(m, bg) {
    const genres = (Array.isArray(m.genres)
        ? m.genres.map(g => (typeof g === 'string' ? g : g?.name || '')).filter(Boolean)
        : String(m.genres || '').split(',').map(s => s.trim()).filter(Boolean)
    ).slice(0, 3).join(', ');
    const meta = [m.year, genres].filter(Boolean).join('<span class="sep"> · </span>');
    return `
      <section class="hero" style="${bg ? `background-image:url(${bg})` : ''}">
        <div class="hero-content">
          <div class="hero-label">${i18n.t('hero_label')}</div>
          <h1 class="hero-title">${esc(m.title)}</h1>
          <div class="hero-meta">${meta}${m.rating ? ` <span class="sep">·</span> ★ ${Number(m.rating).toFixed(1)}` : ''}</div>
          <div class="hero-actions">
            <button class="btn btn-accent" data-action="hero-detail">${i18n.t('details')}</button>
          </div>
        </div>
      </section>`;
}

function _welcomeSection() {
    return `
      <div class="hero-welcome">
        <div class="kino-logo"><em>Kino</em></div>
        <p>${i18n.t('welcome_text')}</p>
        <button class="btn btn-accent" data-action="go-explore">${i18n.t('start_explore')}</button>
      </div>`;
}

function _sectionHTML(title, items, navTarget) {
    return `
      <div class="section-block">
        <div class="section-header">
          <h2 class="section-title">${title}</h2>
          <span class="section-link" data-nav="${navTarget}">${i18n.t('see_all')}</span>
        </div>
        <div class="carousel">
          ${items.map(m => `
            <div class="carousel-card" data-id="${esc(m.id || '')}"
                 data-poster-path="${esc(m.posterPath || '')}">
              <div class="poster"><img loading="lazy" decoding="async" alt="" src="${esc(m.poster || '')}"></div>
              <div class="card-title">${esc(m.title || '')}</div>
              <div class="card-sub">${m.rating != null ? `★ ${Number(m.rating).toFixed(1)}` : ''}</div>
            </div>`).join('')}
        </div>
      </div>`;
}

function _trendingSection(items) {
    return `
      <div class="section-block">
        <div class="section-header">
          <h2 class="section-title">${i18n.t('popular_now')}</h2>
          <span class="section-link" data-nav="explore">${i18n.t('start_explore')}</span>
        </div>
        <div class="carousel">
          ${items.map(t => `
            <div class="carousel-card" data-tmdb="${t.id}"
                 data-poster-path="${esc(t.poster_path || '')}">
              <div class="poster"><img loading="lazy" decoding="async" alt="" src="${posterUrl(t.poster_path)}"></div>
              <div class="card-title">${esc(t.title || '')}</div>
              <div class="card-sub">${(t.release_date || '').slice(0, 4)}</div>
            </div>`).join('')}
        </div>
      </div>`;
}

function _stat(label, val) {
    return `<div class="stat-item"><div class="stat-value">${val}</div><div class="stat-label">${label}</div></div>`;
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
