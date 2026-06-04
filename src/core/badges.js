/**
 * BADGE SYSTEM — percentile-based tier classification.
 *
 * Each film gets a tier badge derived from its Elo rank within the user's
 * vault. The thresholds auto-calibrate as the dataset grows: the system
 * always reflects a "top 1%, top 5%, …" distribution, never absolute Elo
 * cutoffs that go stale.
 *
 * Tiers (by percentile of the rated-films pool, sorted by Elo desc):
 *   GOAT          top  1 %
 *   Legendary     top  1–5 %
 *   Masterpiece   top  5–15 %
 *   Elite         top 15–30 %
 *   Great         top 30–50 %
 *   Average       top 50–75 %
 *   Rookie        bottom 25 %
 *
 * API:
 *   computeBadgeBreakpoints(films) → { goat, legendary, … average }
 *     The minimum Elo required to belong to each tier.
 *   getBadge(film, breakpoints) → { key, label, color } | null
 */

import { seedElo } from './elo.js';

export const BADGE_TIERS = [
    { key: 'goat',        label: 'GOAT',        var: 'var(--badge-goat)'        },
    { key: 'legendary',   label: 'Legendary',   var: 'var(--badge-legendary)'   },
    { key: 'masterpiece', label: 'Masterpiece', var: 'var(--badge-masterpiece)' },
    { key: 'elite',       label: 'Elite',       var: 'var(--badge-elite)'       },
    { key: 'great',       label: 'Great',       var: 'var(--badge-great)'       },
    { key: 'average',     label: 'Average',     var: 'var(--badge-average)'     },
    { key: 'rookie',      label: 'Rookie',      var: 'var(--badge-rookie)'      },
];

/**
 * Compute the Elo cut-points that define each tier boundary.
 *
 * @param {Array} films  — full rated pool (anything with `rating != null`)
 * @returns {object|null} { goat, legendary, masterpiece, elite, great, average }
 *   or null if the pool is empty. Each value is the inclusive minimum Elo
 *   required to belong to that tier.
 */
export function computeBadgeBreakpoints(films) {
    const elos = films
        .filter(m => m.rating != null)
        .map(seedElo)
        .sort((a, b) => b - a);
    const N = elos.length;
    if (!N) return null;
    const at = p => elos[Math.min(Math.max(Math.ceil(N * p) - 1, 0), N - 1)];
    return {
        goat:        at(0.01),
        legendary:   at(0.05),
        masterpiece: at(0.15),
        elite:       at(0.30),
        great:       at(0.50),
        average:     at(0.75),
    };
}

/**
 * Resolve a film's badge tier given precomputed breakpoints.
 * Returns null if breakpoints are missing or film has no rating.
 *
 * @param {object} film
 * @param {object} breakpoints  — result of computeBadgeBreakpoints
 * @returns {object|null}       — one of BADGE_TIERS, or null
 */
export function getBadge(film, breakpoints) {
    if (!breakpoints || film.rating == null) return null;
    const e = seedElo(film);
    if (e >= breakpoints.goat)        return BADGE_TIERS[0];
    if (e >= breakpoints.legendary)   return BADGE_TIERS[1];
    if (e >= breakpoints.masterpiece) return BADGE_TIERS[2];
    if (e >= breakpoints.elite)       return BADGE_TIERS[3];
    if (e >= breakpoints.great)       return BADGE_TIERS[4];
    if (e >= breakpoints.average)     return BADGE_TIERS[5];
    return BADGE_TIERS[6];
}

/**
 * Tally how many films fall into each tier.
 * Useful for the filter-pill counters in the Vault toolbar.
 *
 * @param {Array}  films
 * @param {object} breakpoints
 * @returns {Object<string, number>}  — { goat: 7, legendary: 28, … }
 */
export function tallyBadges(films, breakpoints) {
    const tally = Object.fromEntries(BADGE_TIERS.map(t => [t.key, 0]));
    if (!breakpoints) return tally;
    films.forEach(m => {
        const b = getBadge(m, breakpoints);
        if (b) tally[b.key]++;
    });
    return tally;
}
