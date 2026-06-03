# Kino — Istruzioni per continuare

> Leggi questo file all'inizio di ogni nuova sessione su Kino.

---

## 1. Cos'è Kino
App cinema PWA (vanilla JS + Firebase). Un sistema operativo cinematografico personale.
Identità visiva propria: palette cyan su sfondo deep blue-black, design premium.

## 2. Dove vive
- **Codice:** `C:\Users\gjela\OneDrive\Documenti\kino\`
- **GitHub:** `https://github.com/Sebastiano4/kino` (branch `master`)
- **URL produzione:** `https://kino-sg.web.app`
- **Firebase project:** `sebas-reviews` (infrastruttura condivisa)
- **Design System:** `Downloads\kino_ui_ux_design_system.md`

## 3. Struttura
```
src/
  main.js              bootstrap + auth gate + store lifecycle + gesture init
  core/
    firebase.js        config Firebase. APP_ID = "kino"
    auth.js            login Google, getUser, authReady
    router.js          registry viste (supporta .hidden), lazy load, error boundary
    elo.js             engine ELO puro (zero DOM), _fmtDelta 2 decimali
    i18n.js            sistema i18n: i18n.t(key), i18n.setLang(code), default EN
    store.js           reactive store pattern (subscribe/notify)
    theme.js           dark/light mode, token CSS, NO-FOUC init
    gestures.js        swipe tab navigation con momentum e spring animation
  data/
    repo.js            unico punto Firestore + export/import CSV/JSON
    offline.js         offline queue per operazioni Firestore
  services/
    tmdb.js            proxy TMDB (posterUrl, backdropUrl, genreList, watch/providers)
    omdb.js            rating IMDb via proxy Cloud Function
    ai.js              Gemini AI via proxy
  components/
    card.js            card film riusabile
    detail.js          modal dettaglio: TMDB+IMDb+Metacritic, poster lightbox, accessibilità
    filters.js         filtri avanzati + ordinamento, i18n completo
    watched.js         modal "segna come visto" (rating 0.5 step, data, note, rewatch)
    toast.js           notifiche toast (success/error/info)
    wrapped.js         Kino Wrapped: social sharing con canvas Instagram story
  views/
    home.js            homepage (hero backdrop, stats, carousel) [hidden]
    explore.js         scoperta TMDB con filtri avanzati + infinite scroll
    archive.js         film visti con filtri, i18n
    watchlist.js       film da vedere con filtri, Smart Watchlist modes
    battle.js          duelli ELO 1v1, store-based, deduplication, filter modes
    vault.js           statistiche + ranking + 6 grafici analytics (Chart.js)
    settings.js        account, Kino Wrapped launcher, export/import, glassmorphism sheet
  styles/
    tokens.css         design system v2: palette, elevazione, motion, light/dark tokens
    app.css            tutti i componenti: hero, carousel, modal, filtri, battle, lightbox
```

### Navigazione
- Logo "Kino" → Home (hidden, non è un tab)
- Tab bar: Explore, Archive, Watchlist, Battle, Vault
- Gear icon → Settings (hidden)
- Power icon → Logout
- Swipe gesture: navigazione tab con momentum

### Regole architetturali
- Le viste NON importano Firestore: passano da `data/repo.js`
- Logica ELO in `core/elo.js`, pura (niente DOM)
- Un solo design system (`styles/`). Niente CSS che si combattono.
- API key segrete nelle Cloud Functions. Mai nel client.
- Tutte le stringhe UI passano per `i18n.t(key)` — no hardcoded in italiano
- **Kino ha identità visiva propria.** Non copiare stili da altri progetti.

## 4. Stato attuale
**FUNZIONA:**
- [x] Login Google + auth gate
- [x] Home page immersiva (hero backdrop, stats, carousel recenti/watchlist/trending)
- [x] 5 viste principali: Explore, Archive, Watchlist, Battle, Vault
- [x] Settings: account, preferenze landing page, export CSV/JSON, import JSON
- [x] Modal dettaglio: TMDB + IMDb + Metacritic + TMDB rating, poster lightbox, accessibilità, i18n
- [x] Watched experience: rating 1-10 (step 0.5), data visione, note, rewatch
- [x] Filtri avanzati combinabili: genere, anno, rating, durata, lingua, paese, regista, cast, preferiti
- [x] Ordinamento: popolarità, valutazione, anno, titolo A-Z/Z-A, data aggiunta
- [x] Design v2: palette cyan premium, glass nav, hero sections, glow effects, carousel
- [x] PWA + service worker (network-first code, cache-first assets)
- [x] i18n completo (EN default, IT disponibile) — tutte le viste e componenti
- [x] Dark/light mode con token CSS e NO-FOUC script
- [x] Reactive store pattern per tutte le viste principali
- [x] Swipe gesture navigation con momentum e spring animation
- [x] Infinite scroll in Explore
- [x] Offline queue per operazioni Firestore
- [x] Vault analytics: 6 grafici (Chart.js), top generi, mappa paesi, trend annuale
- [x] Kino Wrapped: social sharing con canvas Instagram story
- [x] Toast notifications component
- [x] Battle: ELO delta 2 decimali, filter modes, deduplication
- [x] Streaming providers (TMDB Watch Providers API) nel modal dettaglio
- [x] Deployment scripts: `deploy-git-firestore.bat`, `watch-and-deploy.ps1`

**DA FARE:**
1. Logo/icone proprie (`assets/icons/` sono placeholder)
2. Firestore Security Rules per `apps/kino/**` (vedi sezione 6)
3. Fix tmdbProxy Cloud Function: restituisce 403 Forbidden su richieste autenticate
4. Notifiche PWA (push notifications)
5. Crew data (director filmography, actor detail pages)
6. AI thematic exploration (Gemini integration nella vista Explore)

## 5. Comandi
```powershell
cd "C:\Users\gjela\OneDrive\Documenti\kino"
firebase serve                              # http://localhost:5000
firebase deploy --only hosting:kino        # → https://kino-sg.web.app
.\deploy-git-firestore.bat                 # git add/commit/push + deploy hosting+firestore
.\watch-and-deploy.ps1                     # watch + auto-deploy on changes
git push origin master                     # solo GitHub
```

## 6. Firestore Rules (da aggiungere)
```
match /apps/kino/users/{uid}/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

## 7. Cloud Functions (Firebase)
Le API key segrete vivono nelle Cloud Functions in `functions/`:
- `tmdbProxy` — proxy TMDB (⚠️ restituisce 403, da investigare)
- `omdbProxy` — rating IMDb via OMDb API (funzionante, key in `.env`)
- `aiProxy` — Gemini AI (non ancora integrato nel client)

Il problema 403 sul tmdbProxy è persistente: il token JWT viene inviato correttamente
ma la Cloud Function rifiuta. Non blocca le funzionalità principali dell'app.

---
*Aggiornato 2026-06-03 v1.3*
