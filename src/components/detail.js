/**
 * Detail modal — deep inspection layer for films.
 *
 * Part 9 — Streaming Availability
 * Appends a "Where to Watch" section fetched from TMDB Watch Providers API.
 * - Region auto-detected from timezone; overrideable.
 * - Provider logos loaded lazily (decoding=async, loading=lazy).
 * - Response cached 24 h in sessionStorage via tmdb.js.
 * - Graceful fallback: if providers unavailable, section hides itself.
 */

import { movieDetails, posterUrl, posterImg, watchProviders } from '../services/tmdb.js';
import { imdbRating } from '../services/omdb.js';
import { addMovie, updateMovie } from '../data/repo.js';
import { openWatchedModal } from './watched.js';
import i18n from '../core/i18n.js';

// ── Known streaming services (for priority ordering + display names) ───────
const KNOWN_PROVIDERS = {
    8:    { name: 'Netflix',      color: '#e50914' },
    9:    { name: 'Amazon Prime', color: '#00a8e0' },
    337:  { name: 'Disney+',      color: '#113ccf' },
    350:  { name: 'Apple TV+',    color: '#000000' },
    569:  { name: 'MUBI',         color: '#0b0b0b' },
    1870: { name: 'MUBI',         color: '#0b0b0b' },  // MUBI alternate id
    283:  { name: 'Crunchyroll',  color: '#f47521' },
    384:  { name: 'HBO Max',      color: '#5a189a' },
    15:   { name: 'Hulu',         color: '#1ce783' },
    386:  { name: 'Peacock',      color: '#f7e229' },
};

export async function openDetail(movie, options = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-loading">
          <div class="sk" style="width:48px;height:48px;border-radius:50%;margin:0 auto"></div>
          <p style="color:var(--ink-mute);margin-top:14px">${i18n.t('loading')}</p>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    function close() {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
    }

    let d = { ...movie };

    // ── Fetch TMDB + OMDB data ────────────────────────────────────────────────
    try {
        const tmdbId = d.tmdbId || d.id;
        if (tmdbId) {
            const [tmdb, imdb] = await Promise.all([
                movieDetails(tmdbId, 'credits'),
                imdbRating({ title: d.title, year: d.year }),
            ]);
            const director = tmdb.credits?.crew?.find(c => c.job === 'Director');
            const cast     = (tmdb.credits?.cast || []).slice(0, 6).map(c => c.name);
            Object.assign(d, {
                director:         director?.name || d.director || '',
                cast,
                genres:           (tmdb.genres || []).map(g => g.name),
                genreIds:         (tmdb.genres || []).map(g => g.id),
                runtime:          tmdb.runtime,
                originalLanguage: tmdb.original_language,
                countries:        (tmdb.production_countries || []).map(c => c.name),
                releaseDate:      tmdb.release_date || d.releaseDate,
                plot:             tmdb.overview || d.plot,
                poster:           posterUrl(tmdb.poster_path) || d.poster,
                backdropPath:     tmdb.backdrop_path || d.backdropPath || null,
                popularity:       tmdb.popularity,
                imdbRating:       imdb.rating || d.imdbRating,
                imdbVotes:        imdb.votes  || d.imdbVotes,
                _posterPath:      tmdb.poster_path || null,
            });
        }
    } catch {}

    // ── Render modal shell ────────────────────────────────────────────────────
    const modal = overlay.querySelector('.modal');
    modal.innerHTML = _renderModal(d, options);

    // Replace static poster with optimized img element
    const posterWrap = modal.querySelector('.modal-poster');
    if (posterWrap && d._posterPath) {
        posterWrap.innerHTML = '';
        posterWrap.appendChild(posterImg(d._posterPath, { context: 'modal', alt: d.title || '' }));
    }

    modal.querySelector('.modal-close')?.addEventListener('click', close);

    // ── Streaming providers (async, appended after modal renders) ─────────────
    const tmdbId = d.tmdbId || d.id;
    if (tmdbId) _appendProviders(modal, tmdbId);

    // ── Add to watchlist ──────────────────────────────────────────────────────
    modal.querySelector('[data-action="add-wl"]')?.addEventListener('click', async btn_ => {
        const btn = modal.querySelector('[data-action="add-wl"]');
        btn.disabled = true; btn.textContent = i18n.t('saved');
        try {
            await addMovie(_enrichedPayload(d, true));
            if (options.onAdd) options.onAdd(d);
        } catch { btn.textContent = i18n.t('error'); btn.disabled = false; }
    });

    // ── Mark as watched ───────────────────────────────────────────────────────
    modal.querySelector('[data-action="watch"]')?.addEventListener('click', () => {
        openWatchedModal(d, {
            initialRating:  d.rating,
            initialDate:    d.watchedDate,
            initialNotes:   d.notes,
            initialRewatch: d.isRewatch,
            onSave: async data => {
                if (d.id) {
                    await updateMovie(d.id, data);
                    if (options.onUpdate) options.onUpdate({ ...d, ...data });
                } else {
                    await addMovie({ ..._enrichedPayload(d, false), ...data });
                    if (options.onAdd) options.onAdd({ ...d, ...data });
                }
                close();
            },
        });
    });

    // ── Favorite toggle ───────────────────────────────────────────────────────
    const favBtn = modal.querySelector('[data-action="fav"]');
    if (favBtn && d.id) {
        favBtn.addEventListener('click', async () => {
            d.isFavorite = !d.isFavorite;
            favBtn.textContent    = d.isFavorite ? `♥ ${i18n.t('saved')}` : `♡ ${i18n.t('favorites')}`;
            favBtn.classList.toggle('btn-accent', d.isFavorite);
            try { await updateMovie(d.id, { isFavorite: d.isFavorite }); } catch {}
            if (options.onUpdate) options.onUpdate(d);
        });
    }

    return { close, data: d };
}

// ── Streaming providers section ────────────────────────────────────────────

async function _appendProviders(modal, tmdbId) {
    // Insert placeholder
    const placeholder = document.createElement('div');
    placeholder.className = 'providers-wrap';
    placeholder.innerHTML = '<div class="providers-loading"><div class="sk" style="height:32px;width:160px;border-radius:8px"></div></div>';
    const actionsEl = modal.querySelector('.modal-actions');
    if (actionsEl) modal.insertBefore(placeholder, actionsEl);

    try {
        const providers = await watchProviders(tmdbId);
        const { flatrate, rent, buy, link } = providers;

        if (!flatrate.length && !rent.length && !buy.length) {
            placeholder.remove();
            return;
        }

        placeholder.innerHTML = `
          <div class="providers-section">
            <h4 class="providers-title">Where to Watch</h4>
            ${flatrate.length ? `
              <div class="providers-row">
                <span class="providers-label">Stream</span>
                <div class="providers-logos">${flatrate.slice(0, 6).map(_providerChip).join('')}</div>
              </div>` : ''}
            ${rent.length ? `
              <div class="providers-row">
                <span class="providers-label">Rent</span>
                <div class="providers-logos">${rent.slice(0, 4).map(_providerChip).join('')}</div>
              </div>` : ''}
            ${buy.length ? `
              <div class="providers-row">
                <span class="providers-label">Buy</span>
                <div class="providers-logos">${buy.slice(0, 4).map(_providerChip).join('')}</div>
              </div>` : ''}
            <a href="${esc(link)}" target="_blank" rel="noopener noreferrer" class="providers-link">
              All options on TMDB ↗
            </a>
            <p class="providers-credit">Provided by JustWatch</p>
          </div>`;

        // Wire logo clicks to provider link
        placeholder.querySelectorAll('[data-plink]').forEach(chip => {
            chip.addEventListener('click', () => window.open(link, '_blank', 'noopener'));
        });
    } catch {
        placeholder.remove();
    }
}

function _providerChip(p) {
    const known = KNOWN_PROVIDERS[p.provider_id];
    const logo  = p.logo_path ? `https://image.tmdb.org/t/p/w45${p.logo_path}` : '';
    const name  = known?.name || p.provider_name;
    return `
      <button class="provider-chip" title="${esc(name)}" data-plink="1" style="${known ? `--p-color:${known.color}` : ''}">
        ${logo ? `<img src="${esc(logo)}" alt="${esc(name)}" loading="lazy" decoding="async" width="28" height="28">` : `<span>${esc(name.slice(0,2))}</span>`}
      </button>`;
}

// ── Rendering helpers ──────────────────────────────────────────────────────

function _enrichedPayload(d, isWatchlist) {
    return {
        title: d.title, plot: d.plot || '', poster: d.poster,
        year:  d.year || (d.releaseDate || '').slice(0, 4),
        tmdbId: d.tmdbId || d.id, isWatchlist, rating: null,
        director: d.director, cast: d.cast || [], genres: d.genres || [],
        genreIds: d.genreIds || [], runtime: d.runtime || null,
        originalLanguage: d.originalLanguage || '', countries: d.countries || [],
        releaseDate: d.releaseDate || '', imdbRating: d.imdbRating || null,
        imdbVotes: d.imdbVotes || null, popularity: d.popularity || 0,
        backdropPath: d.backdropPath || null, isFavorite: false,
    };
}

function _renderModal(d, options = {}) {
    const year    = d.year || (d.releaseDate || '').slice(0, 4);
    const runtime = d.runtime ? `${d.runtime} min` : '';
    const genres  = (d.genres || []).join(', ');
    const meta    = [year, runtime, genres].filter(Boolean).join('<span class="sep"> · </span>');
    const mode    = options.mode || 'explore';

    let actions = '';
    if (mode === 'explore') {
        actions = `
          <button class="btn btn-accent" data-action="watch">${i18n.t('mark_watched')}</button>
          <button class="btn"            data-action="add-wl">${i18n.t('add_watchlist')}</button>`;
    } else if (mode === 'watchlist') {
        const fCls = d.isFavorite ? 'btn btn-accent btn-sm' : 'btn btn-sm';
        actions = `
          <button class="btn btn-accent" data-action="watch">${i18n.t('mark_watched')}</button>
          <button class="${fCls}"        data-action="fav">${d.isFavorite ? `♥ ${i18n.t('saved')}` : `♡ ${i18n.t('favorites')}`}</button>`;
    } else {
        const fCls = d.isFavorite ? 'btn btn-accent btn-sm' : 'btn btn-sm';
        actions = `
          <button class="btn"     data-action="watch">${i18n.t('edit_vote')}</button>
          <button class="${fCls}" data-action="fav">${d.isFavorite ? `♥ ${i18n.t('saved')}` : `♡ ${i18n.t('favorites')}`}</button>`;
    }

    const userRating = d.rating != null
        ? `<span class="user-badge">★ ${Number(d.rating).toFixed(1)}</span>` : '';

    return `
      <button class="modal-close">&times;</button>
      <div class="modal-hero">
        <div class="modal-poster">
          <img alt="" src="${esc(d.poster || '')}">
        </div>
        <div class="modal-info">
          <h2 class="modal-title">${esc(d.title || '')}</h2>
          <div class="modal-meta">${meta}</div>
          <div class="modal-rating">
            ${d.imdbRating ? `<span class="imdb-badge">IMDb ${esc(String(d.imdbRating))}</span>` : ''}
            ${userRating}
            ${d.imdbVotes ? `<span class="imdb-votes">${esc(String(d.imdbVotes))} ${i18n.t('votes')}</span>` : ''}
          </div>
          ${d.watchedDate ? `<div style="font-size:.8rem;color:var(--ink-mute);margin-bottom:8px">${i18n.t('seen_on')} ${_fmtDate(d.watchedDate)}</div>` : ''}
          ${d.notes ? `<div style="font-size:.84rem;color:var(--ink-dim);margin-bottom:10px;font-style:italic">"${esc(d.notes)}"</div>` : ''}
          ${d.plot ? `<p class="modal-plot">${esc(d.plot)}</p>` : ''}
        </div>
      </div>
      <div class="modal-details">
        ${_row(i18n.t('director'),      d.director)}
        ${_row(i18n.t('cast'),          (d.cast || []).join(', '))}
        ${_row(i18n.t('languageLabel'), _langName(d.originalLanguage))}
        ${_row(i18n.t('country'),       (d.countries || []).join(', '))}
        ${_row(i18n.t('release'),       _fmtDate(d.releaseDate))}
        ${d.runtime ? _row(i18n.t('runtime'), `${d.runtime} min`) : ''}
      </div>
      <div class="modal-actions">${actions}</div>`;
}

function _row(label, value) {
    if (!value) return '';
    return `<div class="detail-row"><span class="detail-label">${label}</span><span class="detail-value">${esc(value)}</span></div>`;
}

function _fmtDate(d) {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return [day, m, y].filter(Boolean).join('/');
}

function _langName(code) {
    if (!code) return '';
    const n = { en:'English', it:'Italiano', fr:'Français', de:'Deutsch', es:'Español',
                ja:'日本語', ko:'한국어', zh:'中文', pt:'Português', ru:'Русский', hi:'हिन्दी', ar:'العربية' };
    return n[code] || code.toUpperCase();
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
