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
import { imdbRating, imdbFull } from '../services/omdb.js';
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
      <div class="modal-bg-glow"></div>
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
            const [tmdb, omdb] = await Promise.all([
                movieDetails(tmdbId, 'credits,videos,external_ids'),
                imdbFull({ title: d.title, year: d.year }),
            ]);
            const director = tmdb.credits?.crew?.find(c => c.job === 'Director');
            const cast     = (tmdb.credits?.cast || []).slice(0, 6).map(c => c.name);

            // Trailer: prefer official YouTube trailer
            const trailer = (tmdb.videos?.results || []).find(
                v => v.site === 'YouTube' && v.type === 'Trailer' && v.official
            ) || (tmdb.videos?.results || []).find(
                v => v.site === 'YouTube' && v.type === 'Trailer'
            );

            // Rotten Tomatoes score from OMDb Ratings array
            const rtEntry = (omdb?.Ratings || []).find(r => r.Source === 'Rotten Tomatoes');
            const rtScore = rtEntry ? rtEntry.Value : null; // e.g. "88%"

            // Use imdb_id from TMDB external_ids for more reliable OMDb match
            const imdbId = tmdb.external_ids?.imdb_id || omdb?.imdbID || null;
            let imdbRatingVal = omdb?.imdbRating || d.imdbRating || null;
            // If OMDb lookup by title/year failed, retry with imdbId
            if (!imdbRatingVal && imdbId) {
                const retry = await imdbFull({ imdbId }).catch(() => null);
                if (retry?.imdbRating) {
                    imdbRatingVal = retry.imdbRating;
                    const rtE2 = (retry?.Ratings || []).find(r => r.Source === 'Rotten Tomatoes');
                    if (rtE2) Object.assign(omdb || {}, { _rt: rtE2.Value });
                }
            }

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
                imdbRating:       imdbRatingVal,
                imdbVotes:        omdb?.imdbVotes || d.imdbVotes,
                rtScore:          rtScore || omdb?._rt || null,
                metascore:        omdb?.metascore || d.metascore || null,
                tmdbRating:       tmdb.vote_average || d.tmdbRating || null,
                trailerKey:       trailer?.key || null,
                _posterPath:      tmdb.poster_path || null,
            });
        }
    } catch {}

    // ── Render modal shell ────────────────────────────────────────────────────
    const modal = overlay.querySelector('.modal');
    modal.innerHTML = _renderModal(d, options);
    // Backdrop glow keyed to director accent
    const acc = _directorAccent(d.director);
    overlay.style.setProperty('--modal-acc', acc);
    const bgGlow = overlay.querySelector('.modal-bg-glow');
    if (bgGlow) bgGlow.style.background =
        `radial-gradient(ellipse at 40% 50%, ${acc}1e 0%, transparent 62%)`;

    // Replace static poster with optimized img element (keep corner decorations)
    const posterWrap = modal.querySelector('.dm-poster');
    if (posterWrap) {
        // Keep corner elements, insert img before them
        const corners = posterWrap.innerHTML; // save corner spans
        if (d._posterPath) {
            const img = posterImg(d._posterPath, { context: 'modal', alt: d.title || '' });
            posterWrap.innerHTML = corners;
            posterWrap.insertBefore(img, posterWrap.firstChild);
        } else if (d.poster) {
            posterWrap.innerHTML = `<img src="${esc(d.poster)}" alt="${esc(d.title || '')}" style="width:100%;height:100%;object-fit:cover;">${corners}`;
        }
        // Poster lightbox on click
        const posterSrc = d._posterPath ? posterUrl(d._posterPath, 'w780') : d.poster;
        if (posterSrc) {
            posterWrap.addEventListener('click', () => _openLightbox(posterSrc, d.title || ''));
            posterWrap.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _openLightbox(posterSrc, d.title || ''); }});
        }
    }

    modal.querySelector('.modal-close')?.addEventListener('click', close);

    // ── Trailer button ────────────────────────────────────────────────────────
    modal.querySelector('[data-action="trailer"]')?.addEventListener('click', () => {
        const url = d.trailerKey
            ? `https://www.youtube.com/watch?v=${d.trailerKey}`
            : `https://www.youtube.com/results?search_query=${encodeURIComponent((d.title || '') + ' ' + (d.year || '') + ' official trailer')}`;
        window.open(url, '_blank', 'noopener');
    });

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
            <h4 class="providers-title">${i18n.t('where_to_watch')}</h4>
            ${flatrate.length ? `
              <div class="providers-row">
                <span class="providers-label">${i18n.t('stream_label')}</span>
                <div class="providers-logos">${flatrate.slice(0, 6).map(_providerChip).join('')}</div>
              </div>` : ''}
            ${rent.length ? `
              <div class="providers-row">
                <span class="providers-label">${i18n.t('rent_label')}</span>
                <div class="providers-logos">${rent.slice(0, 4).map(_providerChip).join('')}</div>
              </div>` : ''}
            ${buy.length ? `
              <div class="providers-row">
                <span class="providers-label">${i18n.t('buy_label')}</span>
                <div class="providers-logos">${buy.slice(0, 4).map(_providerChip).join('')}</div>
              </div>` : ''}
            <a href="${esc(link)}" target="_blank" rel="noopener noreferrer" class="providers-link">
              ${i18n.t('all_options_tmdb')} ↗
            </a>
            <p class="providers-credit">${i18n.t('provided_by_justwatch')}</p>
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
    const year     = d.year || (d.releaseDate || '').slice(0, 4);
    const lang     = _langName(d.originalLanguage);
    const country  = (d.countries || [])[0] || '';
    const runtime  = d.runtime ? _fmtRuntime(d.runtime) : '';
    const mode     = options.mode || 'explore';

    // ── Eyebrow ───────────────────────────────────────────────────────────────
    const eyebrow = d.watchedDate
        ? `WATCHED ${_fmtDateLong(d.watchedDate)}`
        : mode === 'explore' ? 'DISCOVER' : '';

    // ── Meta line ─────────────────────────────────────────────────────────────
    const metaParts = [year, runtime, lang, country].filter(Boolean);
    const metaLine  = metaParts.join('<span class="dm-sep"> · </span>');

    // ── Genre pills ───────────────────────────────────────────────────────────
    const genrePills = (d.genres || []).slice(0, 4)
        .map(g => `<span class="dm-genre-pill">${esc(g)}</span>`).join('');

    // ── Ratings bar ───────────────────────────────────────────────────────────
    const userRating = d.rating != null ? Number(d.rating).toFixed(1) : null;
    const imdbVal    = d.imdbRating ? parseFloat(d.imdbRating) : null;
    const vsWorld    = (userRating && imdbVal)
        ? (parseFloat(userRating) - imdbVal).toFixed(1) : null;
    const vsSign  = vsWorld && parseFloat(vsWorld) > 0 ? '+' : '';
    const vsColor = vsWorld
        ? (parseFloat(vsWorld) > 0 ? 'var(--green)' : parseFloat(vsWorld) < 0 ? 'var(--red)' : 'var(--ink-dim)')
        : 'var(--ink-dim)';
    const rtVal   = d.rtScore || null;
    const rtNum   = rtVal ? parseInt(rtVal) : null;
    const rtColor = !rtNum      ? 'var(--ink-mute)'
                  : rtNum >= 75 ? '#E05050'
                  : rtNum >= 60 ? '#D4924A'
                  :               '#7A7A7A';

    // ── Action buttons ────────────────────────────────────────────────────────
    const trailerBtn = `<button class="dm-action-btn dm-action-primary" data-action="trailer" aria-label="${i18n.t('trailer')}">&#9654; ${i18n.t('trailer')}</button>`;
    let editBtn = '', favBtn = '';
    if (mode === 'explore') {
        editBtn = `<button class="dm-action-btn" data-action="watch">${i18n.t('mark_watched')}</button>`;
        favBtn  = `<button class="dm-action-btn" data-action="add-wl">${i18n.t('add_watchlist')}</button>`;
    } else if (mode === 'watchlist') {
        editBtn = `<button class="dm-action-btn" data-action="watch">${i18n.t('mark_watched')}</button>`;
        favBtn  = `<button class="dm-action-btn${d.isFavorite ? ' active' : ''}" data-action="fav">&#9825; ${i18n.t('favorites')}</button>`;
    } else {
        editBtn = `<button class="dm-action-btn" data-action="watch">${i18n.t('edit_vote')}</button>`;
        favBtn  = `<button class="dm-action-btn" data-action="fav">&#9825; ${i18n.t('favorites')}</button>`;
    }

    // ── ELO stats ─────────────────────────────────────────────────────────────
    const eloScore  = d.elo     || null;
    const battles   = d.matches || null;
    const tier      = eloScore ? _eloTier(eloScore) : null;
    const canonRank = d.canonRank || null;

    const statsBar = (eloScore || battles || tier) ? `
      <div class="dm-stats-bar">
        ${eloScore  ? `<div class="dm-stat"><div class="dm-stat-val" style="color:var(--gold)">${eloScore}</div><div class="dm-stat-label">ELO SCORE</div></div>` : ''}
        ${canonRank ? `<div class="dm-stat"><div class="dm-stat-val" style="color:var(--gold)">#${canonRank}</div><div class="dm-stat-label">IN YOUR CANON</div></div>` : ''}
        ${battles   ? `<div class="dm-stat"><div class="dm-stat-val">${battles}</div><div class="dm-stat-label">BATTLES</div></div>` : ''}
        ${tier      ? `<div class="dm-stat"><div class="dm-stat-val" style="font-size:.82rem;letter-spacing:.06em">${tier.toUpperCase()}</div><div class="dm-stat-label">TIER</div></div>` : ''}
      </div>` : '';

    // ── Metacritic ──────────────────────────────────────────────────────────
    const metaVal   = d.metascore ? parseInt(d.metascore) : null;
    const metaColor = !metaVal      ? 'var(--ink-mute)'
                    : metaVal >= 61 ? '#66cc33'
                    : metaVal >= 40 ? '#ffcc33'
                    :                 '#ff0000';

    // ── TMDB ─────────────────────────────────────────────────────────────────
    const tmdbVal = d.tmdbRating ? parseFloat(d.tmdbRating) : null;

    return `
      <button class="modal-close" aria-label="Close">&times;</button>

      <div class="dm-hero" role="banner">
        <div class="dm-poster-wrap">
          <div class="dm-poster" role="button" tabindex="0" aria-label="${esc(d.title || '')} — ${i18n.t('view_poster')}">
            <span class="dm-corner dm-corner-tl"></span>
            <span class="dm-corner dm-corner-tr"></span>
            <span class="dm-corner dm-corner-bl"></span>
            <span class="dm-corner dm-corner-br"></span>
          </div>
          ${year ? `<div class="dm-poster-year">${year}</div>` : ''}
        </div>
        <div class="dm-info">
          ${eyebrow ? `<div class="dm-eyebrow">${eyebrow}</div>` : ''}
          <h2 class="dm-title">${esc(d.title || '')}</h2>
          <div class="dm-meta">${metaLine}</div>
          ${d.director ? `<div class="dm-director">${esc(d.director)}</div>` : ''}
          ${genrePills ? `<div class="dm-genres">${genrePills}</div>` : ''}
        </div>
      </div>

      <div class="dm-ratings" role="region" aria-label="Ratings">
        <div class="dm-rating-col">
          <div class="dm-rating-label">YOUR RATING</div>
          <div class="dm-rating-val">${userRating ? `&#9733; ${userRating}` : '&mdash;'}</div>
        </div>
        <div class="dm-rating-col">
          <div class="dm-rating-label"><span class="dm-imdb-badge">IMDb</span></div>
          <div class="dm-rating-val">${imdbVal ? `${imdbVal.toFixed(1)} <span class="dm-rating-sub">/10</span>` : '&mdash;'}</div>
        </div>
        <div class="dm-rating-col">
          <div class="dm-rating-label" style="color:${rtColor}">TOMATOMETER</div>
          <div class="dm-rating-val"  style="color:${rtColor}">${rtVal || '&mdash;'}</div>
        </div>
        ${metaVal ? `<div class="dm-rating-col">
          <div class="dm-rating-label" style="color:${metaColor}">METACRITIC</div>
          <div class="dm-rating-val" style="color:${metaColor}">${metaVal} <span class="dm-rating-sub">/100</span></div>
        </div>` : ''}
        ${tmdbVal ? `<div class="dm-rating-col">
          <div class="dm-rating-label" style="color:#01d277">TMDB</div>
          <div class="dm-rating-val" style="color:#01d277">${tmdbVal.toFixed(1)} <span class="dm-rating-sub">/10</span></div>
        </div>` : ''}
        <div class="dm-rating-col">
          <div class="dm-rating-label">VS WORLD</div>
          <div class="dm-rating-val"  style="color:${vsColor}">${vsWorld ? `${vsSign}${vsWorld}` : '&mdash;'}</div>
        </div>
      </div>

      <div class="dm-actions modal-actions">
        ${trailerBtn}${editBtn}${favBtn}
      </div>

      ${d.plot ? `
      <div class="dm-section">
        <div class="dm-section-label">${i18n.t('synopsis').toUpperCase()}</div>
        <p class="dm-synopsis">${esc(d.plot)}</p>
      </div>` : ''}

      ${d.notes ? `
      <div class="dm-section">
        <div class="dm-section-label">${i18n.t('your_notes').toUpperCase()}</div>
        <p class="dm-synopsis" style="font-style:italic">&ldquo;${esc(d.notes)}&rdquo;</p>
      </div>` : ''}

      <div class="dm-details">
        ${_dmRow('DIRECTOR', d.director)}
        ${_dmRow('CAST',     (d.cast || []).join(', '))}
        ${d.awards ? `<div class="dm-detail-row"><span class="dm-detail-label">AWARDS</span><span class="dm-detail-value" style="color:var(--gold-h)">${esc(d.awards)}</span></div>` : ''}
        ${_dmRow('COUNTRY',  (d.countries || []).join(', '))}
        ${_dmRow('LANGUAGE', lang)}
        ${d.watchedDate ? _dmRow('WATCHED', _fmtDate(d.watchedDate)) : ''}
        ${runtime ? _dmRow('RUNTIME', runtime) : ''}
      </div>

      ${statsBar}`;
}

function _dmRow(label, value) {
    if (!value) return '';
    return `<div class="dm-detail-row"><span class="dm-detail-label">${label}</span><span class="dm-detail-value">${esc(value)}</span></div>`;
}

function _row(label, value) { return _dmRow(label, value); }

function _fmtDate(d) {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return [day, m, y].filter(Boolean).join('/');
}

function _fmtDateLong(d) {
    if (!d) return '';
    try {
        return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
    } catch { return _fmtDate(d); }
}

function _fmtRuntime(min) {
    if (!min) return '';
    const h = Math.floor(min / 60), m = min % 60;
    return h ? `${h}h ${m}m` : `${m}m`;
}

function _eloTier(elo) {
    if (elo >= 1400) return 'Masterwork';
    if (elo >= 1350) return 'Prestige';
    if (elo >= 1300) return 'Notable';
    if (elo >= 1250) return 'Solid';
    return 'Emerging';
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

const _ACCENTS = {
    'Akira Kurosawa':'#C0A060','Wong Kar-wai':'#D86878','Stanley Kubrick':'#80B4D8',
    'David Lynch':'#A878E0','Sergio Leone':'#D8985A','Andrei Tarkovsky':'#80A878',
    'Martin Scorsese':'#C06868','Ingmar Bergman':'#B0A8A8','Bong Joon-ho':'#64C888',
    'Alfonso Cuarón':'#A0B8C8','Céline Sciamma':'#D08898','Barry Jenkins':'#6898D8',
    'Robert Eggers':'#B8B0A0','Ari Aster':'#C89A58','Damien Chazelle':'#D8B84A',
    'Asghar Farhadi':'#C8B080','Quentin Tarantino':'#D08840','Nicolas Winding Refn':'#6898E8',
    'Paul Thomas Anderson':'#B89870','Alex Garland':'#78A8A8','Todd Phillips':'#C07858',
    'Yorgos Lanthimos':'#9090C8','Joel Coen':'#A8A088','Spike Jonze':'#88A8C8',
    'Noah Baumbach':'#98A890','Thomas Vinterberg':'#98A8B8','Fernando Meirelles':'#D88050',
    'Vittorio De Sica':'#D09868',
};

function _directorAccent(director) {
    if (!director) return '#C8A97E';
    return _ACCENTS[director] || '#C8A97E';
}

// ── Poster lightbox ──────────────────────────────────────────────────────

function _openLightbox(src, title) {
    const lb = document.createElement('div');
    lb.className = 'poster-lightbox';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-label', title);
    lb.innerHTML = `
      <button class="poster-lightbox-close" aria-label="Close">&times;</button>
      <img src="${esc(src)}" alt="${esc(title)}" class="poster-lightbox-img">`;

    const closeLb = () => { lb.remove(); document.removeEventListener('keydown', onLbKey); };
    const onLbKey = e => { if (e.key === 'Escape') closeLb(); };
    document.addEventListener('keydown', onLbKey);
    lb.addEventListener('click', e => { if (e.target === lb) closeLb(); });
    lb.querySelector('.poster-lightbox-close').addEventListener('click', closeLb);

    document.body.appendChild(lb);
    lb.querySelector('.poster-lightbox-close').focus();
}
