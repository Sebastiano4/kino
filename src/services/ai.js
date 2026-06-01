/** Gemini via Cloud Function `analyzeReview`. action: sentiment|summary|title|advice|chat */
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-functions.js";
import { functions } from '../core/firebase.js';

const fn = httpsCallable(functions, 'analyzeReview');

export async function ai(action, reviewText) {
    const r = await fn({ action, reviewText });
    return r.data?.result ?? '';
}
