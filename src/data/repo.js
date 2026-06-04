/** DATA LAYER — unico punto che tocca Firestore. */
import { db, APP_ID } from '../core/firebase.js';
import { getUser } from '../core/auth.js';
import {
    collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
    setDoc, serverTimestamp, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { queueOperation, getPending, clearOperation } from './offline.js';

function uid() {
    const u = getUser();
    if (!u) throw new Error('Not authenticated');
    return u.uid;
}

const moviesCol = () => collection(db, 'apps', APP_ID, 'users', uid(), 'movies');
const movieDoc = (id) => doc(db, 'apps', APP_ID, 'users', uid(), 'movies', id);
const matchesCol = () => collection(db, 'apps', APP_ID, 'users', uid(), 'matches');

/**
 * Normalize a raw Firestore movie document into the canonical shape every
 * view/component reads from. Single source of truth for fields that have
 * accumulated legacy aliases across the dataset's history.
 *
 *  - rating    ← rating ?? userRating ?? null   (numeric, never undefined)
 *  - imdbId    ← imdbId || imdbID || imdb || null
 *  - countries ← countries[] | [country] | []   (always an array)
 *
 * Idempotent: safe to run on an already-normalized object.
 */
export function normalizeMovie(m) {
    if (!m || typeof m !== 'object') return m;

    // ── rating: one canonical numeric field ──────────────────────────────
    const rawRating = m.rating ?? m.userRating ?? null;
    const rating = rawRating == null || rawRating === '' ? null : Number(rawRating);

    // ── imdbId: collapse legacy identifier spellings ─────────────────────
    const imdbId = m.imdbId || m.imdbID || m.imdb || null;

    // ── countries: always an array, accept singular `country` string ─────
    let countries;
    if (Array.isArray(m.countries)) {
        countries = m.countries.filter(Boolean);
    } else if (typeof m.countries === 'string' && m.countries.trim()) {
        countries = m.countries.split(',').map(s => s.trim()).filter(Boolean);
    } else if (typeof m.country === 'string' && m.country.trim()) {
        countries = m.country.split(',').map(s => s.trim()).filter(Boolean);
    } else {
        countries = [];
    }

    return { ...m, rating, imdbId, countries };
}

export async function getMovies() {
    const snap = await getDocs(moviesCol());
    return snap.docs.map(d => normalizeMovie({ ...d.data(), id: d.id }));
}

export async function getMovie(id) {
    const snap = await getDoc(movieDoc(id));
    return snap.exists() ? normalizeMovie({ ...snap.data(), id: snap.id }) : null;
}

export async function addMovie(data) {
    // Never persist a client-side `id` into the doc body — the canonical id is
    // the Firestore document id. A stored `id` would shadow it on read and
    // break every later update (not-found). Imports often carry a stale id.
    const { id: _omitId, ...clean } = data || {};
    try {
        const ref = await addDoc(moviesCol(), {
            ...clean, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), order: Date.now()
        });
        return ref.id;
    } catch (e) {
        if (!navigator.onLine) {
            await queueOperation({ op: 'add', col: 'movies', data: clean });
            return `offline-${Date.now()}`;
        }
        throw e;
    }
}

export async function updateMovie(id, patch) {
    try {
        await updateDoc(movieDoc(id), { ...patch, updatedAt: serverTimestamp() });
    } catch (e) {
        if (!navigator.onLine) {
            await queueOperation({ op: 'update', col: 'movies', docId: id, data: patch });
            return;
        }
        throw e;
    }
}

export async function deleteMovie(id) {
    try {
        await deleteDoc(movieDoc(id));
    } catch (e) {
        if (!navigator.onLine) {
            await queueOperation({ op: 'delete', col: 'movies', docId: id });
            return;
        }
        throw e;
    }
}

export function watchMovies(cb) {
    return onSnapshot(moviesCol(), snap => {
        cb(snap.docs.map(d => normalizeMovie({ ...d.data(), id: d.id })));
    });
}

/** Profilo utente (per-app). */
export async function getProfile() {
    const ref = doc(db, 'apps', APP_ID, 'users', uid());
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : {};
}
export async function saveProfile(patch) {
    const ref = doc(db, 'apps', APP_ID, 'users', uid());
    await setDoc(ref, patch, { merge: true });
}

/** Match history (Elo battles). */
export async function addMatch(data) {
    try {
        const ref = await addDoc(matchesCol(), { ...data, createdAt: serverTimestamp() });
        return ref.id;
    } catch (e) {
        if (!navigator.onLine) {
            await queueOperation({ op: 'add', col: 'matches', data });
            return;
        }
        throw e;
    }
}

export async function getMatches() {
    const snap = await getDocs(matchesCol());
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}

export async function deleteMatch(id) {
    if (!id) return;
    try {
        await deleteDoc(doc(db, 'apps', APP_ID, 'users', uid(), 'matches', id));
    } catch {}
}

/** Flush offline queue to Firestore. */
export async function flushOfflineQueue() {
    if (!navigator.onLine) return;
    let pending;
    try { pending = await getPending(); } catch { return; }
    for (const op of pending) {
        try {
            if (op.col === 'movies') {
                if (op.op === 'add') await addDoc(moviesCol(), { ...op.data, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), order: op.data.order || Date.now() });
                else if (op.op === 'update') await updateDoc(movieDoc(op.docId), { ...op.data, updatedAt: serverTimestamp() });
                else if (op.op === 'delete') await deleteDoc(movieDoc(op.docId));
            } else if (op.col === 'matches' && op.op === 'add') {
                await addDoc(matchesCol(), { ...op.data, createdAt: serverTimestamp() });
            }
            await clearOperation(op.id);
        } catch { break; }
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { try { flushOfflineQueue(); } catch {} });
    navigator.serviceWorker?.addEventListener('message', e => {
        if (e.data?.type === 'flush-offline') flushOfflineQueue().catch(() => {});
    });
}

/* ---- export / import ---- */

export function exportMoviesJSON(movies) {
    const clean = movies.map(m => {
        const { id, ...rest } = m;
        return rest;
    });
    download(JSON.stringify(clean, null, 2), 'kino-export.json', 'application/json');
}

export function exportMoviesCSV(movies) {
    const cols = ['title','year','rating','director','genres','imdbRating','runtime',
        'originalLanguage','countries','cast','watchedDate','notes','isWatchlist',
        'isFavorite','isRewatch','releaseDate'];
    const rows = movies.map(m => cols.map(c => {
        let v = m[c];
        if (Array.isArray(v)) v = v.join('; ');
        if (v == null) v = '';
        return `"${String(v).replace(/"/g, '""')}"`;
    }).join(','));
    download([cols.join(','), ...rows].join('\n'), 'kino-export.csv', 'text/csv');
}

export async function importMoviesJSON(jsonArray) {
    const existing = await getMovies();
    const ids = new Set(existing.map(m => m.tmdbId).filter(Boolean));
    let count = 0;
    for (const m of jsonArray) {
        if (m.tmdbId && ids.has(m.tmdbId)) continue;
        await addMovie(m);
        ids.add(m.tmdbId);
        count++;
    }
    return count;
}

function download(content, name, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}
