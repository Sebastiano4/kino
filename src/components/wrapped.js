/**
 * KINO WRAPPED — end-of-year personalised cinema stats card.
 *
 * Part 10 — Social Features.
 * Renders a 9:16 story card (1080×1920 logical px) on a hidden Canvas,
 * then exports it as a PNG download + Web Share API on mobile.
 *
 * Content:
 *   - Top 5 films (by user rating)
 *   - Favorite director (most-watched)
 *   - Genre profile (top 3 genres)
 *   - Yearly statistics (films seen, avg rating, total hours)
 *
 * Architecture:
 *   - Pure canvas rendering (no DOM injection, no external image deps)
 *   - Poster images cross-origin via TMDB — canvas is tainted but only used
 *     for dataURL export, not displayed on page
 *   - Fallback: text-only card if any cross-origin image load fails
 *   - On mobile: navigator.share() to Instagram/Stories; desktop: PNG download
 *
 * Usage:
 *   import { openWrapped } from './components/wrapped.js';
 *   openWrapped(movies);  // call from settings or home
 */

export async function openWrapped(movies) {
    const year    = new Date().getFullYear();
    const watched = movies.filter(m => !m.isWatchlist && m.rating != null
        && (m.watchedDate || '').startsWith(String(year)));

    if (watched.length < 3) {
        _showError('Watch at least 3 films this year to unlock Kino Wrapped.');
        return;
    }

    const stats = _computeStats(watched);
    const overlay = _buildOverlay();
    document.body.appendChild(overlay);

    overlay.querySelector('#wrappedClose').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const canvas  = overlay.querySelector('#wrappedCanvas');
    const preview = overlay.querySelector('#wrappedPreview');
    const shareBtn = overlay.querySelector('#wrappedShare');
    const dlBtn    = overlay.querySelector('#wrappedDl');

    try {
        await _drawCard(canvas, stats, year);
        const dataURL = canvas.toDataURL('image/png');
        preview.src   = dataURL;
        preview.hidden = false;
        canvas.hidden  = true;

        dlBtn.addEventListener('click', () => {
            const a = document.createElement('a');
            a.href     = dataURL;
            a.download = `kino-wrapped-${year}.png`;
            a.click();
        });

        if (navigator.share && navigator.canShare) {
            shareBtn.hidden = false;
            shareBtn.addEventListener('click', async () => {
                try {
                    const blob = await (await fetch(dataURL)).blob();
                    const file = new File([blob], `kino-wrapped-${year}.png`, { type: 'image/png' });
                    await navigator.share({ files: [file], title: `Kino Wrapped ${year}` });
                } catch {}
            });
        }
    } catch (e) {
        preview.hidden = true;
        overlay.querySelector('#wrappedError').textContent = `Rendering error: ${e.message}`;
        overlay.querySelector('#wrappedError').hidden = false;
    }
}

// ── Stats ────────────────────────────────────────────────────────────────────

function _computeStats(watched) {
    const top5 = [...watched].sort((a, b) => Number(b.rating) - Number(a.rating)).slice(0, 5);

    // Favorite director
    const dirCount = {};
    watched.forEach(m => { if (m.director) dirCount[m.director] = (dirCount[m.director] || 0) + 1; });
    const topDir = Object.entries(dirCount).sort(([,a],[,b]) => b - a)[0];

    // Genre profile
    const genreCount = {};
    watched.forEach(m => {
        const gs = Array.isArray(m.genres)
            ? m.genres.map(g => typeof g === 'string' ? g : g?.name || '').filter(Boolean)
            : String(m.genres || '').split(',').map(s => s.trim()).filter(Boolean);
        gs.forEach(g => { genreCount[g] = (genreCount[g] || 0) + 1; });
    });
    const top3genres = Object.entries(genreCount).sort(([,a],[,b]) => b - a).slice(0, 3).map(([g]) => g);

    const totalMin = watched.reduce((s, m) => s + (m.runtime || 0), 0);
    const avgRating = (watched.reduce((s, m) => s + Number(m.rating), 0) / watched.length).toFixed(1);

    return { top5, topDir: topDir?.[0] || null, top3genres, totalMin, avgRating, count: watched.length };
}

// ── Canvas Rendering ──────────────────────────────────────────────────────────

const W = 1080, H = 1920;

async function _drawCard(canvas, stats, year) {
    canvas.width  = W;
    canvas.height = H;
    const cx = canvas.getContext('2d');

    // Background gradient
    const grad = cx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#060a10');
    grad.addColorStop(0.5, '#0b1018');
    grad.addColorStop(1, '#060a10');
    cx.fillStyle = grad;
    cx.fillRect(0, 0, W, H);

    // Accent accent line
    cx.strokeStyle = '#06b6d4';
    cx.lineWidth   = 3;
    cx.beginPath(); cx.moveTo(80, 0); cx.lineTo(80, H); cx.stroke();

    // KINO logo
    cx.fillStyle = '#06b6d4';
    cx.font      = "bold 52px 'Instrument Serif', Georgia, serif";
    cx.fillText('Kino', 110, 120);

    cx.fillStyle = '#7e8a9a';
    cx.font      = "34px 'Hanken Grotesk', sans-serif";
    cx.fillText(`Wrapped ${year}`, 110, 175);

    // Separator
    cx.fillStyle = 'rgba(255,255,255,.06)';
    cx.fillRect(110, 200, W - 180, 1);

    // Stats row
    cx.fillStyle = '#edf0f5';
    cx.font      = "bold 72px 'Hanken Grotesk', sans-serif";
    cx.fillText(String(stats.count), 110, 320);
    cx.fillStyle = '#7e8a9a';
    cx.font      = "32px 'Hanken Grotesk', sans-serif";
    cx.fillText('films this year', 110, 368);

    cx.fillStyle = '#06b6d4';
    cx.font      = "bold 72px 'Hanken Grotesk', sans-serif";
    cx.fillText(`★ ${stats.avgRating}`, 400, 320);
    cx.fillStyle = '#7e8a9a';
    cx.font      = "32px 'Hanken Grotesk', sans-serif";
    cx.fillText('avg rating', 400, 368);

    const hrs = Math.floor(stats.totalMin / 60);
    cx.fillStyle = '#edf0f5';
    cx.font      = "bold 72px 'Hanken Grotesk', sans-serif";
    cx.fillText(`${hrs}h`, 700, 320);
    cx.fillStyle = '#7e8a9a';
    cx.font      = "32px 'Hanken Grotesk', sans-serif";
    cx.fillText('watched', 700, 368);

    cx.fillStyle = 'rgba(255,255,255,.06)';
    cx.fillRect(110, 400, W - 180, 1);

    // Top 5
    cx.fillStyle = '#7e8a9a';
    cx.font      = "28px 'DM Mono', monospace";
    cx.fillText('YOUR TOP 5', 110, 460);

    for (let i = 0; i < stats.top5.length; i++) {
        const m  = stats.top5[i];
        const y0 = 500 + i * 140;

        // Rank number
        cx.fillStyle = '#06b6d4';
        cx.font      = "bold 48px 'DM Mono', monospace";
        cx.fillText(String(i + 1).padStart(2, '0'), 110, y0 + 50);

        // Poster (attempt cross-origin load)
        if (m.poster) {
            try {
                const img = await _loadImg(m.poster);
                cx.drawImage(img, 195, y0, 73, 110);
            } catch {}
        }

        // Title + rating
        cx.fillStyle = '#edf0f5';
        cx.font      = "bold 38px 'Instrument Serif', Georgia, serif";
        _wrapText(cx, m.title || '', 290, y0 + 44, 700, 44);

        cx.fillStyle = '#7e8a9a';
        cx.font      = "28px 'Hanken Grotesk', sans-serif";
        cx.fillText(`★ ${Number(m.rating).toFixed(1)}  ${m.year || ''}`, 290, y0 + 96);
    }

    cx.fillStyle = 'rgba(255,255,255,.06)';
    cx.fillRect(110, 1220, W - 180, 1);

    // Favorite director
    if (stats.topDir) {
        cx.fillStyle = '#7e8a9a';
        cx.font      = "28px 'DM Mono', monospace";
        cx.fillText('FAVORITE DIRECTOR', 110, 1280);
        cx.fillStyle = '#edf0f5';
        cx.font      = "bold 52px 'Instrument Serif', Georgia, serif";
        cx.fillText(stats.topDir, 110, 1350);
    }

    // Genre profile
    cx.fillStyle = '#7e8a9a';
    cx.font      = "28px 'DM Mono', monospace";
    cx.fillText('YOUR GENRES', 110, 1450);
    stats.top3genres.forEach((g, i) => {
        cx.fillStyle = ['#06b6d4','#22d3ee','#0891b2'][i] || '#06b6d4';
        cx.font      = "bold 44px 'Hanken Grotesk', sans-serif";
        cx.fillText(g, 110, 1510 + i * 68);
    });

    // Footer
    cx.fillStyle = '#454e5c';
    cx.font      = "24px 'DM Mono', monospace";
    cx.fillText('kino.app — your cinematic OS', 110, H - 80);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _loadImg(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload  = () => resolve(img);
        img.onerror = reject;
        img.src     = src;
    });
}

function _wrapText(cx, text, x, y, maxW, lineH) {
    const words = text.split(' ');
    let line = '';
    let lineY = y;
    for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (cx.measureText(test).width > maxW && line) {
            cx.fillText(line, x, lineY);
            line  = word;
            lineY += lineH;
        } else { line = test; }
    }
    if (line) cx.fillText(line, x, lineY);
}

function _buildOverlay() {
    const el = document.createElement('div');
    el.className = 'modal-overlay';
    el.innerHTML = `
      <div class="modal" style="max-width:480px;padding:28px">
        <button class="modal-close" id="wrappedClose">&times;</button>
        <h2 class="serif accent" style="margin-bottom:16px">Kino Wrapped</h2>
        <canvas id="wrappedCanvas" hidden></canvas>
        <img id="wrappedPreview" alt="Kino Wrapped" hidden
             style="width:100%;border-radius:var(--r-md);display:block;margin:0 auto">
        <p id="wrappedError" hidden style="color:var(--red);margin-top:12px"></p>
        <div style="display:flex;gap:10px;margin-top:20px">
          <button class="btn btn-accent" id="wrappedDl">⬇ Download PNG</button>
          <button class="btn" id="wrappedShare" hidden>↑ Share</button>
        </div>
        <p style="font-size:.75rem;color:var(--ink-mute);margin-top:12px">
          Shows films watched in ${new Date().getFullYear()}.
        </p>
      </div>`;
    return el;
}

function _showError(msg) {
    alert(msg); // simple fallback; replace with your toast system
}
