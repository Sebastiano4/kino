/**
 * TMDB — Cloud Function proxy client + image helpers.
 *
 * Part 4 — Image optimisation
 * Problem: posterUrl() always requests w500 (~60 KB/image). Grid cards
 * display at ~185 px wide (w185 = ~12 KB; w342 on HiDPI = ~28 KB).
 * With 40 cards visible this is 2.4 MB → 480 KB–1.1 MB — up to 80% savings.
 *
 * New helpers:
 *   posterImg(path, opts) → <img> element with srcset, lazy, decoding=async
 *   posterSrcset(path)    → srcset string for CSS-based images
 *   posterUrl(path, size) → unchanged URL helper (backward compat)
 *
 * Part 9 — Streaming Availability
 *   watchProviders(tmdbId, region?) → { flatrate, rent, buy, link }
 *   Provider results are cached for 24 h in sessionStorage.
 */

import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-functions.js";
import { functions } from '../core/firebase.js';
import { authReady } from '../core/auth.js';

const proxy = httpsCallable(functions, 'tmdbProxy');

// ── provider cache (24h, sessionStorage) ──────────────────────────────────

const _CACHE_PREFIX = 'kino-wp-';
const _CACHE_TTL    = 24 * 60 * 60 * 1000; // 24 hours

function _wpCacheKey(id, region) { return `${_CACHE_PREFIX}${id}-${region}`; }

function _wpGet(id, region) {
    try {
        const raw = sessionStorage.getItem(_wpCacheKey(id, region));
        if (!raw) return null;
        const { ts, data } = JSON.parse(raw);
        if (Date.now() - ts > _CACHE_TTL) { sessionStorage.removeItem(_wpCacheKey(id, region)); return null; }
        return data;
    } catch { return null; }
}

function _wpSet(id, region, data) {
    try { sessionStorage.setItem(_wpCacheKey(id, region), JSON.stringify({ ts: Date.now(), data })); } catch {}
}

// ── API calls ──────────────────────────────────────────────────────────────

async function call(path, params = {}) {
    const u = await authReady();
    if (!u) throw new Error('Devi essere autenticato');
    const r = await proxy({ path, params });
    return r.data;
}

export const searchMovies   = (query, page = 1) => call('/search/movie', { language: 'en-US', query, page });
export const discoverMovies = (params = {}, page = 1) => call('/discover/movie', {
    language: 'en-US', sort_by: 'popularity.desc', page, ...params,
});
export const movieDetails  = (id, append = '') => call(`/movie/${id}`, {
    language: 'en-US', ...(append ? { append_to_response: append } : {}),
});
export const movieCredits  = (id) => call(`/movie/${id}/credits`);
export const movieSimilar  = (id) => call(`/movie/${id}/similar`);
export const genreList     = () => call('/genre/movie/list', { language: 'en-US' });

/**
 * Fetch streaming/rental/purchase providers for a movie.
 * Results are deduplicated by provider_id and cached in sessionStorage.
 *
 * @param {number|string} tmdbId
 * @param {string}        region  — ISO 3166-1 alpha-2, default auto-detect
 * @returns {Promise<{ flatrate:Array, rent:Array, buy:Array, link:string }>}
 */
export async function watchProviders(tmdbId, region) {
    const r = region || _detectRegion();
    const cached = _wpGet(tmdbId, r);
    if (cached) return cached;

    const raw = await call(`/movie/${tmdbId}/watch/providers`);
    const regionData = raw?.results?.[r] || {};

    const data = {
        flatrate: _dedup(regionData.flatrate || []),
        rent:     _dedup(regionData.rent     || []),
        buy:      _dedup(regionData.buy      || []),
        link:     regionData.link || `https://www.themoviedb.org/movie/${tmdbId}/watch`,
    };

    _wpSet(tmdbId, r, data);
    return data;
}

function _dedup(providers) {
    const seen = new Set();
    return providers.filter(p => {
        if (seen.has(p.provider_id)) return false;
        seen.add(p.provider_id);
        return true;
    });
}

function _detectRegion() {
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const map = {
            'Europe/Rome': 'IT', 'Europe/London': 'GB', 'America/New_York': 'US',
            'America/Los_Angeles': 'US', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE',
            'Europe/Madrid': 'ES', 'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR',
        };
        return map[tz] || 'US';
    } catch { return 'US'; }
}

// ── Image helpers ──────────────────────────────────────────────────────────

const BASE = 'https://image.tmdb.org/t/p/';

/**
 * Bare URL (backward compatible).
 * @param {string} path
 * @param {'w92'|'w154'|'w185'|'w342'|'w500'|'w780'|'original'} size
 */
export const posterUrl  = (path, size = 'w500') => path ? `${BASE}${size}${path}` : '';
export const backdropUrl = (path, size = 'w1280') => path ? `${BASE}${size}${path}` : '';

/**
 * Build an <img> element with srcset, lazy loading, and async decoding.
 * Context-aware sizing:
 *   context = 'grid'   → w185 (1×) / w342 (2× retina)  — ~12 KB / ~28 KB
 *   context = 'modal'  → w342 (1×) / w500 (2× retina)  — ~28 KB / ~60 KB
 *   context = 'hero'   → w780 (1×) / original (2×)     — ~80 KB / varies
 *   context = 'thumb'  → w92  (1×) / w185 (2×)         — ~4 KB  / ~12 KB
 *
 * Bandwidth saving vs always-w500:
 *   Grid (40 cards):   2.4 MB → ~480 KB  (-80%)
 *   Modal:             60 KB  → ~28 KB   (-53%)
 *
 * @param {string} path      — TMDB poster_path
 * @param {object} opts
 * @param {string} opts.context  — 'grid' | 'modal' | 'hero' | 'thumb'
 * @param {string} opts.alt      — img alt text
 * @param {string} opts.class    — CSS class(es)
 * @param {string} opts.sizes    — CSS sizes attribute
 * @returns {HTMLImageElement}
 */
export function posterImg(path, opts = {}) {
    const { context = 'grid', alt = '', class: cls = '', sizes } = opts;

    const img = document.createElement('img');
    img.alt            = alt;
    img.loading        = 'lazy';
    img.decoding       = 'async';
    if (cls) img.className = cls;

    if (!path) return img;

    const configs = {
        thumb: { x1: 'w92',  x2: 'w185', defaultSizes: '92px'  },
        grid:  { x1: 'w185', x2: 'w342', defaultSizes: '(min-width:600px) 185px, 40vw' },
        modal: { x1: 'w342', x2: 'w500', defaultSizes: '(min-width:768px) 342px, 50vw' },
        hero:  { x1: 'w780', x2: 'w1280', defaultSizes: '100vw' },
    };
    const cfg = configs[context] || configs.grid;

    img.src     = `${BASE}${cfg.x1}${path}`;
    img.srcset  = `${BASE}${cfg.x1}${path} 1x, ${BASE}${cfg.x2}${path} 2x`;
    img.sizes   = sizes || cfg.defaultSizes;

    return img;
}

/**
 * Returns a srcset string for use in CSS background or custom markup.
 * @param {string} path
 * @param {'grid'|'modal'|'hero'|'thumb'} context
 */
export function posterSrcset(path, context = 'grid') {
    if (!path) return '';
    const cfgs = {
        thumb: ['w92', 'w185'],
        grid:  ['w185', 'w342'],
        modal: ['w342', 'w500'],
        hero:  ['w780', 'w1280'],
    };
    const [s1, s2] = cfgs[context] || cfgs.grid;
    return `${BASE}${s1}${path} 1x, ${BASE}${s2}${path} 2x`;
}
