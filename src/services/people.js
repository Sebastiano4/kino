/**
 * PEOPLE IMAGES — portrait lookup for actors & directors.
 *
 * Source: Wikipedia (REST summary → search fallback). It is public,
 * CORS-enabled and needs no API key — unlike the TMDB proxy, which currently
 * rejects browser calls. Resolved URLs are cached in localStorage so the same
 * person is never looked up twice; the browser HTTP-caches the image bytes.
 *
 *   personImage(name) → Promise<string|null>
 *     A portrait URL, or null when no usable image exists (the caller then
 *     keeps the initials placeholder). Both outcomes are cached.
 */

const LS_KEY   = 'kino-people-img-v1';
const TTL_HIT  = 60 * 24 * 60 * 60 * 1000; // 60 days for a found portrait
const TTL_MISS =  7 * 24 * 60 * 60 * 1000; //  7 days before retrying a miss
const THUMB_PX = 400;

let _store = null;            // lazy { name: { url:string|null, ts:number } }
const _inflight = new Map();  // name → Promise (dedupe concurrent lookups)

function _load() {
    if (_store) return _store;
    try { _store = JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
    catch { _store = {}; }
    return _store;
}

let _saveTimer = null;
function _persist() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
        try { localStorage.setItem(LS_KEY, JSON.stringify(_store)); } catch {}
    }, 300);
}

/** @returns {string|null|undefined} url, null (known miss), or undefined (stale/unknown). */
function _cached(name) {
    const rec = _load()[name];
    if (!rec) return undefined;
    const ttl = rec.url ? TTL_HIT : TTL_MISS;
    if (Date.now() - rec.ts > ttl) return undefined;
    return rec.url;
}

function _remember(name, url) {
    _load()[name] = { url: url || null, ts: Date.now() };
    _persist();
}

// ── Wikipedia lookups ──────────────────────────────────────────────────────

async function _viaRestSummary(name) {
    const title = encodeURIComponent(name.replace(/\s+/g, '_'));
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`,
        { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.type === 'disambiguation') return null;
    return data?.thumbnail?.source || null;
}

async function _viaSearch(name) {
    const params = new URLSearchParams({
        action: 'query', format: 'json', origin: '*',
        generator: 'search', gsrsearch: name, gsrlimit: '1',
        prop: 'pageimages', piprop: 'thumbnail', pithumbsize: String(THUMB_PX),
    });
    const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`);
    if (!res.ok) return null;
    const data  = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    return Object.values(pages)[0]?.thumbnail?.source || null;
}

async function _resolve(name) {
    try { const a = await _viaRestSummary(name); if (a) return a; } catch {}
    try { const b = await _viaSearch(name);      if (b) return b; } catch {}
    return null;
}

/**
 * Resolve a portrait URL for a person by name.
 * @param {string} name
 * @returns {Promise<string|null>}
 */
export function personImage(name) {
    const key = String(name || '').trim();
    if (!key) return Promise.resolve(null);

    const hit = _cached(key);
    if (hit !== undefined) return Promise.resolve(hit);
    if (_inflight.has(key)) return _inflight.get(key);

    const p = _resolve(key)
        .then(url => { _remember(key, url); _inflight.delete(key); return url; })
        .catch(() => { _inflight.delete(key); return null; });
    _inflight.set(key, p);
    return p;
}
