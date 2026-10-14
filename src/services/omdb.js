/**
 * OMDb client.
 *  - imdbRating(): via the omdbProxy Cloud Function (key on the backend,
 *    7-day Firestore cache shared across users). Used by Explore grids.
 *  - imdbFull():   still direct, because callers need raw fields (Country,
 *    Ratings, Year) that omdbProxy does not return yet.
 */
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-functions.js";
import { functions } from '../core/firebase.js';

const proxy = httpsCallable(functions, 'omdbProxy');

const API_KEY = '3bab6459';
const BASE    = 'https://www.omdbapi.com/';
const cache   = new Map();

async function fetchOMDb(params) {
    const url = new URL(BASE);
    url.searchParams.set('apikey', API_KEY);
    url.searchParams.set('r', 'json');

    if (params.imdbId) {
        url.searchParams.set('i', params.imdbId);
    } else if (params.title) {
        url.searchParams.set('t', params.title);
        if (params.year) url.searchParams.set('y', String(params.year));
    } else {
        return null;
    }

    const key = url.searchParams.get('i') || `${params.title}|${params.year}`;
    if (cache.has(key)) return cache.get(key);

    const res  = await fetch(url.toString());
    if (!res.ok) throw new Error(`OMDb HTTP ${res.status}`);
    const data = await res.json();

    // OMDb returns { Response: "False", Error: "..." } on not found
    if (!data || data.Response === 'False') return null;

    cache.set(key, data);
    return data;
}

/** @returns {Promise<{rating: string|null, error?: true}>} error set when the lookup itself failed */
export async function imdbRating({ imdbId, title, year } = {}) {
    if (!imdbId && !title) return { rating: null };
    try {
        const params = imdbId ? { imdbId } : { title, year };
        const { data } = await proxy(params);
        return { rating: data?.rating || null };
    } catch {
        return { rating: null, error: true };
    }
}

export async function imdbFull({ imdbId, title, year } = {}) {
    if (!imdbId && !title) return null;
    try {
        return await fetchOMDb({ imdbId, title, year });
    } catch {
        return null;
    }
}
