/** OMDb — direct API client (no proxy). */

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

export async function imdbRating({ imdbId, title, year } = {}) {
    if (!imdbId && !title) return { rating: null };
    try {
        const res = await fetchOMDb({ imdbId, title, year });
        return res || { rating: null };
    } catch {
        return { rating: null };
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
