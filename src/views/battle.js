/**
 * BATTLE — duello 1vs1, aggiorna Elo.
 *
 * Part 1: loads initial movies from store (init + getState) instead of getMovies().
 *         Does NOT subscribe to reactive updates — manages its own local copy
 *         since Elo changes must be applied immediately without round-trip delay.
 * Part 6: filter mode — lets the user narrow the battle pool by decade/genre/
 *         runtime/watchedYear/director. Uses seen-set to avoid repeat matchups.
 */

import { init, getState } from '../core/store.js';
import { updateMovie, addMatch } from '../data/repo.js';
import { pickPair, resolveMatch, tierOf, seedElo } from '../core/elo.js';
import { posterUrl, posterImg } from '../services/tmdb.js';
import i18n from '../core/i18n.js';

export const battle = {
    id: 'battle', label: 'Battle', icon: '⚔️',

    async mount(el) {
        el.innerHTML = `<div class="center-screen"><div class="sk poster" style="width:160px"></div></div>`;

        await init();

        let movies = (getState().movies || []).filter(m => m.rating != null);

        if (movies.length < 2) {
            el.innerHTML = `<div class="center-screen"><div class="empty"><div class="big">${i18n.t('need_at_least_2_rated')}</div></div></div>`;
            return;
        }

        let filters  = {};
        let seen     = new Set();   // match-history deduplication
        let roundCount = 0;

        // Build filter UI
        _buildFilterBar(el, movies, f => {
            filters   = f;
            seen      = new Set(); // reset seen when filter changes
            roundCount = 0;
            round();
        });

        const round = () => {
            // Reset seen set every 30 rounds to prevent pool exhaustion
            if (roundCount > 0 && roundCount % 30 === 0) seen = new Set();

            const pair = pickPair(movies, filters, seen);
            if (!pair) {
                const msg = Object.keys(filters).length
                    ? 'Nessuna coppia disponibile con i filtri selezionati.'
                    : i18n.t('need_at_least_2_rated');
                el.querySelector('#battleArena').innerHTML = `<div class="empty" style="width:100%"><div class="big">Nessuna coppia</div>${msg}</div>`;
                return;
            }
            const [a, b] = pair;
            const eloA = seedElo(a), eloB = seedElo(b);

            const arena = el.querySelector('#battleArena');
            if (!arena) return;
            arena.innerHTML = `
              <div class="battle-header"><h2 class="serif accent">${i18n.t('battle_prompt')}</h2></div>
              <div class="battle-arena">
                ${_side(a, 'a', eloA)}
                <div class="battle-vs">${i18n.t('battle_vs')}</div>
                ${_side(b, 'b', eloB)}
              </div>`;

            arena.querySelector('#pick-a').onclick = () => choose(a, b, true,  eloA, eloB);
            arena.querySelector('#pick-b').onclick = () => choose(a, b, false, eloA, eloB);
            roundCount++;
        };

        const choose = async (a, b, winnerIsA, oldEloA, oldEloB) => {
            const res    = resolveMatch(a, b, winnerIsA);
            const deltaA = res.a.eloRating - oldEloA;
            const deltaB = res.b.eloRating - oldEloB;
            const winner = winnerIsA ? a : b;
            const loser  = winnerIsA ? b : a;
            const wImdb  = parseFloat(winner.imdbRating) || parseFloat(winner.rating) || 0;
            const lImdb  = parseFloat(loser.imdbRating)  || parseFloat(loser.rating)  || 0;
            const isUpset = wImdb > 0 && lImdb > 0 && wImdb < lImdb;

            // Update local pool immediately (no Firestore round-trip needed for next round)
            movies = movies.map(m => m.id === res.a.id ? res.a : m.id === res.b.id ? res.b : m);

            _showResult(el.querySelector('#battleArena'), res, winnerIsA, deltaA, deltaB, isUpset, round,
                async (newRatingW, newRatingL) => {
                    const wId = winnerIsA ? res.a.id : res.b.id;
                    const lId = winnerIsA ? res.b.id : res.a.id;
                    await Promise.all([
                        updateMovie(wId, { rating: newRatingW }),
                        updateMovie(lId, { rating: newRatingL }),
                    ]);
                    const wIdx = movies.findIndex(m => m.id === wId);
                    const lIdx = movies.findIndex(m => m.id === lId);
                    if (wIdx >= 0) movies[wIdx] = { ...movies[wIdx], rating: newRatingW };
                    if (lIdx >= 0) movies[lIdx] = { ...movies[lIdx], rating: newRatingL };
                });

            // Persist Elo updates
            try {
                await Promise.all([
                    updateMovie(res.a.id, { eloRating: res.a.eloRating, eloMatches: res.a.eloMatches }),
                    updateMovie(res.b.id, { eloRating: res.b.eloRating, eloMatches: res.b.eloMatches }),
                ]);
            } catch {}

            try {
                await addMatch({
                    movieAId: a.id, movieATitle: a.title, movieAElo: oldEloA,
                    movieBId: b.id, movieBTitle: b.title, movieBElo: oldEloB,
                    winnerId: winnerIsA ? a.id : b.id,
                    newEloA:  res.a.eloRating, newEloB: res.b.eloRating,
                    deltaA, deltaB, isUpset,
                });
            } catch {}
        };

        round();
    },
};

// ── Filter bar ──────────────────────────────────────────────────────────────

const DECADE_OPTIONS = [
    { value: '', label: 'All decades' },
    { value: 1950, label: '1950s' }, { value: 1960, label: '1960s' },
    { value: 1970, label: '1970s' }, { value: 1980, label: '1980s' },
    { value: 1990, label: '1990s' }, { value: 2000, label: '2000s' },
    { value: 2010, label: '2010s' }, { value: 2020, label: '2020s' },
];

function _buildFilterBar(el, movies, onChange) {
    // Collect unique directors
    const directors = [...new Set(movies.map(m => m.director).filter(Boolean))].sort();

    el.innerHTML = `
      <div class="battle-filters" id="battleFilters">
        <div class="battle-filter-row">
          <select class="filter-select" id="bfDecade">
            ${DECADE_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
          </select>
          <select class="filter-select" id="bfRuntime">
            <option value="">All runtimes</option>
            <option value="short">&lt; 90 min</option>
            <option value="medium">90–150 min</option>
            <option value="long">&gt; 150 min</option>
          </select>
          ${directors.length > 1 ? `
          <select class="filter-select" id="bfDirector">
            <option value="">All directors</option>
            ${directors.slice(0,50).map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('')}
          </select>` : ''}
          <button class="btn btn-sm" id="bfApply">Filter</button>
        </div>
      </div>
      <div id="battleArena"></div>`;

    el.querySelector('#bfApply').addEventListener('click', () => {
        const decade   = el.querySelector('#bfDecade')?.value;
        const runtime  = el.querySelector('#bfRuntime')?.value;
        const director = el.querySelector('#bfDirector')?.value || '';
        const f = {};
        if (decade)   f.decade  = Number(decade);
        if (runtime)  f.runtime = runtime;
        if (director) f.director = director;
        onChange(f);
    });
}

// ── Templates ──────────────────────────────────────────────────────────────

function _side(m, k, elo) {
    const tier = tierOf(elo);
    const img  = posterImg(m.posterPath || null, { context: 'grid', alt: m.title || '' });
    img.src    = img.src || m.poster || posterUrl(m.poster_path) || '';
    return `<button id="pick-${k}" class="battle-card">
      <div class="poster">${m.posterPath ? '' : `<img alt="" src="${esc(m.poster || posterUrl(m.poster_path || ''))}">`}</div>
      <div class="battle-info">
        <span class="title">${esc(m.title)}</span>
        <span class="battle-elo">${elo} <span class="battle-tier">${tier.label}</span></span>
      </div>
    </button>`;
}

function _showResult(arena, res, winnerIsA, deltaA, deltaB, isUpset, onNext, onEditRatings) {
    const w = winnerIsA ? res.a : res.b;
    const l = winnerIsA ? res.b : res.a;

    arena.innerHTML = `
      <div class="battle-header"><h2 class="serif accent">${i18n.t('battle_result')}</h2></div>
      <div class="battle-arena">
        <div class="battle-result-card ${winnerIsA ? 'winner' : 'loser'}">
          <div class="poster"><img alt="" src="${esc(res.a.poster || posterUrl(res.a.poster_path || ''))}"></div>
          <div class="battle-info">
            <span class="title">${esc(res.a.title)}</span>
            <span class="battle-elo">${res.a.eloRating}
              <span class="elo-delta ${deltaA > 0 ? 'up' : 'down'}">${_fmtDelta(deltaA)}</span>
            </span>
          </div>
        </div>
        <div class="battle-vs-result">${winnerIsA ? '◀' : '▶'}</div>
        <div class="battle-result-card ${!winnerIsA ? 'winner' : 'loser'}">
          <div class="poster"><img alt="" src="${esc(res.b.poster || posterUrl(res.b.poster_path || ''))}"></div>
          <div class="battle-info">
            <span class="title">${esc(res.b.title)}</span>
            <span class="battle-elo">${res.b.eloRating}
              <span class="elo-delta ${deltaB > 0 ? 'up' : 'down'}">${_fmtDelta(deltaB)}</span>
            </span>
          </div>
        </div>
      </div>
      ${isUpset ? `<div class="battle-upset" id="upsetBanner">
        <span class="upset-icon">⚡</span>
        <span>${i18n.t('battle_upset_msg')}</span>
        <button class="btn btn-sm" id="upsetEdit">${i18n.t('battle_edit_votes')}</button>
      </div>` : ''}
      <div class="battle-next">
        <button class="btn btn-accent" id="battleNext">${i18n.t('battle_next')}</button>
      </div>`;

    arena.querySelector('#battleNext').onclick = onNext;

    if (isUpset) {
        arena.querySelector('#upsetEdit')?.addEventListener('click', () => {
            const banner = arena.querySelector('#upsetBanner');
            banner.innerHTML = `
              <div class="upset-edit">
                <div class="upset-edit-row">
                  <span>${esc(w.title)}</span>
                  <input type="number" id="upsetRateW" min="1" max="10" step="0.5" value="${w.rating || ''}" class="filter-input" style="width:70px">
                </div>
                <div class="upset-edit-row">
                  <span>${esc(l.title)}</span>
                  <input type="number" id="upsetRateL" min="1" max="10" step="0.5" value="${l.rating || ''}" class="filter-input" style="width:70px">
                </div>
                <button class="btn btn-sm btn-accent" id="upsetSave">${i18n.t('save')}</button>
              </div>`;
            arena.querySelector('#upsetSave').addEventListener('click', async () => {
                const rW = parseFloat(arena.querySelector('#upsetRateW').value);
                const rL = parseFloat(arena.querySelector('#upsetRateL').value);
                if (isNaN(rW) || isNaN(rL) || rW < 1 || rW > 10 || rL < 1 || rL > 10) return;
                await onEditRatings(rW, rL);
                banner.innerHTML = `<span class="upset-icon">✓</span><span>${i18n.t('battle_votes_updated')}</span>`;
                banner.classList.add('upset-saved');
            });
        });
    }
}

function _fmtDelta(n) { const v = Number(n || 0); return `${v > 0 ? '+' : ''}${v}`; }

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
