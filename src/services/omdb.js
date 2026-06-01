/** Rating IMDb via Cloud Function `omdbProxy`. */
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-functions.js";
import { functions } from '../core/firebase.js';
import { authReady } from '../core/auth.js';

const proxy = httpsCallable(functions, 'omdbProxy');
const cache = new Map();

async function fetchOMDb(params) {
  const key = params.imdbId || `${params.title}|${params.year}`;
  if (cache.has(key)) return cache.get(key);
  const u = await authReady();
  if (!u) throw new Error('Devi essere autenticato');
  const r = await proxy(params);
  const data = r.data || null;
  if (data) cache.set(key, data);
  return data;
}

export async function imdbRating({ imdbId, title, year } = {}) {
  if (!imdbId && !title) return { rating: null };
  try {
    return await fetchOMDb({ imdbId, title, year }) || { rating: null };
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
