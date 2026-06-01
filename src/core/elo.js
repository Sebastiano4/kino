/** ELO ENGINE — logica pura, zero DOM. */

export const INITIAL_ELO = 1200;

export const kFactor = (matches = 0) => (matches <= 10 ? 40 : 20);

export function expectedScore(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function updateElo(current, expected, score, matches = 0) {
    return Math.round(current + kFactor(matches) * (score - expected));
}

/** Elo iniziale derivato dal voto 1-10 se non già impostato. */
export function seedElo(movie) {
    const hasRating = movie.rating != null;
    const rating = Number(movie.rating) || 5;
    const baseline = Math.round(800 + (rating - 1) * (1200 / 9));
    if (movie.eloRating == null) return baseline;
    if (movie.eloRating === INITIAL_ELO && hasRating) return baseline;
    return movie.eloRating;
}

/** Risultato di un match: ritorna i due film con eloRating/eloMatches aggiornati. */
export function resolveMatch(movieA, movieB, winnerIsA) {
    const eA = seedElo(movieA), eB = seedElo(movieB);
    const expA = expectedScore(eA, eB), expB = 1 - expA;
    const scoreA = winnerIsA ? 1 : 0, scoreB = winnerIsA ? 0 : 1;
    const mA = (movieA.eloMatches || 0), mB = (movieB.eloMatches || 0);
    return {
        a: { ...movieA, eloRating: updateElo(eA, expA, scoreA, mA), eloMatches: mA + 1 },
        b: { ...movieB, eloRating: updateElo(eB, expB, scoreB, mB), eloMatches: mB + 1 }
    };
}

/** Tier materiali in base all'Elo. */
export function tierOf(elo = INITIAL_ELO) {
    if (elo >= 1600) return { key: 'legendary',   label: 'Legendary' };
    if (elo >= 1500) return { key: 'grandmaster', label: 'Grandmaster' };
    if (elo >= 1400) return { key: 'master',      label: 'Master' };
    if (elo >= 1300) return { key: 'elite',       label: 'Elite' };
    if (elo >= 1200) return { key: 'veteran',     label: 'Veteran' };
    if (elo >= 1050) return { key: 'pro',         label: 'Pro' };
    return { key: 'rookie', label: 'Rookie' };
}

/** Coppia per la prossima battaglia: A pesato, B di Elo vicino. */
export function pickPair(movies) {
    const pool = movies.filter(m => m.rating != null);
    if (pool.length < 2) return null;
    const a = pool[Math.floor(Math.random() * pool.length)];
    const eA = seedElo(a);
    const others = pool.filter(m => m.id !== a.id)
        .sort((x, y) => Math.abs(seedElo(x) - eA) - Math.abs(seedElo(y) - eA));
    const near = others.slice(0, Math.max(3, Math.ceil(others.length * 0.2)));
    const b = near[Math.floor(Math.random() * near.length)];
    return [a, b];
}
