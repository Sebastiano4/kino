/**
 * GEO ENRICH — backfill production countries for films that lack them.
 *
 * Most films are added from Explore with only `originalLanguage`; the real
 * `production_countries` are written only when a film is opened in the detail
 * modal. The world map therefore starts empty. We recover the *actual*
 * production countries from OMDb's `Country` field (a comma-separated list of
 * real producing nations — never inferred from language), which is fetched
 * directly and reliably, unlike the TMDB proxy.
 *
 * Results are cached in localStorage (so we never re-query a film) and, when
 * found, persisted back to Firestore so every view benefits permanently.
 *
 *   mergeCachedCountries(films) → films with cached countries merged in (sync)
 *   backfillCountries(films)    → Promise<films> after one network pass
 */

import { imdbFull } from './omdb.js';
import { updateMovie } from '../data/repo.js';

const LS_KEY = 'kino-film-countries-v1';
let _cache = null;                 // { key: string[] }  ([] = looked up, none found)
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
    return m.imdbId || `${String(m.title || '').toLowerCase()}|${m.year || ''}`;
}

/** Merge any cached countries into films missing them. Pure & synchronous. */
export function mergeCachedCountries(films) {
    const c = _load();
    return (films || []).map(m => {
        if (m.countries && m.countries.length) return m;
        const got = c[_keyOf(m)];
        return got && got.length ? { ...m, countries: got } : m;
    });
}

async function _resolveOne(m) {
    const c = _load();
    const k = _keyOf(m);
    if (c[k] !== undefined) return c[k];
    if (_inflight.has(k)) return _inflight.get(k);

    const p = (async () => {
        let names = [];
        try {
            const data = await imdbFull({ imdbId: m.imdbId, title: m.title, year: m.year });
            if (data && typeof data.Country === 'string' && data.Country !== 'N/A') {
                names = data.Country.split(',').map(s => s.trim()).filter(Boolean);
            }
        } catch {}
        c[k] = names;
        _persist();
        // Persist real countries back to Firestore (skip offline placeholder ids).
        if (names.length && m.id && !String(m.id).startsWith('offline-')) {
            updateMovie(m.id, { countries: names }).catch(() => {});
        }
        return names;
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
    const c = _load();
    const todo = (films || []).filter(m => {
        if (m.countries && m.countries.length) return false;
        const k = _keyOf(m);
        if (c[k] !== undefined) return false;
        if (_attempted.has(k)) return false;
        return !!(m.imdbId || m.title);
    });
    todo.forEach(m => _attempted.add(_keyOf(m)));
    if (todo.length) await _pool(todo, 4, _resolveOne);
    return mergeCachedCountries(films);
}
