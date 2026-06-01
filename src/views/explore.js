/** EXPLORE — scoperta film TMDB con filtri avanzati + infinite scroll. */
import { searchMovies, discoverMovies, posterUrl } from '../services/tmdb.js';
import { imdbRating } from '../services/omdb.js';
import { createFilterBar, toDiscoverParams } from '../components/filters.js';
import { openDetail } from '../components/detail.js';

export const explore = {
  id: 'explore', label: 'Explore', icon: '🔍',
  _fb: null, _observer: null,
  async mount(el) {
    el.innerHTML = `
      <div id="expFilters"></div>
      <div class="grid" id="expGrid"></div>
      <div id="expSentinel" class="scroll-sentinel"></div>`;

    const grid = el.querySelector('#expGrid');
    const sentinel = el.querySelector('#expSentinel');
    let currentPage = 0, totalPages = 1, loading = false;
    let mode = 'discover';

    const reset = () => { currentPage = 0; totalPages = 1; grid.innerHTML = ''; };

    this._fb = await createFilterBar(el.querySelector('#expFilters'), {
      filters: ['genre', 'year', 'rating', 'runtime', 'language', 'country'],
      sorts: ['popularity', 'rating', 'year', 'title_asc', 'title_desc'],
      defaultSort: 'popularity',
      searchPlaceholder: 'Cerca un film…',
      onSearch: () => { reset(); mode = 'search'; loadNext(); },
      onChange: () => {
        if (el.querySelector('.filter-search')?.value.trim()) return;
        reset(); mode = 'discover'; loadNext();
      }
    });
    const fb = this._fb;

    const loadNext = async () => {
      if (loading || currentPage >= totalPages) return;
      loading = true;
      const isFirst = currentPage === 0;
      if (isFirst) skeleton(grid, 10);
      else sentinel.innerHTML = '<div class="scroll-loading"><div class="sk" style="width:32px;height:32px;border-radius:50%;margin:0 auto"></div></div>';

      try {
        let data;
        if (mode === 'search') {
          const q = el.querySelector('.filter-search')?.value.trim();
          if (!q) { loading = false; sentinel.innerHTML = ''; return; }
          data = await searchMovies(q, currentPage + 1);
        } else {
          data = await discoverMovies(toDiscoverParams(fb.getState()), currentPage + 1);
        }
        currentPage = data.page || currentPage + 1;
        totalPages = Math.min(data.total_pages || 1, 50);
        const results = normalize(data.results || []);
        if (isFirst) grid.innerHTML = '';
        sentinel.innerHTML = '';
        if (!results.length && isFirst) {
          grid.innerHTML = '<div class="empty"><div class="big">Nessun risultato</div></div>';
        } else {
          appendCards(grid, results);
        }
      } catch (e) {
        if (isFirst) grid.innerHTML = err(e.message);
        sentinel.innerHTML = '';
      }
      loading = false;
    };

    this._observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadNext();
    }, { rootMargin: '400px' });
    this._observer.observe(sentinel);

    mode = 'discover';
    loadNext();
  },
  unmount() {
    if (this._fb) { this._fb.destroy(); this._fb = null; }
    if (this._observer) { this._observer.disconnect(); this._observer = null; }
  }
};

function normalize(results) {
  return results.map(r => ({
    ...r, tmdbId: r.id, genreIds: r.genre_ids || [],
    originalLanguage: r.original_language,
    year: (r.release_date || '').slice(0, 4),
    releaseDate: r.release_date,
    poster: posterUrl(r.poster_path), plot: r.overview,
  }));
}

function appendCards(grid, results) {
  results.forEach(r => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="poster">
        <span class="imdb-pill">IMDb …</span>
        <img loading="lazy" alt="" src="${r.poster}">
      </div>
      <div class="meta">
        <span class="title">${esc(r.title)}</span>
        <span class="dir">${r.year}</span>
      </div>`;
    card.addEventListener('click', () => {
      openDetail({ tmdbId: r.tmdbId, title: r.title, year: r.year, poster: r.poster, plot: r.plot },
        { mode: 'explore' });
    });
    grid.appendChild(card);
    imdbRating({ title: r.title, year: r.year }).then(({ rating }) => {
      const pill = card.querySelector('.imdb-pill');
      if (rating) {
        pill.textContent = `IMDb ${rating}`;
        const n = parseFloat(rating);
        pill.classList.toggle('imdb-high', n >= 7);
        pill.classList.toggle('imdb-low', n < 5);
      } else {
        pill.textContent = 'IMDb N/A';
        pill.classList.add('imdb-na');
      }
    });
  });
}

function skeleton(g, n) { g.innerHTML = ''; for (let i = 0; i < n; i++) { const d = document.createElement('div'); d.className = 'card'; d.innerHTML = '<div class="poster sk"></div>'; g.appendChild(d); } }
function err(msg) { return `<div class="empty"><div class="big">Errore TMDB</div>${esc(msg)}</div>`; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
