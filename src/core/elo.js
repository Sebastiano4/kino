/**
 * ELO ENGINE — pure ranking logic, zero DOM.
 *
 * Part 6 addition: pickPair(movies, filters) replaces the unfiltered version.
 * Filters narrow the candidate pool while preserving Elo convergence quality:
 * - A weighted-random draw biases toward under-played movies.
 * - B is chosen within ±30% Elo distance of A (prevents stomp matches).
 * - A match-history set prevents immediate repeats.
 * - If filters yield < 2 candidates, falls back to unfiltered pool gracefully.
 *
 * Filter spec:
 *   {
 *     decade?:     number,   e.g. 1990 → films from 1990–1999
 *     genre?:      string,   genre name (case-insensitive)
 *     runtime?:    'short'|'medium'|'long'
 *     watchedYear?:number,   year from m.watchedDate
 *     director?:   string,   partial match, case-insensitive
 *   }
 *
 * Complexity: O(n log n) — one sort + slicing.
 */

export const INITIAL_ELO = 1200;

export const kFactor = (matches = 0) => (matches <= 10 ? 40 : 20);

export function expectedScore(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function updateElo(current, expected, score, matches = 0) {
    return Math.round(current + kFactor(matches) * (score - expected));
}

/** Seed Elo from manual rating 1-10 when eloRating is not yet set. */
export function seedElo(movie) {
    const hasRating = movie.rating != null;
    const rating    = Number(movie.rating) || 5;
    const baseline  = Math.round(800 + (rating - 1) * (1200 / 9));
    if (movie.eloRating == null) return baseline;
    if (movie.eloRating === INITIAL_ELO && hasRating) return baseline;
    return movie.eloRating;
}

/** Resolve a match — returns both movies with updated eloRating / eloMatches. */
export function resolveMatch(movieA, movieB, winnerIsA) {
    const eA = seedElo(movieA), eB = seedElo(movieB);
    const expA = expectedScore(eA, eB), expB = 1 - expA;
    const scoreA = winnerIsA ? 1 : 0, scoreB = winnerIsA ? 0 : 1;
    const mA = movieA.eloMatches || 0, mB = movieB.eloMatches || 0;
    return {
        a: { ...movieA, eloRating: updateElo(eA, expA, scoreA, mA), eloMatches: mA + 1 },
        b: { ...movieB, eloRating: updateElo(eB, expB, scoreB, mB), eloMatches: mB + 1 },
    };
}

/** Tier labels based on Elo rating. */
export function tierOf(elo = INITIAL_ELO) {
    if (elo >= 1600) return { key: 'legendary',   label: 'Legendary' };
    if (elo >= 1500) return { key: 'grandmaster', label: 'Grandmaster' };
    if (elo >= 1400) return { key: 'master',      label: 'Master' };
    if (elo >= 1300) return { key: 'elite',       label: 'Elite' };
    if (elo >= 1200) return { key: 'veteran',     label: 'Veteran' };
    if (elo >= 1050) return { key: 'pro',         label: 'Pro' };
    return { key: 'rookie', label: 'Rookie' };
}

/**
 * Pick a pair of movies for the next battle.
 *
 * @param {Array}   movies  — full rated movie pool
 * @param {object}  filters — optional filter spec (see module JSDoc)
 * @param {Set}     seen    — set of "idA:idB" strings to avoid repeats
 * @returns {[movie, movie] | null}
 */
export function pickPair(movies, filters = {}, seen = new Set()) {
    const base = movies.filter(m => m.rating != null);
    if (base.length < 2) return null;

    // Apply filters to narrow pool
    let pool = _applyFilters(base, filters);

    // Graceful fallback: if filters leave < 2 candidates, use full rated pool
    if (pool.length < 2) pool = base;

    return _selectPair(pool, seen) || _selectPair(base, new Set());
}

// ── private ────────────────────────────────────────────────────────────────

/**
 * Apply filter spec to a movie array.
 * Each filter is opt-in: undefined/null means no constraint.
 */
function _applyFilters(movies, f) {
    return movies.filter(m => {
        // decade: e.g. 1990 → 1990–1999
        if (f.decade != null) {
            const y = Number(m.year) || Number((m.releaseDate || '').slice(0, 4));
            if (!y || y < f.decade || y > f.decade + 9) return false;
        }

        // genre: string, case-insensitive partial match against m.genres array or string
        if (f.genre) {
            const gl = f.genre.toLowerCase();
            const genres = Array.isArray(m.genres)
                ? m.genres.map(g => (typeof g === 'string' ? g : g?.name || '').toLowerCase())
                : String(m.genres || '').toLowerCase().split(',').map(s => s.trim());
            if (!genres.some(g => g.includes(gl))) return false;
        }

        // runtime bucket
        if (f.runtime) {
            const rt = m.runtime || 0;
            if (!rt) return false;
            if (f.runtime === 'short'  && rt >= 90)           return false;
            if (f.runtime === 'medium' && (rt < 90 || rt > 150)) return false;
            if (f.runtime === 'long'   && rt <= 150)           return false;
        }

        // watchedYear: year part of m.watchedDate  (format YYYY-MM-DD)
        if (f.watchedYear != null) {
            const wy = Number((m.watchedDate || '').slice(0, 4));
            if (wy !== f.watchedYear) return false;
        }

        // director: partial match, case-insensitive
        if (f.director) {
            if (!(m.director || '').toLowerCase().includes(f.director.toLowerCase())) return false;
        }

        return true;
    });
}

/**
 * Select a pair from a pool, avoiding already-seen matchups.
 * Strategy:
 *   A = weighted-random draw biased toward under-played movies (fewer eloMatches → higher weight).
 *   B = random pick from the top 20% Elo-nearest candidates to A.
 */
function _selectPair(pool, seen) {
    if (pool.length < 2) return null;

    // Weighted pick for A: weight = 1 / (eloMatches + 1)
    const weights = pool.map(m => 1 / ((m.eloMatches || 0) + 1));
    const total   = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    let a = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) {
        r -= weights[i];
        if (r <= 0) { a = pool[i]; break; }
    }

    const eA = seedElo(a);
    // Sort remaining by Elo distance to A
    const others = pool.filter(m => m.id !== a.id)
        .sort((x, y) => Math.abs(seedElo(x) - eA) - Math.abs(seedElo(y) - eA));

    // Top 20% nearest (min 3)
    const near = others.slice(0, Math.max(3, Math.ceil(others.length * 0.2)));

    // Avoid seen matchups
    const candidates = near.filter(m => {
        const key1 = `${a.id}:${m.id}`;
        const key2 = `${m.id}:${a.id}`;
        return !seen.has(key1) && !seen.has(key2);
    });

    const b = (candidates.length ? candidates : near)[
        Math.floor(Math.random() * (candidates.length || near.length))
    ];

    if (!b) return null;

    // Record this matchup
    seen.add(`${a.id}:${b.id}`);

    return [a, b];
}
