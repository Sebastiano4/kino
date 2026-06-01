/** Detail modal — deep inspection layer for films. */
import { movieDetails, posterUrl } from '../services/tmdb.js';
import { imdbRating } from '../services/omdb.js';
import { addMovie, updateMovie } from '../data/repo.js';
import { openWatchedModal } from './watched.js';

export async function openDetail(movie, options = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal"><div class="modal-loading"><div class="sk" style="width:48px;height:48px;border-radius:50%;margin:0 auto"></div><p style="color:var(--ink-mute);margin-top:14px">Caricamento…</p></div></div>`;
  document.body.appendChild(overlay);

  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  function close() { overlay.remove(); document.removeEventListener('keydown', onKey); }

  let d = { ...movie };
  try {
    const tmdbId = d.tmdbId || d.id;
    if (tmdbId) {
      const [tmdb, imdb] = await Promise.all([
        movieDetails(tmdbId, 'credits'),
        imdbRating({ title: d.title, year: d.year })
      ]);
      const director = tmdb.credits?.crew?.find(c => c.job === 'Director');
      const cast = (tmdb.credits?.cast || []).slice(0, 6).map(c => c.name);
      Object.assign(d, {
        director: director?.name || d.director || '',
        cast, genres: (tmdb.genres || []).map(g => g.name),
        genreIds: (tmdb.genres || []).map(g => g.id),
        runtime: tmdb.runtime, originalLanguage: tmdb.original_language,
        countries: (tmdb.production_countries || []).map(c => c.name),
        releaseDate: tmdb.release_date || d.releaseDate,
        plot: tmdb.overview || d.plot,
        poster: posterUrl(tmdb.poster_path) || d.poster,
        backdropPath: tmdb.backdrop_path || d.backdropPath || null,
        popularity: tmdb.popularity,
        imdbRating: imdb.rating || d.imdbRating,
        imdbVotes: imdb.votes || d.imdbVotes,
      });
    }
  } catch (_) {}

  const modal = overlay.querySelector('.modal');
  modal.innerHTML = renderModal(d, options);
  modal.querySelector('.modal-close')?.addEventListener('click', close);

  // Add to watchlist (Explore)
  const addBtn = modal.querySelector('[data-action="add-wl"]');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      addBtn.disabled = true; addBtn.textContent = 'Salvato ✓';
      try {
        await addMovie(enrichedPayload(d, true));
        if (options.onAdd) options.onAdd(d);
      } catch { addBtn.textContent = 'Errore'; addBtn.disabled = false; }
    });
  }

  // Mark as watched (all modes)
  const watchBtn = modal.querySelector('[data-action="watch"]');
  if (watchBtn) {
    watchBtn.addEventListener('click', () => {
      openWatchedModal(d, {
        initialRating: d.rating, initialDate: d.watchedDate,
        initialNotes: d.notes, initialRewatch: d.isRewatch,
        onSave: async (data) => {
          if (d.id) {
            await updateMovie(d.id, data);
            if (options.onUpdate) options.onUpdate({ ...d, ...data });
          } else {
            await addMovie({ ...enrichedPayload(d, false), ...data });
            if (options.onAdd) options.onAdd({ ...d, ...data });
          }
          close();
        }
      });
    });
  }

  // Favorite toggle (Archive/Watchlist)
  const favBtn = modal.querySelector('[data-action="fav"]');
  if (favBtn && d.id) {
    favBtn.addEventListener('click', async () => {
      d.isFavorite = !d.isFavorite;
      favBtn.textContent = d.isFavorite ? '♥ Preferito' : '♡ Preferiti';
      favBtn.classList.toggle('btn-accent', d.isFavorite);
      try { await updateMovie(d.id, { isFavorite: d.isFavorite }); } catch {}
      if (options.onUpdate) options.onUpdate(d);
    });
  }

  return { close, data: d };
}

function enrichedPayload(d, isWatchlist) {
  return {
    title: d.title, plot: d.plot || '', poster: d.poster,
    year: d.year || (d.releaseDate || '').slice(0, 4),
    tmdbId: d.tmdbId || d.id, isWatchlist, rating: null,
    director: d.director, cast: d.cast || [], genres: d.genres || [],
    genreIds: d.genreIds || [], runtime: d.runtime || null,
    originalLanguage: d.originalLanguage || '', countries: d.countries || [],
    releaseDate: d.releaseDate || '', imdbRating: d.imdbRating || null,
    imdbVotes: d.imdbVotes || null, popularity: d.popularity || 0,
    backdropPath: d.backdropPath || null, isFavorite: false,
  };
}

function renderModal(d, options = {}) {
  const year = d.year || (d.releaseDate || '').slice(0, 4);
  const runtime = d.runtime ? `${d.runtime} min` : '';
  const genres = (d.genres || []).join(', ');
  const meta = [year, runtime, genres].filter(Boolean).join('<span class="sep"> · </span>');
  const mode = options.mode || 'explore';

  let actions = '';
  if (mode === 'explore') {
    actions = `
      <button class="btn btn-accent" data-action="watch">Segna come visto</button>
      <button class="btn" data-action="add-wl">+ Watchlist</button>`;
  } else if (mode === 'watchlist') {
    const favLabel = d.isFavorite ? '♥ Preferito' : '♡ Preferiti';
    const favClass = d.isFavorite ? 'btn btn-accent btn-sm' : 'btn btn-sm';
    actions = `
      <button class="btn btn-accent" data-action="watch">Segna come visto</button>
      <button class="${favClass}" data-action="fav">${favLabel}</button>`;
  } else {
    const favLabel = d.isFavorite ? '♥ Preferito' : '♡ Preferiti';
    const favClass = d.isFavorite ? 'btn btn-accent btn-sm' : 'btn btn-sm';
    actions = `
      <button class="btn" data-action="watch">Modifica voto</button>
      <button class="${favClass}" data-action="fav">${favLabel}</button>`;
  }

  // User rating badge
  const userRating = d.rating != null ? `<span class="user-badge">★ ${Number(d.rating).toFixed(1)}</span>` : '';

  return `
    <button class="modal-close">&times;</button>
    <div class="modal-hero">
      <div class="modal-poster"><img alt="" src="${esc(d.poster || '')}"></div>
      <div class="modal-info">
        <h2 class="modal-title">${esc(d.title || '')}</h2>
        <div class="modal-meta">${meta}</div>
        <div class="modal-rating">
          ${d.imdbRating ? `<span class="imdb-badge">IMDb ${esc(d.imdbRating)}</span>` : ''}
          ${userRating}
          ${d.imdbVotes ? `<span class="imdb-votes">${esc(String(d.imdbVotes))} voti</span>` : ''}
        </div>
        ${d.watchedDate ? `<div style="font-size:.8rem;color:var(--ink-mute);margin-bottom:8px">Visto il ${fmtDate(d.watchedDate)}</div>` : ''}
        ${d.notes ? `<div style="font-size:.84rem;color:var(--ink-dim);margin-bottom:10px;font-style:italic">"${esc(d.notes)}"</div>` : ''}
        ${d.plot ? `<p class="modal-plot">${esc(d.plot)}</p>` : ''}
      </div>
    </div>
    <div class="modal-details">
      ${row('Regista', d.director)}
      ${row('Cast', (d.cast || []).join(', '))}
      ${row('Lingua', langName(d.originalLanguage))}
      ${row('Paesi', (d.countries || []).join(', '))}
      ${row('Uscita', fmtDate(d.releaseDate))}
      ${d.runtime ? row('Durata', `${d.runtime} min`) : ''}
    </div>
    <div class="modal-actions">${actions}</div>`;
}

function row(label, value) {
  if (!value) return '';
  return `<div class="detail-row"><span class="detail-label">${label}</span><span class="detail-value">${esc(value)}</span></div>`;
}
function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return [day, m, y].filter(Boolean).join('/');
}
function langName(code) {
  if (!code) return '';
  const n = { en:'English', it:'Italiano', fr:'Français', de:'Deutsch', es:'Español', ja:'日本語', ko:'한국어', zh:'中文', pt:'Português', ru:'Русский', hi:'हिन्दी', ar:'العربية' };
  return n[code] || code.toUpperCase();
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
