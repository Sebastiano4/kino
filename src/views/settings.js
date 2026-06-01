/** SETTINGS — account, preferenze, gestione dati. */
import { getUser } from '../core/auth.js';
import { getMovies, exportMoviesJSON, exportMoviesCSV, importMoviesJSON, getProfile, saveProfile } from '../data/repo.js';

export const settings = {
  id: 'settings', label: 'Settings', icon: '⚙️', hidden: true,
  async mount(el, ctx) {
    const user = ctx?.user || getUser();
    el.innerHTML = '<div style="padding:40px;text-align:center"><div class="sk" style="width:40px;height:40px;border-radius:50%;margin:0 auto"></div></div>';

    let movies = [];
    let profile = {};
    try { [movies, profile] = await Promise.all([getMovies(), getProfile()]); } catch {}
    const watched = movies.filter(m => !m.isWatchlist && m.rating != null);
    const wl = movies.filter(m => m.isWatchlist);
    const displayName = profile.displayName || user?.displayName || 'Utente';
    const photoURL = profile.photoURL || user?.photoURL || '';
    const lang = profile.language || 'it';

    el.innerHTML = `
      <div class="settings-page">
        <h2 class="serif accent" style="margin-bottom:28px">Impostazioni</h2>

        <div class="settings-section">
          <h3>Profilo</h3>
          <div class="settings-profile">
            <div class="settings-avatar-wrap">
              <img src="${esc(photoURL)}" class="settings-avatar" alt="" referrerpolicy="no-referrer" id="setAvatar">
              <label class="settings-avatar-edit" title="Cambia foto">
                ✎
                <input type="file" accept="image/*" id="setAvatarFile" hidden>
              </label>
            </div>
            <div class="settings-profile-fields">
              <div class="settings-field">
                <label class="settings-field-label">Nome</label>
                <input type="text" class="filter-input" id="setName" value="${esc(displayName)}" style="max-width:240px">
              </div>
              <div class="settings-email">${esc(user?.email || '')}</div>
            </div>
          </div>
          <button class="btn btn-sm btn-accent" id="setSaveProfile" style="margin-top:8px">Salva profilo</button>
          <div id="setProfileMsg" style="font-size:.82rem;color:var(--green);margin-top:6px;display:none"></div>
        </div>

        <div class="settings-section">
          <h3>Preferenze</h3>
          <div class="settings-row">
            <span class="settings-label">Tema</span>
            <span class="settings-value">Dark</span>
          </div>
          <div class="settings-row">
            <span class="settings-label">Pagina iniziale</span>
            <select class="filter-select" id="setLanding" style="min-width:120px">
              <option value="home" ${profile.landing === 'home' || !profile.landing ? 'selected' : ''}>Home</option>
              <option value="explore" ${profile.landing === 'explore' ? 'selected' : ''}>Explore</option>
              <option value="archive" ${profile.landing === 'archive' ? 'selected' : ''}>Archive</option>
              <option value="watchlist" ${profile.landing === 'watchlist' ? 'selected' : ''}>Watchlist</option>
            </select>
          </div>
          <div class="settings-row">
            <span class="settings-label">Lingua</span>
            <select class="filter-select" id="setLang" style="min-width:120px">
              <option value="it" ${lang === 'it' ? 'selected' : ''}>Italiano</option>
              <option value="en" ${lang === 'en' ? 'selected' : ''}>English</option>
            </select>
          </div>
        </div>

        <div class="settings-section">
          <h3>I tuoi dati</h3>
          <div class="settings-row">
            <span class="settings-label">Film visti</span>
            <span class="settings-value mono">${watched.length}</span>
          </div>
          <div class="settings-row">
            <span class="settings-label">In watchlist</span>
            <span class="settings-value mono">${wl.length}</span>
          </div>
          <div class="settings-row">
            <span class="settings-label">Totale</span>
            <span class="settings-value mono">${movies.length}</span>
          </div>
          <div class="settings-actions">
            <button class="btn btn-sm" id="setExpCSV">Esporta CSV</button>
            <button class="btn btn-sm" id="setExpJSON">Esporta JSON</button>
            <label class="btn btn-sm" style="cursor:pointer">
              Importa JSON
              <input type="file" accept=".json" id="setImpJSON" hidden>
            </label>
          </div>
          <div id="setImportMsg" style="font-size:.82rem;color:var(--green);margin-top:8px;display:none"></div>
        </div>

        <div class="settings-section">
          <h3>Info</h3>
          <div class="settings-row">
            <span class="settings-label">Versione</span>
            <span class="settings-value mono">1.2.0</span>
          </div>
          <div class="settings-row">
            <span class="settings-label">Progetto</span>
            <span class="settings-value">Kino</span>
          </div>
        </div>
      </div>`;

    // Profile save
    el.querySelector('#setSaveProfile').addEventListener('click', async () => {
      const name = el.querySelector('#setName').value.trim();
      const msg = el.querySelector('#setProfileMsg');
      if (!name) return;
      msg.style.display = 'block'; msg.style.color = 'var(--ink-dim)';
      msg.textContent = 'Salvataggio…';
      try {
        await saveProfile({ displayName: name });
        msg.style.color = 'var(--green)';
        msg.textContent = 'Profilo aggiornato.';
      } catch (e) {
        msg.style.color = 'var(--red)';
        msg.textContent = `Errore: ${e.message}`;
      }
    });

    // Avatar file
    el.querySelector('#setAvatarFile').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const msg = el.querySelector('#setProfileMsg');
      try {
        const dataUrl = await fileToDataUrl(file);
        el.querySelector('#setAvatar').src = dataUrl;
        await saveProfile({ photoURL: dataUrl });
        msg.style.display = 'block'; msg.style.color = 'var(--green)';
        msg.textContent = 'Foto aggiornata.';
      } catch (e) {
        msg.style.display = 'block'; msg.style.color = 'var(--red)';
        msg.textContent = `Errore foto: ${e.message}`;
      }
    });

    // Landing page preference
    el.querySelector('#setLanding').addEventListener('change', async (e) => {
      try { await saveProfile({ landing: e.target.value }); } catch {}
    });

    // Language preference
    el.querySelector('#setLang').addEventListener('change', async (e) => {
      try { await saveProfile({ language: e.target.value }); } catch {}
    });

    // Export
    el.querySelector('#setExpCSV').addEventListener('click', () => exportMoviesCSV(movies));
    el.querySelector('#setExpJSON').addEventListener('click', () => exportMoviesJSON(movies));

    // Import
    el.querySelector('#setImpJSON').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const msg = el.querySelector('#setImportMsg');
      msg.style.display = 'block'; msg.style.color = 'var(--ink-dim)';
      msg.textContent = 'Importazione in corso…';
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!Array.isArray(data)) throw new Error('Il file deve contenere un array di film');
        const count = await importMoviesJSON(data);
        msg.style.color = 'var(--green)';
        msg.textContent = `Importati ${count} film.`;
      } catch (err) {
        msg.style.color = 'var(--red)';
        msg.textContent = `Errore: ${err.message}`;
      }
    });
  }
};

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const img = new Image();
    img.onload = () => {
      const size = 128;
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const s = Math.min(img.width, img.height);
      const sx = (img.width - s) / 2, sy = (img.height - s) / 2;
      ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => reject(new Error('Immagine non valida'));
    img.src = URL.createObjectURL(file);
  });
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
