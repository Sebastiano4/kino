/** BATTLE — duello 1vs1, aggiorna Elo. */
import { getMovies, updateMovie, addMatch } from '../data/repo.js';
import { pickPair, resolveMatch, tierOf, seedElo } from '../core/elo.js';
import { posterUrl } from '../services/tmdb.js';
import i18n from '../core/i18n.js';

export const battle = {
    id: 'battle', label: 'Battle', icon: '⚔️',
    async mount(el) {
        el.innerHTML = `<div class="center-screen"><div class="sk poster" style="width:160px"></div></div>`;
        let movies = [];
        try { movies = (await getMovies()).filter(m => m.rating != null); }
        catch (e) { el.innerHTML = err(e.message); return; }
        if (movies.length < 2) {
            el.innerHTML = `<div class="center-screen"><div class="empty"><div class="big">${i18n.t('need_at_least_2_rated')}</div></div></div>`;
            return;
        }

        const round = () => {
            const pair = pickPair(movies);
            if (!pair) return;
            const [a, b] = pair;
            const eloA = seedElo(a), eloB = seedElo(b);
            el.innerHTML = `
              <div class="battle-header"><h2 class="serif accent">${i18n.t('battle_prompt')}</h2></div>
              <div class="battle-arena">
                ${side(a, 'a', eloA)}
                <div class="battle-vs">${i18n.t('battle_vs')}</div>
                ${side(b, 'b', eloB)}
              </div>`;
            el.querySelector('#pick-a').onclick = () => choose(a, b, true, eloA, eloB);
            el.querySelector('#pick-b').onclick = () => choose(a, b, false, eloA, eloB);
        };

        const choose = async (a, b, winnerIsA, oldEloA, oldEloB) => {
            const res = resolveMatch(a, b, winnerIsA);
            const deltaA = res.a.eloRating - oldEloA;
            const deltaB = res.b.eloRating - oldEloB;
            const winner = winnerIsA ? a : b;
            const loser  = winnerIsA ? b : a;
            const winnerImdb = parseFloat(winner.imdbRating) || parseFloat(winner.rating) || 0;
            const loserImdb  = parseFloat(loser.imdbRating)  || parseFloat(loser.rating)  || 0;
            const isUpset = winnerImdb > 0 && loserImdb > 0 && winnerImdb < loserImdb;

            showResult(el, res, winnerIsA, deltaA, deltaB, isUpset, () => {
                movies = movies.map(m => m.id === res.a.id ? res.a : m.id === res.b.id ? res.b : m);
                round();
            }, async (newRatingWinner, newRatingLoser) => {
                const wId = winnerIsA ? res.a.id : res.b.id;
                const lId = winnerIsA ? res.b.id : res.a.id;
                await Promise.all([
                    updateMovie(wId, { rating: newRatingWinner }),
                    updateMovie(lId, { rating: newRatingLoser })
                ]);
                const wIdx = movies.findIndex(m => m.id === wId);
                const lIdx = movies.findIndex(m => m.id === lId);
                if (wIdx >= 0) movies[wIdx] = { ...movies[wIdx], rating: newRatingWinner };
                if (lIdx >= 0) movies[lIdx] = { ...movies[lIdx], rating: newRatingLoser };
            });

            movies = movies.map(m => m.id === res.a.id ? res.a : m.id === res.b.id ? res.b : m);
            try {
                await Promise.all([
                    updateMovie(res.a.id, { eloRating: res.a.eloRating, eloMatches: res.a.eloMatches }),
                    updateMovie(res.b.id, { eloRating: res.b.eloRating, eloMatches: res.b.eloMatches })
                ]);
            } catch {}

            try {
                await addMatch({
                    movieAId: a.id, movieATitle: a.title, movieAElo: oldEloA,
                    movieBId: b.id, movieBTitle: b.title, movieBElo: oldEloB,
                    winnerId: winnerIsA ? a.id : b.id,
                    newEloA: res.a.eloRating, newEloB: res.b.eloRating,
                    deltaA, deltaB, isUpset,
                });
            } catch {}
        };

        round();
    }
};

function formatDelta(n) {
    const num = Number(n || 0);
    return `${num > 0 ? '+' : ''}${num}`;
}

function side(m, k, elo) {
    const tier = tierOf(elo);
    return `<button id="pick-${k}" class="battle-card">
      <div class="poster"><img alt="" src="${m.poster || posterUrl(m.poster_path)}"></div>
      <div class="battle-info">
        <span class="title">${esc(m.title)}</span>
        <span class="battle-elo">${elo} <span class="battle-tier">${tier.label}</span></span>
      </div>
    </button>`;
}

function showResult(el, res, winnerIsA, deltaA, deltaB, isUpset, onNext, onEditRatings) {
    const w = winnerIsA ? res.a : res.b;
    const l = winnerIsA ? res.b : res.a;

    el.innerHTML = `
      <div class="battle-header"><h2 class="serif accent">${i18n.t('battle_result')}</h2></div>
      <div class="battle-arena">
        <div class="battle-result-card ${winnerIsA ? 'winner' : 'loser'}">
          <div class="poster"><img alt="" src="${res.a.poster || posterUrl(res.a.poster_path)}"></div>
          <div class="battle-info">
            <span class="title">${esc(res.a.title)}</span>
            <span class="battle-elo">${res.a.eloRating}
              <span class="elo-delta ${deltaA > 0 ? 'up' : 'down'}">${formatDelta(deltaA)}</span>
            </span>
          </div>
        </div>
        <div class="battle-vs-result">${winnerIsA ? '◀' : '▶'}</div>
        <div class="battle-result-card ${!winnerIsA ? 'winner' : 'loser'}">
          <div class="poster"><img alt="" src="${res.b.poster || posterUrl(res.b.poster_path)}"></div>
          <div class="battle-info">
            <span class="title">${esc(res.b.title)}</span>
            <span class="battle-elo">${res.b.eloRating}
              <span class="elo-delta ${deltaB > 0 ? 'up' : 'down'}">${formatDelta(deltaB)}</span>
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

    el.querySelector('#battleNext').onclick = onNext;

    if (isUpset) {
        el.querySelector('#upsetEdit')?.addEventListener('click', () => {
            const banner = el.querySelector('#upsetBanner');
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
            el.querySelector('#upsetSave').addEventListener('click', async () => {
                const rW = parseFloat(el.querySelector('#upsetRateW').value);
                const rL = parseFloat(el.querySelector('#upsetRateL').value);
                if (isNaN(rW) || isNaN(rL) || rW < 1 || rW > 10 || rL < 1 || rL > 10) return;
                await onEditRatings(rW, rL);
                banner.innerHTML = `<span class="upset-icon">✓</span><span>${i18n.t('battle_votes_updated')}</span>`;
                banner.classList.add('upset-saved');
            });
        });
    }
}

function err(msg) { return `<div class="center-screen"><div class="empty"><div class="big">Errore</div>${msg}</div></div>`; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
