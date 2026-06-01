/** VAULT — analytics, ranking Elo, charts. */
import { getMovies, getMatches } from '../data/repo.js';
import { tierOf, seedElo } from '../core/elo.js';

let ChartJS = null;
async function loadChart() {
  if (ChartJS) return ChartJS;
  return new Promise((resolve, reject) => {
    if (window.Chart) { ChartJS = window.Chart; return resolve(ChartJS); }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
    s.onload = () => { ChartJS = window.Chart; resolve(ChartJS); };
    s.onerror = () => reject(new Error('Chart.js load failed'));
    document.head.appendChild(s);
  });
}

export const vault = {
  id: 'vault', label: 'Vault', icon: '📊',
  async mount(el) {
    el.innerHTML = `<div class="vault-page">
      <h2 class="serif accent" style="margin-bottom:4px">Vault</h2>
      <div class="vault-tabs" id="vaultTabs">
        <button class="vault-tab active" data-tab="overview">Overview</button>
        <button class="vault-tab" data-tab="charts">Charts</button>
        <button class="vault-tab" data-tab="rankings">Rankings</button>
      </div>
      <div id="vaultBody">
        <div class="sk" style="height:200px;border-radius:var(--r-md)"></div>
      </div>
    </div>`;

    let movies = [], matches = [];
    try {
      [movies, matches] = await Promise.all([getMovies(), getMatches().catch(() => [])]);
    } catch (e) {
      el.querySelector('#vaultBody').innerHTML = vaultErr(e.message);
      return;
    }

    const rated = movies.filter(m => m.rating != null && !m.isWatchlist);
    const wl = movies.filter(m => m.isWatchlist);
    const body = el.querySelector('#vaultBody');

    const tabs = {
      overview: () => renderOverview(body, rated, wl, movies, matches),
      charts:   () => renderCharts(body, rated),
      rankings: () => renderRankings(body, rated, matches),
    };

    el.querySelector('#vaultTabs').addEventListener('click', e => {
      const tab = e.target.closest('.vault-tab');
      if (!tab) return;
      el.querySelectorAll('.vault-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      tabs[tab.dataset.tab]?.();
    });

    tabs.overview();
  }
};

/* ─── Overview ─── */

function renderOverview(body, rated, wl, all, matches) {
  const avgRating = rated.length
    ? (rated.reduce((s, m) => s + Number(m.rating), 0) / rated.length).toFixed(1) : '—';
  const totalMin = rated.reduce((s, m) => s + (m.runtime || 0), 0);
  const runtimeStr = totalMin > 0
    ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}m` : '—';

  const withImdb = rated.filter(m => m.imdbRating && m.rating);
  const guiltyPleasures = withImdb
    .filter(m => Number(m.rating) > parseFloat(m.imdbRating))
    .sort((a, b) => (Number(b.rating) - parseFloat(b.imdbRating)) - (Number(a.rating) - parseFloat(a.imdbRating)))
    .slice(0, 3);
  const hotTakes = withImdb
    .filter(m => Number(m.rating) < parseFloat(m.imdbRating))
    .sort((a, b) => (parseFloat(b.imdbRating) - Number(b.rating)) - (parseFloat(a.imdbRating) - Number(a.rating)))
    .slice(0, 3);

  const upsets = matches
    .filter(m => m.isUpset)
    .sort((a, b) => {
      const gapA = Math.abs((a.movieAElo || 0) - (a.movieBElo || 0));
      const gapB = Math.abs((b.movieAElo || 0) - (b.movieBElo || 0));
      return gapB - gapA;
    })
    .slice(0, 3);

  body.innerHTML = `
    <div class="vault-stats">
      ${vStat('Visti', rated.length)}
      ${vStat('Watchlist', wl.length)}
      ${vStat('Voto medio', avgRating)}
      ${vStat('Tempo totale', runtimeStr)}
    </div>

    ${guiltyPleasures.length ? `
    <div class="vault-section">
      <h3 class="vault-section-title">Guilty Pleasures <span class="vault-hint">Il tuo voto &gt; IMDb</span></h3>
      <div class="vault-mini-list">
        ${guiltyPleasures.map(m => miniCard(m, `+${(Number(m.rating) - parseFloat(m.imdbRating)).toFixed(1)}`, 'up')).join('')}
      </div>
    </div>` : ''}

    ${hotTakes.length ? `
    <div class="vault-section">
      <h3 class="vault-section-title">Hot Takes <span class="vault-hint">Il tuo voto &lt; IMDb</span></h3>
      <div class="vault-mini-list">
        ${hotTakes.map(m => miniCard(m, `${(Number(m.rating) - parseFloat(m.imdbRating)).toFixed(1)}`, 'down')).join('')}
      </div>
    </div>` : ''}

    ${upsets.length ? `
    <div class="vault-section">
      <h3 class="vault-section-title">Top Upsets <span class="vault-hint">Le più grandi sorprese in Battle</span></h3>
      <div class="vault-upsets">
        ${upsets.map((m, i) => upsetCard(m, i)).join('')}
      </div>
    </div>` : ''}

    ${!rated.length ? '<div class="vault-empty">Valuta qualche film per sbloccare le statistiche.</div>' : ''}
  `;
}

/* ─── Charts ─── */

async function renderCharts(body, rated) {
  const withImdb = rated.filter(m => m.imdbRating && m.rating);
  const withRuntime = rated.filter(m => m.runtime && m.rating);

  body.innerHTML = `
    <div class="vault-chart-grid">
      <div class="vault-chart-card">
        <h3 class="vault-chart-title">Consensus Delta</h3>
        <p class="vault-chart-desc">Il tuo voto vs la media IMDb</p>
        ${withImdb.length >= 2
          ? '<div class="vault-chart-wrap"><canvas id="chartDelta"></canvas></div>'
          : '<div class="vault-chart-empty">Servono almeno 2 film con voto IMDb.</div>'}
      </div>
      <div class="vault-chart-card">
        <h3 class="vault-chart-title">Runtime vs Rating</h3>
        <p class="vault-chart-desc">Preferisci film corti o lunghi?</p>
        ${withRuntime.length >= 2
          ? '<div class="vault-chart-wrap"><canvas id="chartRuntime"></canvas></div>'
          : '<div class="vault-chart-empty">Servono almeno 2 film con durata nota.</div>'}
      </div>
    </div>`;

  if (withImdb.length < 2 && withRuntime.length < 2) return;

  try {
    const Chart = await loadChart();
    if (withImdb.length >= 2) buildConsensusChart(Chart, withImdb);
    if (withRuntime.length >= 2) buildRuntimeChart(Chart, withRuntime);
  } catch {
    body.insertAdjacentHTML('beforeend', '<div class="vault-chart-error">Impossibile caricare Chart.js</div>');
  }
}

function buildConsensusChart(Chart, movies) {
  const data = movies.map(m => ({
    x: parseFloat(m.imdbRating),
    y: Number(m.rating),
    title: m.title,
  }));

  const ctx = document.getElementById('chartDelta');
  if (!ctx) return;

  new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Film',
          data,
          backgroundColor: data.map(d =>
            d.y > d.x ? 'rgba(34,197,94,.7)'
            : d.y < d.x ? 'rgba(239,68,68,.7)'
            : 'rgba(6,182,212,.7)'
          ),
          pointRadius: 6,
          pointHoverRadius: 9,
        },
        {
          label: 'Consenso',
          data: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
          type: 'line',
          borderColor: 'rgba(255,255,255,.12)',
          borderDash: [6, 4],
          borderWidth: 1,
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: chartOpts({
      x: { title: { display: true, text: 'IMDb', color: '#7e8a9a' }, min: 0, max: 10 },
      y: { title: { display: true, text: 'Il tuo voto', color: '#7e8a9a' }, min: 0, max: 10 },
    }, (ctx) => {
      const d = data[ctx.dataIndex];
      return d ? `${d.title}: IMDb ${d.x} → Tu ${d.y}` : '';
    }),
  });
}

function buildRuntimeChart(Chart, movies) {
  const data = movies.map(m => ({
    x: m.runtime,
    y: Number(m.rating),
    title: m.title,
  }));

  const { slope, intercept } = linearRegression(data);
  const minX = Math.min(...data.map(d => d.x));
  const maxX = Math.max(...data.map(d => d.x));

  const ctx = document.getElementById('chartRuntime');
  if (!ctx) return;

  new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Film',
          data,
          backgroundColor: 'rgba(6,182,212,.55)',
          pointRadius: 5,
          pointHoverRadius: 8,
        },
        {
          label: 'Trend',
          data: [
            { x: minX, y: clamp(slope * minX + intercept, 0, 10) },
            { x: maxX, y: clamp(slope * maxX + intercept, 0, 10) },
          ],
          type: 'line',
          borderColor: '#22d3ee',
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: chartOpts({
      x: { title: { display: true, text: 'Durata (min)', color: '#7e8a9a' } },
      y: { title: { display: true, text: 'Il tuo voto', color: '#7e8a9a' }, min: 0, max: 10 },
    }, (ctx) => {
      const d = data[ctx.dataIndex];
      return d ? `${d.title}: ${d.x} min → ${d.y}/10` : '';
    }),
  });
}

function chartOpts(scales, tooltipLabel) {
  const base = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: tooltipLabel } },
    },
    scales: {},
  };
  for (const [axis, cfg] of Object.entries(scales)) {
    base.scales[axis] = {
      ...cfg,
      grid: { color: 'rgba(255,255,255,.05)' },
      ticks: { color: '#7e8a9a' },
      title: { ...cfg.title, font: { family: "'Hanken Grotesk', sans-serif", size: 12 } },
    };
  }
  return base;
}

/* ─── Rankings ─── */

function renderRankings(body, rated, matches) {
  const ranking = [...rated].sort((a, b) => seedElo(b) - seedElo(a)).slice(0, 30);

  const upsets = matches
    .filter(m => m.isUpset)
    .sort((a, b) => {
      const gapA = Math.abs((a.movieAElo || 0) - (a.movieBElo || 0));
      const gapB = Math.abs((b.movieAElo || 0) - (b.movieBElo || 0));
      return gapB - gapA;
    })
    .slice(0, 3);

  body.innerHTML = `
    <div class="vault-section">
      <h3 class="vault-section-title">Elo Ranking</h3>
      ${ranking.length ? `<div class="vault-ranking">
        ${ranking.map((m, i) => `
          <div class="vault-rank-row">
            <span class="vault-rank-pos mono">${i + 1}</span>
            <span class="vault-rank-title serif">${esc(m.title)}</span>
            <span class="vault-rank-tier">${tierOf(seedElo(m)).label}</span>
            <span class="vault-rank-elo mono">${seedElo(m)}</span>
          </div>`).join('')}
      </div>` : '<div class="vault-empty">Nessun film valutato.</div>'}
    </div>

    <div class="vault-section">
      <h3 class="vault-section-title">Elo Volatility <span class="vault-hint">I più grandi upset</span></h3>
      ${upsets.length ? `<div class="vault-upsets">
        ${upsets.map((m, i) => upsetCard(m, i)).join('')}
      </div>` : '<div class="vault-empty">Nessun upset registrato. Gioca a Battle!</div>'}
    </div>
  `;
}

/* ─── Helpers ─── */

function linearRegression(pts) {
  const n = pts.length;
  if (n < 2) return { slope: 0, intercept: 0 };
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (const { x, y } of pts) { sx += x; sy += y; sxy += x * y; sx2 += x * x; }
  const d = n * sx2 - sx * sx;
  if (d === 0) return { slope: 0, intercept: sy / n };
  return { slope: (n * sxy - sx * sy) / d, intercept: (sy - ((n * sxy - sx * sy) / d) * sx) / n };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function vStat(label, val) {
  return `<div class="vault-stat">
    <div class="vault-stat-value">${val}</div>
    <div class="vault-stat-label">${label}</div>
  </div>`;
}

function miniCard(m, delta, dir) {
  const poster = m.poster ? `<img class="vault-mini-poster" src="${esc(m.poster)}" alt="" loading="lazy">` : '';
  return `<div class="vault-mini-card">
    ${poster}
    <div class="vault-mini-info">
      <span class="vault-mini-title">${esc(m.title)}</span>
      <span class="vault-mini-sub">${Number(m.rating).toFixed(1)} vs IMDb ${m.imdbRating}</span>
    </div>
    <span class="vault-mini-delta ${dir}">${delta}</span>
  </div>`;
}

function upsetCard(m, i) {
  const winnerIsA = m.winnerId === m.movieAId;
  const winner = winnerIsA ? m.movieATitle : m.movieBTitle;
  const loser = winnerIsA ? m.movieBTitle : m.movieATitle;
  const winnerElo = winnerIsA ? m.movieAElo : m.movieBElo;
  const loserElo = winnerIsA ? m.movieBElo : m.movieAElo;
  const gap = Math.abs(loserElo - winnerElo);
  return `<div class="vault-upset-card">
    <span class="vault-upset-rank">#${i + 1}</span>
    <div class="vault-upset-info">
      <span class="vault-upset-winner">${esc(winner)} <span class="mono" style="color:var(--ink-mute)">(${winnerElo})</span></span>
      <span class="vault-upset-beat">ha battuto</span>
      <span class="vault-upset-loser">${esc(loser)} <span class="mono" style="color:var(--ink-mute)">(${loserElo})</span></span>
    </div>
    <span class="vault-upset-gap">${gap}</span>
  </div>`;
}

function vaultErr(msg) { return `<div class="vault-empty" style="color:var(--red)">${esc(msg)}</div>`; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
