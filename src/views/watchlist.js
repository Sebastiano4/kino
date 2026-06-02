/** WATCHLIST — film da vedere, con filtri avanzati. */
import { getMovies } from '../data/repo.js';
import i18n from '../core/i18n.js';
import { movieCard } from '../components/card.js';
import { createFilterBar, filterMovies, sortMovies } from '../components/filters.js';
import { openDetail } from '../components/detail.js';

export const watchlist = {
  id: 'watchlist', label: 'Watchlist', icon: '📋',
  _fb: null,
  async mount(el) {
    el.innerHTML = `
      <div id="wlFilters"></div>
      <div class="grid" id="wlGrid"></div>`;

    const grid = el.querySelector('#wlGrid');
    skeleton(grid, 10);

    let movies = [];
    try {
      movies = (await getMovies()).filter(m => m.isWatchlist);
    } catch (e) { grid.innerHTML = `<div class="empty"><div class="big">${i18n.t('error')}</div>${e.message}</div>`; return; }

    this._fb = await createFilterBar(el.querySelector('#wlFilters'), {
      filters: ['genre', 'year', 'rating', 'runtime', 'language', 'country', 'director', 'cast', 'favorite', 'addedDate'],
      sorts: ['added', 'year', 'title_asc', 'title_desc', 'rating'],
      defaultSort: 'added',
      searchPlaceholder: 'Cerca nella watchlist…',
      onChange: (state, sort) => apply(state, sort)
    });
    const fb = this._fb;

    const apply = (state, sort) => {
      const q = el.querySelector('.filter-search')?.value.toLowerCase().trim() || '';
      let list = q ? movies.filter(m => (m.title || '').toLowerCase().includes(q)) : movies;
      list = filterMovies(list, state);
      list = sortMovies(list, sort);
      renderGrid(grid, list, movies);
    };

    apply(fb.getState(), fb.getState().sort);
  },
  unmount() { if (this._fb) { this._fb.destroy(); this._fb = null; } }
};

function renderGrid(grid, list, allMovies) {
  grid.innerHTML = '';
  if (!list.length) { grid.innerHTML = `<div class="empty"><div class="big">${i18n.t('watchlist_empty')}</div>${i18n.t('save_from_explore')}</div>`; return; }
  list.forEach(m => grid.appendChild(movieCard(m, {
    onClick: movie => openDetail(movie, {
      mode: 'watchlist',
      onUpdate: updated => {
        const i = allMovies.findIndex(x => x.id === updated.id);
        if (i >= 0) Object.assign(allMovies[i], updated);
      }
    })
  })));
}

function skeleton(g, n) { g.innerHTML = ''; for (let i = 0; i < n; i++) { const d = document.createElement('div'); d.className = 'card'; d.innerHTML = '<div class="poster sk"></div>'; g.appendChild(d); } }
