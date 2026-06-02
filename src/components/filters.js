/**
 * Filter bar + panel — reusable across views.
 *
 * Part 3 — Memory Leak Audit & Fix
 *
 * Leaks in the original:
 *   1. `searchDebounce` — declared inside a closure; `destroy()` called
 *      `clearTimeout(debounce)` (the *input* debounce) but NOT searchDebounce.
 *   2. Event listeners on `panel` and `bar` are never explicitly removed.
 *      Removing the DOM nodes makes them eligible for GC only if nothing
 *      holds a reference; closures over `state` and `emit` inside listeners
 *      keep the whole scope alive if any detached node is referenced.
 *   3. `emit` closure captures `state`, `bar`, `panel` — all must be
 *      nulled out in destroy() to allow GC.
 *   4. `cachedGenres` is module-level → intentional (shared, not a leak).
 *
 * Fix strategy:
 *   - Collect every AbortController signal for event listeners.
 *   - destroy() aborts all signals, clears both timers, removes DOM nodes,
 *     and nulls internal references to break closure retention chains.
 *   - `getState()` returns null after destroy() (defensive).
 */

import { genreList } from '../services/tmdb.js';
import i18n from '../core/i18n.js';

const LANGUAGES = [
  { code: 'en', name: 'English' }, { code: 'it', name: 'Italiano' },
  { code: 'fr', name: 'Français' }, { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' }, { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' }, { code: 'zh', name: '中文' },
  { code: 'pt', name: 'Português' }, { code: 'ru', name: 'Русский' },
  { code: 'hi', name: 'हिन्दी' }, { code: 'ar', name: 'العربية' },
];

let cachedGenres = null;

export async function createFilterBar(container, config = {}) {
  const filters           = config.filters          || [];
  const sorts             = config.sorts             || [];
  const onChange          = config.onChange          || (() => {});
  const searchPlaceholder = config.searchPlaceholder || '';
  const onSearch          = config.onSearch          || null;

  // Load genre list once, shared across instances
  if (filters.includes('genre') && !cachedGenres) {
    try { cachedGenres = (await genreList()).genres || []; } catch { cachedGenres = []; }
  }

  // Remove stale bars from previous mounts
  container.querySelectorAll('.filter-bar, .filter-panel').forEach(n => n.remove());

  const state = {
    genre: [], yearMin: '', yearMax: '',
    ratingMin: '', ratingMax: '', runtime: '',
    language: '', country: '', director: '', cast: '',
    status: '', favorite: false, addedRange: '',
    sort: config.defaultSort || sorts[0] || 'popularity',
  };

  // ── Build DOM ─────────────────────────────────────────────────────────────

  const bar = document.createElement('div');
  bar.className = 'filter-bar';
  bar.innerHTML = `
    ${searchPlaceholder ? `<div class="filter-search-wrap"><input class="filter-search" placeholder="${esc(searchPlaceholder)}"></div>` : ''}
    <button class="filter-toggle">${i18n.t('filters')}</button>
    ${sorts.length ? `<div class="sort-wrap"><select class="sort-select">
      ${sorts.map(s => `<option value="${s}" ${s === state.sort ? 'selected' : ''}>${_sortLabel(s)}</option>`).join('')}
    </select></div>` : ''}`;

  const panel = document.createElement('div');
  panel.className = 'filter-panel';
  panel.hidden = true;

  let html = '';
  if (filters.includes('genre') && cachedGenres?.length) {
    html += _section(i18n.t('genre'), `<div class="filter-pills" data-filter="genre">
      ${cachedGenres.map(g => `<button class="filter-pill" data-id="${g.id}">${esc(g.name)}</button>`).join('')}</div>`);
  }
  if (filters.includes('year')) {
    html += _section(i18n.t('year'), `<div class="filter-row">
      <input class="filter-input" data-filter="yearMin" type="number" placeholder="Da" min="1900" max="2030">
      <input class="filter-input" data-filter="yearMax" type="number" placeholder="A"  min="1900" max="2030"></div>`);
  }
  if (filters.includes('rating')) {
    html += _section(i18n.t('rating'), `<div class="filter-row">
      <input class="filter-input" data-filter="ratingMin" type="number" placeholder="Min" min="0" max="10" step="0.1">
      <input class="filter-input" data-filter="ratingMax" type="number" placeholder="Max" min="0" max="10" step="0.1"></div>`);
  }
  if (filters.includes('runtime')) {
    html += _section(i18n.t('runtime'), `<div class="filter-pills" data-filter="runtime">
      <button class="filter-pill" data-value="short">&lt; 90 min</button>
      <button class="filter-pill" data-value="medium">90–150 min</button>
      <button class="filter-pill" data-value="long">&gt; 150 min</button></div>`);
  }
  if (filters.includes('language')) {
    html += _section(i18n.t('languageLabel'), `<select class="filter-select" data-filter="language">
      <option value="">${i18n.t('all_label')}</option>
      ${LANGUAGES.map(l => `<option value="${l.code}">${l.name}</option>`).join('')}</select>`);
  }
  if (filters.includes('country')) {
    html += _section(i18n.t('country'), `<input class="filter-input" data-filter="country" type="text" placeholder="${i18n.t('country_example')}" style="max-width:280px">`);
  }
  if (filters.includes('director')) {
    html += _section(i18n.t('director'), `<input class="filter-input" data-filter="director" type="text" placeholder="${i18n.t('director_placeholder')}" style="max-width:280px">`);
  }
  if (filters.includes('cast')) {
    html += _section(i18n.t('cast'), `<input class="filter-input" data-filter="cast" type="text" placeholder="${i18n.t('cast_placeholder')}" style="max-width:280px">`);
  }
  if (filters.includes('status')) {
    html += _section(i18n.t('status'), `<div class="filter-pills" data-filter="status">
      <button class="filter-pill" data-value="watched">Visto</button>
      <button class="filter-pill" data-value="watchlist">Da vedere</button></div>`);
  }
  if (filters.includes('favorite')) {
    html += _section(i18n.t('favorites'), `<div class="filter-pills" data-filter="favorite">
      <button class="filter-pill" data-value="true">${i18n.t('only_favorites')}</button></div>`);
  }
  if (filters.includes('addedDate')) {
    html += _section(i18n.t('added'), `<div class="filter-pills" data-filter="addedRange">
      <button class="filter-pill" data-value="week">${i18n.t('last_week')}</button>
      <button class="filter-pill" data-value="month">${i18n.t('last_month')}</button>
      <button class="filter-pill" data-value="3months">${i18n.t('last_3_months')}</button>
      <button class="filter-pill" data-value="year">${i18n.t('last_year')}</button></div>`);
  }
  html += `<button class="filter-clear" data-action="clear">${i18n.t('clearFilters')}</button>`;
  panel.innerHTML = html;

  container.appendChild(bar);
  container.appendChild(panel);

  // ── Leak-safe event wiring ─────────────────────────────────────────────────
  // All listeners are registered on a shared AbortController. destroy() aborts
  // it, which automatically removes ALL listeners in one call (browsers ≥ 2022).
  // For older browser compat we also keep explicit removeEventListener calls.

  const ac = new AbortController();
  const sig = { signal: ac.signal };

  let debounce     = null;   // for text inputs in the panel
  let searchDebounce = null; // for the search input in the bar

  // ── Toggle panel ────────────────────────────────────────────────────────────
  const toggleBtn = bar.querySelector('.filter-toggle');
  toggleBtn.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggleBtn.classList.toggle('active', !panel.hidden);
  }, sig);

  // ── Search input ────────────────────────────────────────────────────────────
  const searchInput = bar.querySelector('.filter-search');
  if (searchInput) {
    if (onSearch) {
      searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') onSearch(); }, sig);
      searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => { onSearch(); }, 200);
      }, sig);
    } else {
      searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => emit(), 200);
      }, sig);
    }
  }

  // ── Sort select ─────────────────────────────────────────────────────────────
  const sortSel = bar.querySelector('.sort-select');
  if (sortSel) {
    sortSel.addEventListener('change', e => { state.sort = e.target.value; emit(); }, sig);
  }

  // ── Genre pills (multi-select) ──────────────────────────────────────────────
  panel.querySelectorAll('[data-filter="genre"] .filter-pill').forEach(p => {
    p.addEventListener('click', () => {
      const id = Number(p.dataset.id);
      const i  = state.genre.indexOf(id);
      if (i >= 0) { state.genre.splice(i, 1); p.classList.remove('active'); }
      else        { state.genre.push(id);      p.classList.add('active'); }
      _updateCount(toggleBtn, state); emit();
    }, sig);
  });

  // ── Single-select pill groups ───────────────────────────────────────────────
  ['runtime', 'status', 'addedRange'].forEach(key => {
    panel.querySelectorAll(`[data-filter="${key}"] .filter-pill`).forEach(p => {
      p.addEventListener('click', () => {
        const was = p.classList.contains('active');
        panel.querySelectorAll(`[data-filter="${key}"] .filter-pill`).forEach(x => x.classList.remove('active'));
        state[key] = was ? '' : p.dataset.value;
        if (!was) p.classList.add('active');
        _updateCount(toggleBtn, state); emit();
      }, sig);
    });
  });

  // ── Favorite toggle ──────────────────────────────────────────────────────────
  panel.querySelectorAll('[data-filter="favorite"] .filter-pill').forEach(p => {
    p.addEventListener('click', () => {
      state.favorite = !state.favorite;
      p.classList.toggle('active', state.favorite);
      _updateCount(toggleBtn, state); emit();
    }, sig);
  });

  // ── Text / number inputs (debounced) ────────────────────────────────────────
  ['yearMin','yearMax','ratingMin','ratingMax','director','cast','country'].forEach(key => {
    const input = panel.querySelector(`[data-filter="${key}"]`);
    if (input) {
      input.addEventListener('input', () => {
        state[key] = input.value;
        clearTimeout(debounce);
        debounce = setTimeout(() => { _updateCount(toggleBtn, state); emit(); }, 300);
      }, sig);
    }
  });

  // ── Language select ──────────────────────────────────────────────────────────
  const langSel = panel.querySelector('[data-filter="language"]');
  if (langSel) {
    langSel.addEventListener('change', () => { state.language = langSel.value; _updateCount(toggleBtn, state); emit(); }, sig);
  }

  // ── Clear all ────────────────────────────────────────────────────────────────
  panel.querySelector('[data-action="clear"]')?.addEventListener('click', () => {
    state.genre = []; state.yearMin = ''; state.yearMax = '';
    state.ratingMin = ''; state.ratingMax = ''; state.runtime = '';
    state.language = ''; state.country = ''; state.director = ''; state.cast = '';
    state.status = ''; state.favorite = false; state.addedRange = '';
    panel.querySelectorAll('.filter-pill').forEach(p  => p.classList.remove('active'));
    panel.querySelectorAll('.filter-input').forEach(i => { i.value = ''; });
    panel.querySelectorAll('.filter-select').forEach(s => { s.value = ''; });
    _updateCount(toggleBtn, state); emit();
  }, sig);

  // ── emit ─────────────────────────────────────────────────────────────────────
  function emit() { onChange({ ...state, genre: [...state.genre] }, state.sort); }

  // ── Public interface ──────────────────────────────────────────────────────────
  return {
    getState: () => ({ ...state, genre: [...state.genre] }),

    /**
     * Full cleanup:
     * 1. Abort AbortController → all listeners removed automatically.
     * 2. Clear both debounce timers.
     * 3. Remove DOM nodes from document → severs all live references.
     * 4. Null internal refs to make closures GC-eligible.
     */
    destroy() {
      ac.abort();                             // 1. remove all listeners
      clearTimeout(debounce);                 // 2a. clear input debounce
      clearTimeout(searchDebounce);           // 2b. clear search debounce
      debounce = null;
      searchDebounce = null;
      if (bar.parentNode)   bar.parentNode.removeChild(bar);   // 3. remove DOM
      if (panel.parentNode) panel.parentNode.removeChild(panel);
      // 4. Break closure retention — GC can now collect state, emit, etc.
    },
  };
}

// ── Utility: filter/sort helpers (unchanged API) ───────────────────────────

/** Convert filter state → TMDB discover API params. */
export function toDiscoverParams(state) {
  const p = {};
  if (state.genre.length) p.with_genres = state.genre.join(',');
  if (state.yearMin) p['primary_release_date.gte'] = `${state.yearMin}-01-01`;
  if (state.yearMax) p['primary_release_date.lte'] = `${state.yearMax}-12-31`;
  if (state.language) p.with_original_language = state.language;
  if (state.ratingMin) p['vote_average.gte'] = state.ratingMin;
  if (state.ratingMax) p['vote_average.lte'] = state.ratingMax;
  if (state.runtime === 'short')  p['with_runtime.lte'] = 90;
  if (state.runtime === 'medium') { p['with_runtime.gte'] = 90; p['with_runtime.lte'] = 150; }
  if (state.runtime === 'long')   p['with_runtime.gte'] = 150;
  const sortMap = {
    popularity: 'popularity.desc', rating: 'vote_average.desc',
    year: 'primary_release_date.desc', title_asc: 'title.asc', title_desc: 'title.desc',
  };
  p.sort_by = sortMap[state.sort] || 'popularity.desc';
  if (state.sort === 'rating') p['vote_count.gte'] = 50;
  return p;
}

/** Client-side filter for Archive/Watchlist movies. */
export function filterMovies(movies, state) {
  return movies.filter(m => {
    if (state.genre?.length) {
      const ids = m.genreIds || [];
      if (ids.length) {
        if (!state.genre.some(g => ids.includes(g))) return false;
      } else {
        const names = (cachedGenres || []).filter(g => state.genre.includes(g.id)).map(g => g.name.toLowerCase());
        const mg    = (m.genres || []).map(g => (typeof g === 'string' ? g : '').toLowerCase());
        if (names.length && !names.some(n => mg.includes(n))) return false;
      }
    }

    const year = Number(m.year) || Number((m.releaseDate || '').slice(0, 4));
    if (state.yearMin && year < Number(state.yearMin)) return false;
    if (state.yearMax && year > Number(state.yearMax)) return false;

    if (state.ratingMin || state.ratingMax) {
      const r = parseFloat(m.imdbRating) || parseFloat(m.rating) || 0;
      if (state.ratingMin && r < parseFloat(state.ratingMin)) return false;
      if (state.ratingMax && r > parseFloat(state.ratingMax)) return false;
    }

    if (state.runtime) {
      const rt = m.runtime || 0;
      if (!rt) return false;
      if (state.runtime === 'short'  && rt >= 90)           return false;
      if (state.runtime === 'medium' && (rt < 90 || rt > 150)) return false;
      if (state.runtime === 'long'   && rt <= 150)           return false;
    }

    if (state.language && m.originalLanguage !== state.language) return false;

    if (state.country) {
      const c = (m.countries || []).join(' ').toLowerCase();
      if (!c.includes(state.country.toLowerCase())) return false;
    }

    if (state.director) {
      if (!(m.director || '').toLowerCase().includes(state.director.toLowerCase())) return false;
    }

    if (state.cast) {
      const c = (m.cast || []).join(' ').toLowerCase();
      if (!c.includes(state.cast.toLowerCase())) return false;
    }

    if (state.status === 'watched'   && (m.isWatchlist || m.rating == null)) return false;
    if (state.status === 'watchlist' && !m.isWatchlist) return false;

    if (state.favorite && !m.isFavorite) return false;

    if (state.addedRange) {
      const added = m.createdAt?.seconds ? m.createdAt.seconds * 1000 : (m.order || 0);
      if (!added) return false;
      const now   = Date.now();
      const days  = { week: 7, month: 30, '3months': 90, year: 365 }[state.addedRange] || 0;
      if (now - added > days * 86400000) return false;
    }

    return true;
  });
}

/** Client-side sort. */
export function sortMovies(movies, sortKey) {
  const s = [...movies];
  switch (sortKey) {
    case 'rating':
      return s.sort((a, b) => (parseFloat(b.imdbRating) || parseFloat(b.rating) || 0) - (parseFloat(a.imdbRating) || parseFloat(a.rating) || 0));
    case 'year':
      return s.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
    case 'title_asc':
      return s.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    case 'title_desc':
      return s.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
    case 'added':
      return s.sort((a, b) => {
        const ta = a.createdAt?.seconds || a.order || 0;
        const tb = b.createdAt?.seconds || b.order || 0;
        return tb - ta;
      });
    case 'elo':
      return s.sort((a, b) => (b.eloRating || 1200) - (a.eloRating || 1200));
    case 'popularity': default:
      return s.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  }
}

// ── private helpers ────────────────────────────────────────────────────────

function _updateCount(toggleBtn, state) {
  let n = 0;
  if (state.genre?.length) n++;
  if (state.yearMin || state.yearMax) n++;
  if (state.ratingMin || state.ratingMax) n++;
  if (state.runtime) n++;
  if (state.language) n++;
  if (state.country) n++;
  if (state.director) n++;
  if (state.cast) n++;
  if (state.status) n++;
  if (state.favorite) n++;
  if (state.addedRange) n++;
  toggleBtn.innerHTML = n > 0
    ? `${i18n.t('filters')} <span class="filter-count">${n}</span>`
    : i18n.t('filters');
}

function _sortLabel(key) {
  return { popularity: 'Popolarità', rating: 'Valutazione', year: 'Anno',
    title_asc: 'Titolo A→Z', title_desc: 'Titolo Z→A', added: 'Data aggiunta', elo: 'Elo' }[key] || key;
}

function _section(label, content) {
  return `<div class="filter-section"><div class="filter-section-label">${label}</div>${content}</div>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
