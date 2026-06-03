/**
 * ARCHIVE — film visti e valutati, con filtri avanzati.
 * Part 1: migrated from getMovies() to reactive store subscription.
 * Re-renders grid on every Firestore snapshot (cross-tab sync, real-time).
 */
import { init, subscribe } from '../core/store.js';
import i18n from '../core/i18n.js';
import { posterImg } from '../services/tmdb.js';
import { movieCard } from '../components/card.js';
import { createFilterBar, filterMovies, searchMovies, sortMovies } from '../components/filters.js';
import { openDetail } from '../components/detail.js';

export const archive = {
    id: 'archive', label: 'Archive', icon: '🎬',
    _fb:    null,
    _unsub: null,

    async mount(el) {
        el.innerHTML = `
          <div id="archFilters"></div>
          <div class="grid" id="archGrid"></div>`;

        const grid = el.querySelector('#archGrid');
        _skeleton(grid, 10);

        // Guarantee the Firestore listener is open (idempotent)
        await init();

        let allMovies = [];
        let _filters  = {};
        let _sort     = 'rating';
        let _q        = '';

        const apply = () => {
            let list = searchMovies(allMovies, _q);
            list = filterMovies(list, _filters);
            list = sortMovies(list, _sort);
            _render(grid, list, allMovies);
        };

        this._fb = await createFilterBar(el.querySelector('#archFilters'), {
            filters: ['genre','year','rating','runtime','language','country','director','cast','favorite','addedDate'],
            sorts:   ['rating','year','title_asc','title_desc','added'],
            defaultSort: 'rating',
            searchPlaceholder: i18n.t('search_archive'),
            onSearch: () => { _q = el.querySelector('.filter-search')?.value.toLowerCase().trim() || ''; apply(); },
            onChange: (state, sort) => { _filters = state; _sort = sort; apply(); },
        });
        const s0 = this._fb.getState();
        _filters = s0; _sort = s0.sort;

        // Reactive: re-render whenever Firestore data changes
        this._unsub = subscribe('archive', ({ movies }) => {
            allMovies = (movies || []).filter(m => !m.isWatchlist && m.rating != null);
            apply();
        });
    },

    unmount() {
        if (this._fb)    { this._fb.destroy();  this._fb    = null; }
        if (this._unsub) { this._unsub();        this._unsub = null; }
    },
};

function _render(grid, list, allMovies) {
    grid.innerHTML = '';
    if (!list.length) {
        grid.innerHTML = `<div class="empty"><div class="big">${i18n.t('archive_empty')}</div>${i18n.t('add_from_explore')}</div>`;
        return;
    }
    list.forEach(m => grid.appendChild(movieCard(m, {
        onClick: movie => openDetail(movie, {
            mode: 'archive',
            onUpdate: updated => {
                const i = allMovies.findIndex(x => x.id === updated.id);
                if (i >= 0) Object.assign(allMovies[i], updated);
            },
        }),
    })));
}

function _skeleton(g, n) {
    g.innerHTML = '';
    for (let i = 0; i < n; i++) {
        const d = document.createElement('div');
        d.className = 'card';
        d.innerHTML = '<div class="poster sk"></div>';
        g.appendChild(d);
    }
}
