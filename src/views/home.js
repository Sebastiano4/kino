/** HOME — dashboard cinematografica immersiva. */
import { getMovies } from '../data/repo.js';
import { discoverMovies, posterUrl, backdropUrl, movieDetails } from '../services/tmdb.js';
import { openDetail } from '../components/detail.js';
import * as router from '../core/router.js';

export const home = {
  id: 'home', label: 'Home', icon: '🏠', hidden: true,
  async mount(el) {
    el.innerHTML = '<div style="padding:40px;text-align:center"><div class="sk" style="width:48px;height:48px;border-radius:50%;margin:0 auto"></div></div>';

    let movies = [];
    try { movies = await getMovies(); } catch {}

    const watched = movies.filter(m => !m.isWatchlist && m.rating != null)
      .sort((a, b) => (b.updatedAt?.seconds || b.order || 0) - (a.updatedAt?.seconds || a.order || 0));
    const wl = movies.filter(m => m.isWatchlist)
      .sort((a, b) => (b.createdAt?.seconds || b.order || 0) - (a.createdAt?.seconds || a.order || 0));
    const favorites = movies.filter(m => m.isFavorite);

    // Hero film: highest rated
    const heroFilm = watched.length
      ? [...watched].sort((a, b) => (b.rating || 0) - (a.rating || 0))[0]
      : null;

    let heroBg = '';
    if (heroFilm) {
      if (heroFilm.backdropPath) {
        heroBg = backdropUrl(heroFilm.backdropPath);
      } else if (heroFilm.tmdbId) {
        try { const t = await movieDetails(heroFilm.tmdbId); heroBg = backdropUrl(t.backdrop_path); } catch {}
      }
    }

    // Trending for empty state or "Scopri" section
    let trending = [];
    try {
      const t = await discoverMovies({}, 1);
      trending = (t.results || []).slice(0, 12);
    } catch {}

    const avgRating = watched.length
      ? (watched.reduce((s, m) => s + Number(m.rating || 0), 0) / watched.length).toFixed(1)
      : '—';

    el.innerHTML = `
      ${heroFilm ? heroSection(heroFilm, heroBg) : welcomeSection()}

      <div class="stats-bar" style="margin-top:-20px;position:relative;z-index:1">
        ${stat('Visti', watched.length)}
        ${stat('Watchlist', wl.length)}
        ${stat('Voto medio', avgRating)}
        ${stat('Preferiti', favorites.length)}
      </div>

      ${watched.length ? sectionHTML('Visti di recente', watched.slice(0, 12), 'archive') : ''}
      ${wl.length ? sectionHTML('Nella tua watchlist', wl.slice(0, 12), 'watchlist') : ''}
      ${trending.length ? trendingSection(trending) : ''}
    `;

    // Card clicks
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

    // Hero CTA
    el.querySelector('[data-action="hero-detail"]')?.addEventListener('click', () => {
      if (heroFilm) openDetail(heroFilm, { mode: 'archive' });
    });
    el.querySelector('[data-action="go-explore"]')?.addEventListener('click', () => {
      router.navigate('explore');
    });

    // Section links
    el.querySelectorAll('[data-nav]').forEach(link => {
      link.addEventListener('click', () => router.navigate(link.dataset.nav));
    });
  }
};

function heroSection(m, bg) {
  const genreNames = Array.isArray(m.genres)
    ? m.genres.map(g => (typeof g === 'string' ? g : g?.name || '')).filter(Boolean)
    : typeof m.genres === 'string'
      ? m.genres.split(',').map(g => g.trim()).filter(Boolean)
      : [];
  const genres = genreNames.slice(0, 3).join(', ');
  const meta = [m.year, genres].filter(Boolean).join('<span class="sep"> · </span>');
  return `
    <section class="hero" style="${bg ? `background-image:url(${bg})` : ''}">
      <div class="hero-content">
        <div class="hero-label">Il tuo film preferito</div>
        <h1 class="hero-title">${esc(m.title)}</h1>
        <div class="hero-meta">${meta}${m.rating ? ` <span class="sep">·</span> ★ ${Number(m.rating).toFixed(1)}` : ''}</div>
        <div class="hero-actions">
          <button class="btn btn-accent" data-action="hero-detail">Dettagli</button>
        </div>
      </div>
    </section>`;
}

function welcomeSection() {
  return `
    <div class="hero-welcome">
      <div class="kino-logo"><em>Kino</em></div>
      <p>Il tuo sistema operativo cinematografico. Inizia esplorando e aggiungendo i tuoi film.</p>
      <button class="btn btn-accent" data-action="go-explore">Inizia a esplorare</button>
    </div>`;
}

function sectionHTML(title, items, navTarget) {
  return `
    <div class="section-block">
      <div class="section-header">
        <h2 class="section-title">${title}</h2>
        <span class="section-link" data-nav="${navTarget}">Vedi tutti</span>
      </div>
      <div class="carousel">
        ${items.map(m => `
          <div class="carousel-card" data-id="${esc(m.id || '')}">
            <div class="poster"><img loading="lazy" alt="" src="${esc(m.poster || '')}"></div>
            <div class="card-title">${esc(m.title || '')}</div>
            <div class="card-sub">${m.rating != null ? `★ ${Number(m.rating).toFixed(1)}` : ''}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

function trendingSection(items) {
  return `
    <div class="section-block">
      <div class="section-header">
        <h2 class="section-title">Popolari ora</h2>
        <span class="section-link" data-nav="explore">Scopri</span>
      </div>
      <div class="carousel">
        ${items.map(t => `
          <div class="carousel-card" data-tmdb="${t.id}">
            <div class="poster"><img loading="lazy" alt="" src="${posterUrl(t.poster_path)}"></div>
            <div class="card-title">${esc(t.title || '')}</div>
            <div class="card-sub">${(t.release_date || '').slice(0, 4)}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

function stat(label, val) {
  return `<div class="stat-item"><div class="stat-value">${val}</div><div class="stat-label">${label}</div></div>`;
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
