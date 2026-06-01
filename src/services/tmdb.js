/** TMDB via Cloud Function proxy `tmdbProxy`. */
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-functions.js";
import { functions } from '../core/firebase.js';
import { authReady } from '../core/auth.js';

const proxy = httpsCallable(functions, 'tmdbProxy');

async function call(path, params = {}) {
    const u = await authReady();
    if (!u) throw new Error('Devi essere autenticato');
    const r = await proxy({ path, params });
    return r.data;
}

export const searchMovies   = (query, page = 1) => call('/search/movie', { language: 'en-US', query, page });
export const discoverMovies = (params = {}, page = 1) => call('/discover/movie', {
    language: 'en-US', sort_by: 'popularity.desc', page, ...params
});
export const movieDetails = (id, append = '') => call(`/movie/${id}`, { language: 'en-US', ...(append ? { append_to_response: append } : {}) });
export const movieCredits = (id) => call(`/movie/${id}/credits`);
export const movieSimilar = (id) => call(`/movie/${id}/similar`);
export const genreList     = () => call('/genre/movie/list', { language: 'en-US' });

export const posterUrl = (path, size = 'w500') => path ? `https://image.tmdb.org/t/p/${size}${path}` : '';
export const backdropUrl = (path, size = 'w1280') => path ? `https://image.tmdb.org/t/p/${size}${path}` : '';
