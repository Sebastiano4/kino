/**
 * AI SERVICE — Gemini via Cloud Function `analyzeReview`.
 *
 * Part 5: structured response mode.
 * analyzeReview() now requests a JSON envelope from Gemini with:
 *   { sentiment, tone, themes, tags, recommendations }
 *
 * Falls back to raw string if parsing fails (backward compat).
 * All results include a `_raw` field for debugging.
 */

import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-functions.js";
import { functions } from '../core/firebase.js';

const fn = httpsCallable(functions, 'analyzeReview');

/**
 * Low-level action call (unchanged API — used by other parts of the app).
 * @param {'sentiment'|'summary'|'title'|'advice'|'chat'|'analyze'} action
 * @param {string} reviewText
 * @returns {Promise<string>}
 */
export async function ai(action, reviewText) {
    const r = await fn({ action, reviewText });
    return r.data?.result ?? '';
}

/**
 * Rich structured analysis of a film review / notes.
 * Returns a structured object. Falls back gracefully on partial responses.
 *
 * @param {string} reviewText  — the user's notes / mini-review
 * @param {object} movieMeta   — { title, year, director?, genres? } for context
 * @returns {Promise<AnalysisResult>}
 *
 * @typedef {object} AnalysisResult
 * @property {'positive'|'neutral'|'negative'|'mixed'} sentiment
 * @property {string}   tone           — e.g. 'nostalgic', 'critical', 'enthusiastic'
 * @property {string[]} themes         — e.g. ['identity', 'loss', 'redemption']
 * @property {string[]} tags           — e.g. ['slow-burn', 'visually stunning', 'overrated']
 * @property {string[]} recommendations — similar films the AI suggests
 * @property {string}   _raw           — raw AI response (debug)
 * @property {boolean}  _parsed        — whether JSON parsing succeeded
 */
export async function analyzeReview(reviewText, movieMeta = {}) {
    const context = [
        movieMeta.title ? `Movie: ${movieMeta.title} (${movieMeta.year || ''})` : '',
        movieMeta.director ? `Director: ${movieMeta.director}` : '',
        movieMeta.genres?.length ? `Genres: ${movieMeta.genres.join(', ')}` : '',
        `Review: ${reviewText}`,
    ].filter(Boolean).join('\n');

    const result = await ai('analyze', context);

    // Attempt JSON parse — Gemini prompted to return JSON via Cloud Function
    try {
        const json = JSON.parse(result);
        return {
            sentiment:       _normalizeSentiment(json.sentiment),
            tone:            String(json.tone           || ''),
            themes:          _toArray(json.themes),
            tags:            _toArray(json.tags),
            recommendations: _toArray(json.recommendations),
            _raw:            result,
            _parsed:         true,
        };
    } catch {
        // Graceful fallback: derive sentiment from keywords
        const lower = result.toLowerCase();
        const sentiment = lower.includes('positive') ? 'positive'
            : lower.includes('negative')             ? 'negative'
            : lower.includes('mixed')                ? 'mixed'
            : 'neutral';

        return {
            sentiment,
            tone:            '',
            themes:          [],
            tags:            [],
            recommendations: [],
            _raw:            result,
            _parsed:         false,
        };
    }
}

// ── helpers ────────────────────────────────────────────────────────────────

function _normalizeSentiment(s) {
    const map = { positive: 'positive', negative: 'negative', neutral: 'neutral', mixed: 'mixed' };
    return map[String(s || '').toLowerCase()] || 'neutral';
}

function _toArray(v) {
    if (Array.isArray(v)) return v.map(String).filter(Boolean);
    if (typeof v === 'string' && v) return [v];
    return [];
}
