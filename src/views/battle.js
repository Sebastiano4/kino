/**
 * BATTLE — premium duel experience with Elo, skip, undo and session stats.
 */

import { init, getState } from '../core/store.js';
import { updateMovie, addMatch, deleteMatch } from '../data/repo.js';
import { pickPair, resolveMatch, tierOf, seedElo } from '../core/elo.js';
import { posterUrl } from '../services/tmdb.js';
import i18n from '../core/i18n.js';

export const battle = {
    id: 'battle', label: 'Battle', icon: '⚔️',
    _keyHandler: null,

    async mount(el) {
        el.innerHTML = `<div class="center-screen"><div class="sk poster" style="width:160px"></div></div>`;
        await init();

        let movies = (getState().movies || []).filter(m => m.rating != null);
        if (movies.length < 2) {
            el.innerHTML = `<div class="center-screen"><div class="empty"><div class="big">${i18n.t('need_at_least_2_rated')}</div></div></div>`;
            return;
        }

        let filters = {};
        let seen = new Set();
        let current = null;
        let locked = false;
        const history = [];
        const stats = _freshStats(movies.length);

        _buildShell(el, movies, f => {
            filters = f;
            seen = new Set();
            current = null;
            stats.remaining = _filteredCount(movies, filters);
            renderRound();
        });

        const renderStats = () => {
            const panel = el.querySelector('#battleStats');
            if (panel) panel.innerHTML = _statsPanel(stats);
        };

        const renderRound = () => {
            locked = false;
            if (stats.roundsSeen > 0 && stats.roundsSeen % 30 === 0) seen = new Set();

            const pair = pickPair(movies, filters, seen);
            const arena = el.querySelector('#battleArena');
            if (!arena) return;

            if (!pair) {
                arena.innerHTML = `<div class="empty" style="width:100%"><div class="big">${i18n.t('battle_no_pair_title')}</div>${i18n.t('battle_no_pair_msg')}</div>`;
                renderStats();
                return;
            }

            const [a, b] = pair;
            current = { a, b, oldEloA: seedElo(a), oldEloB: seedElo(b), duelNo: stats.roundsSeen + 1 };
            stats.remaining = _filteredCount(movies, filters);
            stats.roundsSeen++;

            arena.innerHTML = `
              <div class="battle-topline">
                <span class="battle-counter">${i18n.t('battle_duel')} #${current.duelNo}</span>
                <span class="battle-shortcuts">${i18n.t('battle_shortcuts')}</span>
              </div>
              <div class="battle-header"><h2 class="serif accent">${_prompt('battle_prompt_', 3)}</h2></div>
              <div class="battle-arena">
                ${_side(a, 'a', current.oldEloA)}
                <div class="battle-vs"><span></span><strong>${i18n.t('battle_vs')}</strong><span></span></div>
                ${_side(b, 'b', current.oldEloB)}
              </div>
              <div class="battle-actions">
                <button class="btn btn-ghost" id="battleUndo" ${history.length ? '' : 'disabled'}>↩ ${i18n.t('battle_undo')}</button>
                <button class="btn" id="battleSkip">${i18n.t('battle_skip')}</button>
              </div>`;

            arena.querySelector('#pick-a').onclick = () => choose(true);
            arena.querySelector('#pick-b').onclick = () => choose(false);
            arena.querySelector('#battleSkip').onclick = skip;
            arena.querySelector('#battleUndo').onclick = undo;
            renderStats();
        };

        const skip = () => {
            if (locked) return;
            renderRound();
        };

        const choose = async winnerIsA => {
            if (locked || !current) return;
            locked = true;

            const { a, b, oldEloA, oldEloB } = current;
            const beforeA = { ...a };
            const beforeB = { ...b };
            const res = resolveMatch(a, b, winnerIsA);
            const deltaA = res.a.eloRating - oldEloA;
            const deltaB = res.b.eloRating - oldEloB;
            const winner = winnerIsA ? a : b;
            const loser = winnerIsA ? b : a;
            const wImdb = parseFloat(winner.imdbRating) || parseFloat(winner.rating) || 0;
            const lImdb = parseFloat(loser.imdbRating) || parseFloat(loser.rating) || 0;
            const isUpset = wImdb > 0 && lImdb > 0 && wImdb < lImdb;
            let matchId = null;
            const statBefore = _cloneStats(stats);
            const historyEntry = { beforeA, beforeB, matchId: null, statSnapshot: statBefore, undone: false };

            movies = movies.map(m => m.id === res.a.id ? res.a : m.id === res.b.id ? res.b : m);
            _updateSessionStats(stats, winner, loser, winnerIsA ? deltaA : deltaB, isUpset);
            history.push(historyEntry);
            _showResult(el.querySelector('#battleArena'), res, winnerIsA, deltaA, deltaB, isUpset, renderRound, undo, async (newRatingW, newRatingL) => {
                const wId = winnerIsA ? res.a.id : res.b.id;
                const lId = winnerIsA ? res.b.id : res.a.id;
                await Promise.all([updateMovie(wId, { rating: newRatingW }), updateMovie(lId, { rating: newRatingL })]);
                movies = movies.map(m => m.id === wId ? { ...m, rating: newRatingW } : m.id === lId ? { ...m, rating: newRatingL } : m);
            });
            renderStats();

            try {
                await Promise.all([
                    updateMovie(res.a.id, { eloRating: res.a.eloRating, eloMatches: res.a.eloMatches }),
                    updateMovie(res.b.id, { eloRating: res.b.eloRating, eloMatches: res.b.eloMatches }),
                ]);
            } catch {}

            try {
                matchId = await addMatch({
                    movieAId: a.id, movieATitle: a.title, movieAElo: oldEloA,
                    movieBId: b.id, movieBTitle: b.title, movieBElo: oldEloB,
                    winnerId: winnerIsA ? a.id : b.id,
                    newEloA: res.a.eloRating, newEloB: res.b.eloRating,
                    deltaA, deltaB, isUpset,
                });
                historyEntry.matchId = matchId;
                if (historyEntry.undone) await deleteMatch(matchId);
            } catch {}
        };

        const undo = async () => {
            const snap = history.pop();
            if (!snap) return;
            snap.undone = true;
            movies = movies.map(m => m.id === snap.beforeA.id ? snap.beforeA : m.id === snap.beforeB.id ? snap.beforeB : m);
            _restoreStats(stats, snap.statSnapshot);
            await Promise.all([
                updateMovie(snap.beforeA.id, { eloRating: snap.beforeA.eloRating ?? null, eloMatches: snap.beforeA.eloMatches || 0 }),
                updateMovie(snap.beforeB.id, { eloRating: snap.beforeB.eloRating ?? null, eloMatches: snap.beforeB.eloMatches || 0 }),
                deleteMatch(snap.matchId),
            ]);
            renderRound();
        };

        this._keyHandler = e => {
            if (e.target?.matches?.('input, textarea, select')) return;
            if (e.key === 'ArrowLeft') choose(true);
            if (e.key === 'ArrowRight') choose(false);
            if (e.key.toLowerCase() === 's') skip();
            if (e.key.toLowerCase() === 'u') undo();
        };
        window.addEventListener('keydown', this._keyHandler);
        renderRound();
    },

    unmount() {
        if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
        this._keyHandler = null;
    },
};

const DECADE_OPTIONS = [
    { value: '', label: 'All decades' },
    { value: 1950, label: '1950s' }, { value: 1960, label: '1960s' },
    { value: 1970, label: '1970s' }, { value: 1980, label: '1980s' },
    { value: 1990, label: '1990s' }, { value: 2000, label: '2000s' },
    { value: 2010, label: '2010s' }, { value: 2020, label: '2020s' },
];

function _buildShell(el, movies, onChange) {
    const directors = [...new Set(movies.map(m => m.director).filter(Boolean))].sort();
    const genres = [...new Set(movies.flatMap(m => _genres(m)))].sort().slice(0, 16);

    el.innerHTML = `
      <div class="battle-page">
        <div class="battle-filters" id="battleFilters">
          <div class="battle-filter-row">
            <select class="filter-select" id="bfDecade">${DECADE_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}</select>
            <select class="filter-select" id="bfRuntime">
              <option value="">All runtimes</option>
              <option value="short">&lt; 90 min</option>
              <option value="medium">90-150 min</option>
              <option value="long">&gt; 150 min</option>
            </select>
            ${directors.length > 1 ? `<select class="filter-select" id="bfDirector"><option value="">All directors</option>${directors.slice(0,50).map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('')}</select>` : ''}
            <button class="btn btn-sm" id="bfApply">Filter</button>
          </div>
          ${genres.length ? `<div class="battle-genre-chips">${genres.map(g => `<button class="filter-pill" data-genre="${esc(g)}">${esc(g)}</button>`).join('')}</div>` : ''}
        </div>
        <div class="battle-layout">
          <main id="battleArena"></main>
          <aside class="battle-stats-panel" id="battleStats"></aside>
        </div>
      </div>`;

    const selectedGenres = new Set();
    el.querySelectorAll('[data-genre]').forEach(btn => {
        btn.addEventListener('click', () => {
            const genre = btn.dataset.genre;
            btn.classList.toggle('active');
            if (selectedGenres.has(genre)) selectedGenres.delete(genre);
            else selectedGenres.add(genre);
            emit();
        });
    });
    el.querySelector('#bfApply').addEventListener('click', emit);

    function emit() {
        const f = {};
        const decade = el.querySelector('#bfDecade')?.value;
        const runtime = el.querySelector('#bfRuntime')?.value;
        const director = el.querySelector('#bfDirector')?.value || '';
        if (decade) f.decade = Number(decade);
        if (runtime) f.runtime = runtime;
        if (director) f.director = director;
        if (selectedGenres.size) f.genres = [...selectedGenres];
        onChange(f);
    }
}

function _side(m, k, elo) {
    const tier = tierOf(elo);
    const src = m.poster || posterUrl(m.poster_path || m.posterPath || '') || '';
    return `<button id="pick-${k}" class="battle-card">
      <span class="battle-badge" aria-hidden="true"></span>
      <div class="poster"><img alt="${esc(m.title || '')} poster" src="${esc(src)}" loading="eager"></div>
      <div class="battle-info">
        <span class="title">${esc(m.title)}</span>
        <span class="battle-elo">${elo} <span class="battle-tier">${tier.label}</span></span>
      </div>
    </button>`;
}

function _showResult(arena, res, winnerIsA, deltaA, deltaB, isUpset, onNext, onUndo, onEditRatings) {
    const w = winnerIsA ? res.a : res.b;
    const l = winnerIsA ? res.b : res.a;
    arena.innerHTML = `
      <div class="battle-header"><h2 class="serif accent">${_prompt('battle_result_', 4)}</h2></div>
      <div class="battle-arena result">
        ${_resultCard(res.a, winnerIsA, deltaA)}
        <div class="battle-vs-result">${winnerIsA ? '←' : '→'}</div>
        ${_resultCard(res.b, !winnerIsA, deltaB)}
      </div>
      ${isUpset ? `<div class="battle-upset" id="upsetBanner">
        <span class="upset-icon">⚡</span>
        <span>${i18n.t('battle_upset_msg')}</span>
        <button class="btn btn-sm" id="upsetEdit">${i18n.t('battle_edit_votes')}</button>
      </div>` : ''}
      <div class="battle-next">
        <button class="btn btn-ghost" id="battleUndo">↩ ${i18n.t('battle_undo')}</button>
        <button class="btn btn-accent" id="battleNext">${i18n.t('battle_next')}</button>
      </div>`;

    arena.querySelector('#battleNext').onclick = onNext;
    arena.querySelector('#battleUndo').onclick = onUndo;

    if (isUpset) {
        arena.querySelector('#upsetEdit')?.addEventListener('click', () => {
            const banner = arena.querySelector('#upsetBanner');
            banner.innerHTML = `
              <div class="upset-edit">
                <div class="upset-edit-row"><span>${esc(w.title)}</span><input type="number" id="upsetRateW" min="1" max="10" step="0.5" value="${w.rating || ''}" class="filter-input"></div>
                <div class="upset-edit-row"><span>${esc(l.title)}</span><input type="number" id="upsetRateL" min="1" max="10" step="0.5" value="${l.rating || ''}" class="filter-input"></div>
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

function _resultCard(m, winner, delta) {
    const src = m.poster || posterUrl(m.poster_path || m.posterPath || '') || '';
    return `<div class="battle-result-card ${winner ? 'winner' : 'loser'}">
      <span class="battle-result-badge">${winner ? i18n.t('battle_winner_badge') : i18n.t('battle_loser_badge')}</span>
      <div class="poster"><img alt="${esc(m.title || '')} poster" src="${esc(src)}"></div>
      <div class="battle-info">
        <span class="title">${esc(m.title)}</span>
        <span class="battle-elo">${m.eloRating}<span class="elo-delta ${delta > 0 ? 'up' : 'down'}">${_fmtDelta(delta)}</span></span>
      </div>
    </div>`;
}

function _freshStats(total) {
    return { completed: 0, wins: {}, lastWinner: null, streak: 0, bestGain: 0, upset: null, eloGainTotal: 0, roundsSeen: 0, remaining: total };
}

function _updateSessionStats(stats, winner, loser, gain, isUpset) {
    stats.completed++;
    stats.wins[winner.id] = { title: winner.title, count: (stats.wins[winner.id]?.count || 0) + 1 };
    stats.streak = stats.lastWinner === winner.id ? stats.streak + 1 : 1;
    stats.lastWinner = winner.id;
    stats.eloGainTotal += Math.max(0, gain);
    if (Math.abs(gain) > stats.bestGain) stats.bestGain = Math.abs(gain);
    if (isUpset) stats.upset = `${winner.title} over ${loser.title}`;
}

function _statsPanel(stats) {
    const dominant = Object.values(stats.wins).sort((a, b) => b.count - a.count)[0]?.title || '—';
    const avg = stats.completed ? `+${(stats.eloGainTotal / stats.completed).toFixed(1)}` : '—';
    return `
      ${_stat(i18n.t('battle_stats_total'), stats.completed)}
      ${_stat(i18n.t('battle_stats_win_rate'), stats.completed ? '100%' : '—')}
      ${_stat(i18n.t('battle_stats_dominant'), dominant)}
      ${_stat(i18n.t('battle_stats_upset'), stats.upset || '—')}
      ${_stat(i18n.t('battle_stats_streak'), stats.streak || '—')}
      ${_stat(i18n.t('battle_stats_avg_gain'), avg)}
      ${_stat(i18n.t('battle_stats_remaining'), stats.remaining)}`;
}

function _stat(label, value) {
    return `<div class="battle-stat"><span>${label}</span><strong>${esc(value)}</strong></div>`;
}

function _cloneStats(stats) {
    const copy = JSON.parse(JSON.stringify(stats));
    return copy;
}

function _restoreStats(stats, snap) {
    Object.keys(stats).forEach(k => delete stats[k]);
    Object.assign(stats, snap);
}

function _filteredCount(movies, f) {
    return movies.filter(m => {
        if (f.decade) {
            const y = Number(m.year) || Number((m.releaseDate || '').slice(0, 4));
            if (!y || y < f.decade || y > f.decade + 9) return false;
        }
        if (f.runtime) {
            const rt = m.runtime || 0;
            if (!rt) return false;
            if (f.runtime === 'short' && rt >= 90) return false;
            if (f.runtime === 'medium' && (rt < 90 || rt > 150)) return false;
            if (f.runtime === 'long' && rt <= 150) return false;
        }
        if (f.director && !(m.director || '').toLowerCase().includes(f.director.toLowerCase())) return false;
        if (f.genres?.length && !f.genres.some(g => _genres(m).includes(g))) return false;
        return true;
    }).length;
}

function _genres(m) {
    return Array.isArray(m.genres)
        ? m.genres.map(g => typeof g === 'string' ? g : g?.name || '').filter(Boolean)
        : String(m.genres || '').split(',').map(s => s.trim()).filter(Boolean);
}

function _prompt(prefix, count) {
    return i18n.t(`${prefix}${1 + Math.floor(Math.random() * count)}`);
}

function _fmtDelta(n) {
    const v = Number(n || 0);
    return `${v > 0 ? '+' : ''}${v.toFixed(2)}`;
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
