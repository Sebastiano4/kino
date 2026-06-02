/**
 * KINO STORE — reactive singleton state layer.
 *
 * Problem: every view calls getMovies() independently → N parallel Firestore
 * reads, stale the moment data changes, zero cross-tab sync, O(views) reads.
 *
 * Solution: one watchMovies() onSnapshot listener for the whole session.
 * All views subscribe() and re-render reactively — O(1) Firestore reads,
 * instant cross-view/cross-tab propagation, offline cache works for free.
 *
 * API:
 *   init()            → Promise<state>   — start the watcher (idempotent)
 *   subscribe(key,fn) → unsubscribe()    — reactive updates
 *   getState()        → { movies, updatedAt, ready }
 *   patchMovie(id,p)  → void             — optimistic local update after write
 *   destroy()         → void             — call on logout only
 */

import { watchMovies } from '../data/repo.js';

// ── private ────────────────────────────────────────────────────────────────

/** @type {Array|null} null = loading, [] = empty, [...] = loaded */
let _movies      = null;
let _updatedAt   = null;
/** @type {function|null} Firestore onSnapshot handle */
let _unsubscribe = null;
/** @type {Map<string, function>} key → state-change callback */
const _subs      = new Map();
/** Pending promises waiting for the first snapshot */
let _resolvers   = [];
let _ready       = false;

// ── public ─────────────────────────────────────────────────────────────────

/**
 * Initialise the singleton Firestore watcher.
 * Idempotent — safe to call from every view's mount().
 * Resolves immediately if already ready; queues alongside other callers
 * if still in flight.
 * @returns {Promise<{movies:Array, updatedAt:number, ready:boolean}>}
 */
export function init() {
    if (_ready) return Promise.resolve(getState());

    return new Promise((resolve, reject) => {
        _resolvers.push(resolve);

        // Only open the Firestore listener once
        if (_unsubscribe) return;

        _unsubscribe = watchMovies(movies => {
            _movies    = movies;
            _updatedAt = Date.now();

            _broadcast();

            if (!_ready) {
                _ready = true;
                const snap = getState();
                _resolvers.forEach(r => r(snap));
                _resolvers = [];
            }
        });
    });
}

/**
 * Subscribe to store state changes.
 * - `key` must be unique per component instance (e.g. 'archive', 'home').
 * - If movies are already loaded, `fn` is called synchronously before returning.
 * - Returns a no-arg unsubscribe function.
 *
 * @param {string}   key
 * @param {function} fn   — receives { movies: Array, updatedAt: number, ready: boolean }
 * @returns {function}    — call to stop receiving updates
 */
export function subscribe(key, fn) {
    _subs.set(key, fn);
    if (_movies !== null) {
        try { fn(getState()); } catch (e) { console.warn('[store] subscriber error:', key, e); }
    }
    return () => _subs.delete(key);
}

/**
 * Shallow-copy snapshot of current state.
 * movies is always a new array so subscribers cannot mutate internal state.
 */
export function getState() {
    return {
        movies:    _movies ? [..._movies] : _movies,
        updatedAt: _updatedAt,
        ready:     _ready,
    };
}

/**
 * Apply an optimistic patch to a single movie in memory.
 * Does NOT touch Firestore — callers must use repo.js for that.
 * Broadcasts immediately so every subscribed view reflects the write
 * before the Firestore snapshot round-trips.
 *
 * @param {string} id     — Firestore document id
 * @param {object} patch  — partial movie fields to merge
 */
export function patchMovie(id, patch) {
    if (!_movies) return;
    const idx = _movies.findIndex(m => m.id === id);
    if (idx < 0) return;
    _movies = [..._movies];
    _movies[idx] = { ..._movies[idx], ...patch };
    _updatedAt   = Date.now();
    _broadcast();
}

/**
 * Add a new movie optimistically (before Firestore snapshot arrives).
 * @param {object} movie — must include at least { id }
 */
export function appendMovie(movie) {
    if (!_movies) return;
    if (_movies.find(m => m.id === movie.id)) return patchMovie(movie.id, movie);
    _movies    = [..._movies, movie];
    _updatedAt = Date.now();
    _broadcast();
}

/**
 * Remove a movie optimistically.
 * @param {string} id
 */
export function removeMovie(id) {
    if (!_movies) return;
    _movies    = _movies.filter(m => m.id !== id);
    _updatedAt = Date.now();
    _broadcast();
}

/**
 * Tear down the store completely (call on logout, not on view unmount).
 */
export function destroy() {
    if (_unsubscribe) { try { _unsubscribe(); } catch {} }
    _unsubscribe = null;
    _movies      = null;
    _updatedAt   = null;
    _subs.clear();
    _resolvers   = [];
    _ready       = false;
}

// ── private ─────────────────────────────────────────────────────────────────

function _broadcast() {
    const snap = getState();
    for (const [key, fn] of _subs) {
        try { fn(snap); } catch (e) { console.warn('[store] subscriber error:', key, e); }
    }
}
