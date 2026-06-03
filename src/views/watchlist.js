/**
 * WATCHLIST — film da vedere, con filtri avanzati + Smart Watchlist modes.
 *
 * Part 1: reactive store subscription.
 * Part 10: Smart Watchlist quick-filter modes:
 *   - Time Crunch: runtime < 90 min
 *   - Weekend Mode: runtime > 120 min, high-rated
 *   - Hidden Gems: IMDb < 7.0 but in watchlist
 *   - Mood Matcher: quick-filter pills by genre mood
 */
import { init, subscribe } from '../core/store.js';
import i18n from '../core/i18n.js';
import { movieCard } from '../components/card.js';
import { createFilterBar, filterMovies, searchMovies, sortMovies } from '../components/filters.js';
import { openDetail } from '../components/detail.js';

// Smart-mode definitions (labels and descriptions are translated via i18n)
const SMART_MODES = [
    {
        id: 'all',
        labelKey: 'smart_all',
        icon: '📋',
        filter: () => true,
    },
    {
        id: 'crunch',
        labelKey: 'smart_crunch',
        icon: '',
        descKey: 'smart_crunch_desc',
        filter: m => (m.runtime || 999) < 90,
    },
    {
        id: 'weekend',
        labelKey: 'smart_weekend',
        icon: '',
        descKey: 'smart_weekend_desc',
        filter: m => (m.runtime || 0) >= 120 && (parseFloat(m.imdbRating) || 0) >= 7,
    },
    {
        id: 'gems',
        labelKey: 'smart_gems',
        icon: '',
        descKey: 'smart_gems_desc',
        filter: m => (parseFloat(m.imdbRating) || 0) > 0 && parseFloat(m.imdbRating) < 7,
    },
    {
        id: 'classics',
        labelKey: 'smart_classics',
        icon: '',
        descKey: 'smart_classics_desc',
        filter: m => (Number(m.year) || 9999) < 2000,
    },
];

export const watchlist = {
    id: 'watchlist', label: 'Watchlist', icon: '📋',
    _fb:       null,
    _unsub:    null,
    _smartMode: 'all',

    async mount(el) {
        el.innerHTML = `
          <div id="wlFilters"></div>
          <div class="smart-modes" id="smartModes"></div>
          <div class="grid" id="wlGrid"></div>`;

        const grid      = el.querySelector('#wlGrid');
        const modeBar   = el.querySelector('#smartModes');
        _skeleton(grid, 10);

        // Render smart-mode pills
        _buildSmartBar(modeBar, id => {
            this._smartMode = id;
            apply();
        });

        await init();

        let allMovies = [];
        let _filters  = {};
        let _sort     = 'added';
        let _q        = '';

        const apply = () => {
            const smartFn = SMART_MODES.find(m => m.id === this._smartMode)?.filter || (() => true);
            let list = searchMovies(allMovies, _q);
            list = list.filter(smartFn);
            list = filterMovies(list, _filters);
            list = sortMovies(list, _sort);
            _render(grid, list, allMovies);
            // update mode pill counts
            _updateCounts(modeBar, allMovies);
        };

        this._fb = await createFilterBar(el.querySelector('#wlFilters'), {
            filters: ['genre','year','rating','runtime','language','country','director','cast','favorite','addedDate'],
            sorts:   ['added','year','title_asc','title_desc','rating'],
            defaultSort: 'added',
            searchPlaceholder: i18n.t('search_watchlist'),
            onSearch: () => { _q = el.querySelector('.filter-search')?.value.toLowerCase().trim() || ''; apply(); },
            onChange: (state, sort) => { _filters = state; _sort = sort; apply(); },
        });
        const s0 = this._fb.getState();
        _filters = s0; _sort = s0.sort;

        this._unsub = subscribe('watchlist', ({ movies }) => {
            allMovies = (movies || []).filter(m => m.isWatchlist);
            apply();
        });
    },

    unmount() {
        if (this._fb)    { this._fb.destroy();  this._fb    = null; }
        if (this._unsub) { this._unsub();        this._unsub = null; }
        this._smartMode = 'all';
    },
};

function _buildSmartBar(container, onChange) {
    container.innerHTML = '';
    SMART_MODES.forEach(mode => {
        const btn = document.createElement('button');
        btn.className     = `smart-pill${mode.id === 'all' ? ' active' : ''}`;
        btn.dataset.mode  = mode.id;
        const label = i18n.t(mode.labelKey);
        const desc = mode.descKey ? i18n.t(mode.descKey) : '';
        btn.innerHTML     = `${label}${desc ? `<small>${desc}</small>` : ''}`;
        btn.addEventListener('click', () => {
            container.querySelectorAll('.smart-pill').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            onChange(mode.id);
        });
        container.appendChild(btn);
    });
}

function _updateCounts(modeBar, movies) {
    SMART_MODES.forEach(mode => {
        const btn   = modeBar.querySelector(`[data-mode="${mode.id}"]`);
        if (!btn) return;
        const count = movies.filter(mode.filter).length;
        const badge = btn.querySelector('.smart-count');
        if (badge) badge.textContent = count;
        else if (mode.id !== 'all') btn.insertAdjacentHTML('beforeend', `<span class="smart-count">${count}</span>`);
    });
}

function _render(grid, list, allMovies) {
    grid.innerHTML = '';
    if (!list.length) {
        grid.innerHTML = `<div class="empty"><div class="big">${i18n.t('watchlist_empty')}</div>${i18n.t('save_from_explore')}</div>`;
        return;
    }
    list.forEach(m => grid.appendChild(movieCard(m, {
        onClick: movie => openDetail(movie, {
            mode: 'watchlist',
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
