/** Card film riusabile. Ritorna un elemento DOM. */
export function movieCard(m, { onClick } = {}) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = m.id || m.tmdbId || '';
    const dir = m.director && m.director !== 'Unknown' ? m.director : '';
    const rate = m.rating != null ? `<span class="rate">★ ${m.rating}</span>` : '';
    el.innerHTML = `
      <div class="poster">${rate}<img loading="lazy" alt="" src="${esc(m.poster || '')}"></div>
      <div class="meta">
        <span class="title">${esc(m.title || '')}</span>
        ${dir ? `<span class="dir">${esc(dir)}</span>` : ''}
      </div>`;
    if (onClick) el.addEventListener('click', () => onClick(m));
    return el;
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
        { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
    ));
}
