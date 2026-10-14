/**
 * GEO ENRICH — recover the production countries of films that lack them.
 *
 * Most films are added from Explore with only `originalLanguage`; the real
 * `production_countries` are written only when a film is opened in the detail
 * modal, so the world map starts sparse. We resolve countries from the most
 * authoritative source available, in order:
 *
 *   1. TMDB  movieDetails(tmdbId).production_countries  — the same curated data
 *      the detail modal uses. `origin_country` gives the true primary country.
 *   2. OMDb  by imdbId  — exact, reliable.
 *   3. OMDb  by title   — last resort, with a ±3y tolerance so an ambiguous
 *      title cannot silently attach the wrong film's country.
 *
 * Crucially we NEVER infer a country from language (French ≠ France) and never
 * overwrite good data with an empty result. Hits are cached in localStorage
 * and persisted to Firestore (countries + originCountry) so every view benefits.
 *
 *   mergeCachedCountries(films) → films with cached countries merged in (sync)
 *   backfillCountries(films)    → Promise<films> after one network pass
 */

import { imdbFull } from './omdb.js';
import { movieDetails } from './tmdb.js';
import { updateMovie } from '../data/repo.js';
import { isoToCountry } from '../core/countries.js';

const LS_KEY = 'kino-film-countries-v3';
let _cache = null;                 // { key: { c:string[], o:string|null } }
const _attempted = new Set();      // keys tried this session (avoid re-queue)
const _inflight  = new Map();      // key → Promise (dedupe concurrent lookups)

function _load() {
    if (_cache) return _cache;
    try { _cache = JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
    catch { _cache = {}; }
    return _cache;
}

let _saveTimer = null;
function _persist() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
        try { localStorage.setItem(LS_KEY, JSON.stringify(_cache)); } catch {}
    }, 400);
}

function _keyOf(m) {
    return m.tmdbId ? `t${m.tmdbId}`
         : m.imdbId ? m.imdbId
         : `${String(m.title || '').toLowerCase()}|${m.year || ''}`;
}

function _omdbCountries(d) {
    return (d && typeof d.Country === 'string' && d.Country !== 'N/A')
        ? d.Country.split(',').map(s => s.trim()).filter(Boolean)
        : [];
}

// Reject an OMDb hit whose year is far from ours — guards against a generic
// title resolving to the wrong film. A small drift (festival vs wide release)
// is tolerated so genuine matches like City of God (2002 vs 2004) still pass.
function _omdbYearOk(d, year) {
    if (!d) return false;
    const dy = parseInt(String(d.Year || '').slice(0, 4), 10);
    const my = parseInt(year, 10);
    if (!dy) return false;
    if (!my) return true;
    return Math.abs(dy - my) <= 3;
}

/** Merge any cached countries/origin into films missing them. Pure & sync. */
export function mergeCachedCountries(films) {
    const cache = _load();
    return (films || []).map(m => {
        if (m.countries && m.countries.length) return m;
        const got = cache[_keyOf(m)];
        if (got && got.c && got.c.length) {
            return { ...m, countries: got.c, originCountry: m.originCountry || got.o || undefined };
        }
        return m;
    });
}

async function _resolveOne(m) {
    const cache = _load();
    const k = _keyOf(m);
    if (cache[k] !== undefined) return cache[k];
    if (_inflight.has(k)) return _inflight.get(k);

    const p = (async () => {
        let result = null; // { countries:string[], origin:string|null }

        // 1. TMDB — authoritative production_countries (+ origin_country).
        if (m.tmdbId) {
            try {
                const d = await movieDetails(m.tmdbId);
                const names = (d?.production_countries || []).map(c => c.name).filter(Boolean);
                if (names.length) {
                    const oc = Array.isArray(d.origin_country) ? d.origin_country[0] : null;
                    const origin = (oc && isoToCountry(oc)?.name) || names[0];
                    result = { countries: names, origin };
                }
            } catch {}
        }
        // 2. OMDb by imdbId.
        if (!result && m.imdbId) {
            try {
                const names = _omdbCountries(await imdbFull({ imdbId: m.imdbId }));
                if (names.length) result = { countries: names, origin: names[0] };
            } catch {}
        }
        // 3. OMDb by title (retry without year; reject far-off year matches).
        if (!result && m.title) {
            try {
                let d = await imdbFull({ title: m.title, year: m.year });
                if (!_omdbYearOk(d, m.year)) d = await imdbFull({ title: m.title });
                if (_omdbYearOk(d, m.year)) {
                    const names = _omdbCountries(d);
                    if (names.length) result = { countries: names, origin: names[0] };
                }
            } catch {}
        }

        const stored = result || { countries: [], origin: null };
        cache[k] = { c: stored.countries, o: stored.origin };
        _persist();
        if (stored.countries.length && m.id && !String(m.id).startsWith('offline-')) {
            const patch = { countries: stored.countries };
            if (stored.origin) patch.originCountry = stored.origin;
            updateMovie(m.id, patch).catch(() => {});
        }
        return cache[k];
    })().finally(() => _inflight.delete(k));

    _inflight.set(k, p);
    return p;
}

async function _pool(items, size, fn) {
    const q = items.slice();
    const worker = async () => { while (q.length) await fn(q.shift()); };
    await Promise.all(Array.from({ length: Math.min(size, q.length) || 1 }, worker));
}

/**
 * Fetch & cache production countries for films that have none.
 * Network work runs once per film per session; subsequent calls return
 * instantly from cache.
 * @returns {Promise<Array>} films with countries merged in
 */
export async function backfillCountries(films) {
    const cache = _load();
    const todo = (films || []).filter(m => {
        if (m.countries && m.countries.length) return false;
        const k = _keyOf(m);
        if (cache[k] !== undefined) return false;
        if (_attempted.has(k)) return false;
        return !!(m.tmdbId || m.imdbId || m.title);
    });
    todo.forEach(m => _attempted.add(_keyOf(m)));
    if (todo.length) await _pool(todo, 4, _resolveOne);
    return mergeCachedCountries(films);
}
