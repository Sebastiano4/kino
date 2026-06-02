/** ARCHIVE — film visti e valutati, con filtri avanzati. */
import { getMovies } from '../data/repo.js';
import i18n from '../core/i18n.js';
import { movieCard } from '../components/card.js';
import { createFilterBar, filterMovies, sortMovies } from '../components/filters.js';
import { openDetail } from '../components/detail.js';

export const archive = {
  id: 'archive', label: 'Archive', icon: '🎬',
  _fb: null,
  async mount(el) {
    el.innerHTML = `
      <div id="archFilters"></div>
      <div class="grid" id="archGrid"></div>`;

    const grid = el.querySelector('#archGrid');
    skeleton(grid, 10);

    let movies = [];
    try {
      movies = (await getMovies()).filter(m => !m.isWatchlist && m.rating != null);
    } catch (e) { grid.innerHTML = `<div class="empty"><div class="big">${i18n.t('error')}</div>${e.message}</div>`; return; }

    this._fb = await createFilterBar(el.querySelector('#archFilters'), {
      filters: ['genre', 'year', 'rating', 'runtime', 'language', 'country', 'director', 'cast', 'favorite', 'addedDate'],
      sorts: ['rating', 'year', 'title_asc', 'title_desc', 'added'],
      defaultSort: 'rating',
      searchPlaceholder: 'Cerca nel tuo archivio…',
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
  if (!list.length) { grid.innerHTML = `<div class="empty"><div class="big">Archivio vuoto</div>Aggiungi film da Explore.</div>`; return; }
  list.forEach(m => grid.appendChild(movieCard(m, {
    onClick: movie => openDetail(movie, {
      mode: 'archive',
      onUpdate: updated => {
        const i = allMovies.findIndex(x => x.id === updated.id);
        if (i >= 0) Object.assign(allMovies[i], updated);
      }
    })
  })));
}

function skeleton(g, n) { g.innerHTML = ''; for (let i = 0; i < n; i++) { const d = document.createElement('div'); d.className = 'card'; d.innerHTML = '<div class="poster sk"></div>'; g.appendChild(d); } }
