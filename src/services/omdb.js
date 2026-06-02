/** Rating IMDb via Cloud Function `omdbProxy`. */
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-functions.js";
import { functions } from '../core/firebase.js';
import { authReady } from '../core/auth.js';

const proxy = httpsCallable(functions, 'omdbProxy');
const cache = new Map();
const pending = new Map();

// Concurrency queue
const MAX_CONCURRENCY = 5;
let active = 0;
const queue = [];

function schedule(fn) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    runNext();
  });
}

function runNext() {
  if (active >= MAX_CONCURRENCY) return;
  const job = queue.shift();
  if (!job) return;
  active++;
  Promise.resolve()
    .then(() => job.fn())
    .then(res => { active--; job.resolve(res); runNext(); })
    .catch(err => { active--; job.reject(err); runNext(); });
}

function withTimeout(promise, ms = 5000) {
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error('Timeout')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

async function fetchOMDb(params) {
  const key = params.imdbId || `${params.title}|${params.year}`;
  // cached final result
  if (cache.has(key)) return cache.get(key);
  // if a pending request exists, return it
  if (pending.has(key)) return pending.get(key);

  const task = async () => {
    const u = await authReady();
    if (!u) throw new Error('Devi essere autenticato');
    // call proxy with timeout
    const r = await withTimeout(proxy(params), 7000);
    const data = r?.data || null;
    if (data) cache.set(key, data);
    return data;
  };

  const p = schedule(task).finally(() => { pending.delete(key); });
  // store pending promise immediately to dedupe
  pending.set(key, p);
  return p;
}

export async function imdbRating({ imdbId, title, year } = {}) {
  if (!imdbId && !title) return { rating: null };
  try {
    const res = await fetchOMDb({ imdbId, title, year });
    return res || { rating: null };
  } catch (e) {
    return { rating: null };
  }
}

export async function imdbFull({ imdbId, title, year } = {}) {
  if (!imdbId && !title) return null;
  try {
    return await fetchOMDb({ imdbId, title, year });
  } catch (e) {
    return null;
  }
}
