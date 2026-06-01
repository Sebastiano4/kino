/** Watched modal — mark a film as watched with rating, date, notes. */

export function openWatchedModal(movie, options = {}) {
  const init = {
    rating: options.initialRating || 7,
    date: options.initialDate || new Date().toISOString().slice(0, 10),
    notes: options.initialNotes || '',
    rewatch: options.initialRewatch || false,
  };

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:480px">
      <button class="modal-close">&times;</button>
      <div style="padding:28px">
        <h2 class="modal-title" style="margin-bottom:20px">Segna come visto</h2>
        <div class="watched-film">
          <img src="${esc(movie.poster || '')}" alt="">
          <div>
            <div class="serif" style="font-size:1.05rem">${esc(movie.title || '')}</div>
            <div style="color:var(--ink-mute);font-size:.82rem">${esc(movie.year || '')}</div>
          </div>
        </div>

        <div class="watched-field">
          <label class="filter-section-label">Il tuo voto</label>
          <div class="rating-control">
            <input type="range" class="rating-slider" min="1" max="10" step="0.5" value="${init.rating}" id="wRating">
            <span class="rating-display" id="wRatingVal">★ ${Number(init.rating).toFixed(1)}</span>
          </div>
        </div>

        <div class="watched-field">
          <label class="filter-section-label">Data di visione</label>
          <input type="date" class="filter-input" id="wDate" value="${init.date}" style="max-width:200px">
        </div>

        <div class="watched-field">
          <label class="filter-section-label">Note personali</label>
          <textarea class="filter-input" id="wNotes" rows="3" placeholder="Le tue impressioni…">${esc(init.notes)}</textarea>
        </div>

        <div class="watched-field">
          <label class="toggle-row">
            <input type="checkbox" id="wRewatch" ${init.rewatch ? 'checked' : ''}>
            <span>Rivisto (non è la prima volta)</span>
          </label>
        </div>

        <div style="display:flex;gap:10px;margin-top:24px">
          <button class="btn btn-accent" id="wSave">Salva</button>
          <button class="btn" id="wCancel">Annulla</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.querySelector('#wCancel').addEventListener('click', close);

  const slider = overlay.querySelector('#wRating');
  const display = overlay.querySelector('#wRatingVal');
  slider.addEventListener('input', () => {
    display.textContent = `★ ${parseFloat(slider.value).toFixed(1)}`;
  });

  overlay.querySelector('#wSave').addEventListener('click', async () => {
    const data = {
      rating: parseFloat(slider.value),
      watchedDate: overlay.querySelector('#wDate').value,
      notes: overlay.querySelector('#wNotes').value.trim(),
      isRewatch: overlay.querySelector('#wRewatch').checked,
      isWatchlist: false,
    };
    const btn = overlay.querySelector('#wSave');
    btn.disabled = true; btn.textContent = 'Salvataggio…';
    try {
      if (options.onSave) await options.onSave(data);
      close();
    } catch { btn.textContent = 'Errore'; btn.disabled = false; }
  });

  return { close };
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
