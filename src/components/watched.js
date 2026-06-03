/**
 * Watched modal — log a film as watched with rating, date, notes.
 *
 * Part 5 — AI Review Analysis
 * Adds an "Analyze with AI" button below the notes field.
 * On click → calls analyzeReview() → renders structured badges.
 * Result is persisted to Firestore as movie.aiAnalysis: { sentiment, tone, themes, tags }.
 *
 * UX states: idle → loading → result | error → retry
 */

import { analyzeReview } from '../services/ai.js';
import i18n from '../core/i18n.js';

const SENTIMENT_EMOJI = { positive: '😊', neutral: '😐', negative: '😞', mixed: '🤔' };
const SENTIMENT_COLOR = { positive: 'var(--green)', neutral: 'var(--ink-dim)', negative: 'var(--red)', mixed: 'var(--amber)' };

export function openWatchedModal(movie, options = {}) {
    const init = {
        rating:  options.initialRating  || 7,
        date:    options.initialDate    || new Date().toISOString().slice(0, 10),
        notes:   options.initialNotes   || '',
        rewatch: options.initialRewatch || false,
    };

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:520px">
        <button class="modal-close">&times;</button>
        <div style="padding:28px">
          <h2 class="modal-title" style="margin-bottom:20px">${i18n.t('mark_watched')}</h2>

          <div class="watched-film">
            <img src="${esc(movie.poster || '')}" alt="" loading="lazy" decoding="async">
            <div>
              <div class="serif" style="font-size:1.05rem">${esc(movie.title || '')}</div>
              <div style="color:var(--ink-mute);font-size:.82rem">${esc(movie.year || '')}</div>
            </div>
          </div>

          <div class="watched-field">
            <label class="filter-section-label">Voto</label>
            <div class="rating-control">
              <input type="range" class="rating-slider" min="1" max="10" step="0.5"
                     value="${init.rating}" id="wRating">
              <span class="rating-display" id="wRatingVal">★ ${Number(init.rating).toFixed(1)}</span>
            </div>
          </div>

          <div class="watched-field">
            <label class="filter-section-label">${i18n.t('seen_on')}</label>
            <input type="date" class="filter-input" id="wDate"
                   value="${init.date}" style="max-width:200px">
          </div>

          <div class="watched-field" id="wNotesField">
            <div class="impressions-header">
              <label class="filter-section-label">${i18n.t('impressions')}</label>
              <button type="button" class="review-remove-file" id="wRemoveFile" hidden title="Remove file">✕ Remove file</button>
            </div>
            <!-- Textarea (default) -->
            <textarea class="filter-input review-textarea" id="wNotes" rows="4"
                      placeholder="${i18n.t('impressions')}"
                      ondragover="event.preventDefault();this.closest('.review-textarea-wrap')?.classList.add('drag-over')"
                      ondragleave="this.closest('.review-textarea-wrap')?.classList.remove('drag-over')"
                      ondrop="event.preventDefault()">${esc(init.notes)}</textarea>
            <!-- Drop hint overlay on the textarea -->
            <div class="review-drop-hint" id="wDropHint">
              <input type="file" id="wUploadInput" accept=".pdf,.html,.htm,.txt" style="display:none">
              <span>📄</span>
              <span>Drop a file here</span>
              <span class="review-upload-hint">PDF · HTML · TXT</span>
              <button type="button" class="review-upload-browse" id="wBrowse">or browse</button>
            </div>
            <!-- Preview (shown after file load, replaces textarea) -->
            <div class="review-preview" id="wPreview" hidden></div>
          </div>

          <!-- AI Analysis Block -->
          <div class="ai-analysis-block" id="aiBlock">
            <button class="btn btn-sm ai-analyze-btn" id="aiBtn"
                    title="Analyze your review with Gemini AI">
              ✦ Analyze with AI
            </button>
            <div id="aiResult" class="ai-result" hidden></div>
          </div>

          <div class="watched-field">
            <label class="toggle-row">
              <input type="checkbox" id="wRewatch" ${init.rewatch ? 'checked' : ''}>
              <span>${i18n.t('rewatch_label')}</span>
            </label>
          </div>

          <div style="display:flex;gap:10px;margin-top:24px">
            <button class="btn btn-accent" id="wSave">${i18n.t('save')}</button>
            <button class="btn" id="wCancel">${i18n.t('cancel')}</button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    // ── Close / cancel ───────────────────────────────────────────────────────
    const close  = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey  = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('.modal-close').addEventListener('click', close);
    overlay.querySelector('#wCancel').addEventListener('click', close);

    // ── Rating slider ────────────────────────────────────────────────────────
    const slider  = overlay.querySelector('#wRating');
    const display = overlay.querySelector('#wRatingVal');
    slider.addEventListener('input', () => {
        display.textContent = `★ ${parseFloat(slider.value).toFixed(1)}`;
    });

    // ── File preview (PDF / HTML / TXT inline, replaces textarea) ───────────
    const wNotes      = overlay.querySelector('#wNotes');
    const wPreview    = overlay.querySelector('#wPreview');
    const wRemoveFile = overlay.querySelector('#wRemoveFile');
    const uploadInput = overlay.querySelector('#wUploadInput');
    let   _blobUrl    = null; // track created blob URLs for cleanup

    overlay.querySelector('#wBrowse').addEventListener('click', () => uploadInput.click());
    uploadInput.addEventListener('change', () => {
        if (uploadInput.files[0]) _handleFile(uploadInput.files[0]);
    });

    // Drag-over on the textarea itself
    wNotes.addEventListener('dragover', e => {
        e.preventDefault(); wNotes.classList.add('drag-over');
    });
    wNotes.addEventListener('dragleave', () => wNotes.classList.remove('drag-over'));
    wNotes.addEventListener('drop', e => {
        e.preventDefault(); wNotes.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) _handleFile(e.dataTransfer.files[0]);
    });

    wRemoveFile.addEventListener('click', () => {
        _clearPreview();
    });

    function _clearPreview() {
        if (_blobUrl) { URL.revokeObjectURL(_blobUrl); _blobUrl = null; }
        wPreview.hidden = true;
        wPreview.innerHTML = '';
        wNotes.hidden = false;
        wRemoveFile.hidden = true;
    }

    async function _handleFile(file) {
        const ext  = file.name.split('.').pop().toLowerCase();
        const name = file.name;

        // Show loading state
        wNotes.hidden   = true;
        wPreview.hidden = false;
        wPreview.innerHTML = `<div class="review-preview-loading">Loading <em>${esc(name)}</em>…</div>`;
        wRemoveFile.hidden = false;

        try {
            if (ext === 'pdf') {
                _blobUrl = URL.createObjectURL(file);
                wPreview.innerHTML = `
                  <div class="review-preview-bar">
                    <span class="review-preview-filename">📄 ${esc(name)}</span>
                  </div>
                  <embed class="review-preview-embed" src="${_blobUrl}#toolbar=0&navpanes=0" type="application/pdf">`;
            } else if (ext === 'html' || ext === 'htm') {
                const raw = await file.text();
                // Sanitise: remove script/style tags, keep layout
                const clean = raw.replace(/<script[\s\S]*?<\/script>/gi, '')
                                  .replace(/<style[\s\S]*?<\/style>/gi, '');
                wPreview.innerHTML = `
                  <div class="review-preview-bar">
                    <span class="review-preview-filename">🌐 ${esc(name)}</span>
                  </div>
                  <iframe class="review-preview-frame" sandbox="allow-same-origin"
                          srcdoc="${clean.replace(/"/g, '&quot;')}"></iframe>`;
            } else if (ext === 'txt') {
                const text = await file.text();
                wPreview.innerHTML = `
                  <div class="review-preview-bar">
                    <span class="review-preview-filename">📝 ${esc(name)}</span>
                  </div>
                  <pre class="review-preview-txt">${esc(text)}</pre>`;
            } else {
                _clearPreview();
                alert('Supported formats: PDF, HTML, TXT');
            }
        } catch (err) {
            wPreview.innerHTML = `<div class="review-preview-loading" style="color:var(--red)">
              Error loading file: ${esc(err.message)}</div>`;
        }
    }

    // ── AI analysis ──────────────────────────────────────────────────────────
    let _aiResult   = null; // cached analysis for this modal session
    const aiBtn     = overlay.querySelector('#aiBtn');
    const aiResultEl = overlay.querySelector('#aiResult');

    aiBtn.addEventListener('click', async () => {
        const notes = wNotes.hidden ? '' : wNotes.value.trim();
        if (!notes) {
            _flashBtn(aiBtn, wNotes.hidden ? 'Switch back to text to analyze' : 'Write your impressions first!');
            return;
        }

        _setAiState('loading');

        try {
            _aiResult = await analyzeReview(notes, {
                title:    movie.title,
                year:     movie.year,
                director: movie.director,
                genres:   movie.genres,
            });
            _setAiState('result', _aiResult);
        } catch (e) {
            _setAiState('error', e.message);
        }
    });

    function _setAiState(state, data) {
        aiResultEl.hidden = false;
        switch (state) {
            case 'loading':
                aiBtn.disabled = true;
                aiResultEl.innerHTML = `
                  <div class="ai-loading">
                    <div class="ai-spinner"></div>
                    <span>Analyzing with Gemini…</span>
                  </div>`;
                break;

            case 'result': {
                aiBtn.disabled = false;
                aiBtn.textContent = '✦ Re-analyze';
                const r = data;
                const sentimentColor = SENTIMENT_COLOR[r.sentiment] || 'var(--ink-dim)';
                const sentimentIcon  = SENTIMENT_EMOJI[r.sentiment] || '🎬';

                aiResultEl.innerHTML = `
                  <div class="ai-result-card">
                    <div class="ai-result-header">
                      <span class="ai-sentiment" style="color:${sentimentColor}">
                        ${sentimentIcon} ${_capitalize(r.sentiment)}
                      </span>
                      ${r.tone ? `<span class="ai-tone">${esc(r.tone)}</span>` : ''}
                    </div>

                    ${r.themes.length ? `
                    <div class="ai-badge-group">
                      <span class="ai-badge-label">Themes</span>
                      ${r.themes.map(t => `<span class="ai-badge ai-badge-theme">${esc(t)}</span>`).join('')}
                    </div>` : ''}

                    ${r.tags.length ? `
                    <div class="ai-badge-group">
                      <span class="ai-badge-label">Tags</span>
                      ${r.tags.map(t => `<span class="ai-badge ai-badge-tag">#${esc(t)}</span>`).join('')}
                    </div>` : ''}

                    ${r.recommendations.length ? `
                    <div class="ai-recs">
                      <span class="ai-badge-label">You might also like</span>
                      <ul class="ai-rec-list">
                        ${r.recommendations.slice(0,4).map(rec => `<li>${esc(rec)}</li>`).join('')}
                      </ul>
                    </div>` : ''}

                    ${!r._parsed ? `<p class="ai-raw-fallback">${esc(r._raw)}</p>` : ''}
                  </div>`;
                break;
            }

            case 'error':
                aiBtn.disabled = false;
                aiBtn.textContent = '↩ Retry';
                aiResultEl.innerHTML = `
                  <div class="ai-error">
                    <span>⚠ AI analysis failed</span>
                    ${data ? `<small>${esc(String(data))}</small>` : ''}
                  </div>`;
                break;
        }
    }

    // ── Save ─────────────────────────────────────────────────────────────────
    overlay.querySelector('#wSave').addEventListener('click', async () => {
        const btn = overlay.querySelector('#wSave');
        btn.disabled = true; btn.textContent = i18n.t('saving');

        const data = {
            rating:      parseFloat(slider.value),
            watchedDate: overlay.querySelector('#wDate').value,
            notes:       overlay.querySelector('#wNotes').value.trim(),
            isRewatch:   overlay.querySelector('#wRewatch').checked,
            isWatchlist: false,
            // Persist AI analysis if available
            ..._aiResult ? { aiAnalysis: {
                sentiment:  _aiResult.sentiment,
                tone:       _aiResult.tone,
                themes:     _aiResult.themes,
                tags:       _aiResult.tags,
            } } : {},
        };

        try {
            if (options.onSave) await options.onSave(data);
            close();
        } catch {
            btn.textContent = i18n.t('error');
            btn.disabled = false;
        }
    });

    return { close };
}

// ── helpers ────────────────────────────────────────────────────────────────

function _flashBtn(btn, msg) {
    const orig = btn.textContent;
    btn.textContent = msg;
    btn.disabled    = true;
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
}

function _capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
