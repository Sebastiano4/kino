# Kino — Istruzioni per continuare

> Leggi questo file all'inizio di ogni nuova sessione su Kino.

---

## 1. Cos'è Kino
App cinema PWA (vanilla JS + Firebase). Un sistema operativo cinematografico personale.
Identità visiva propria: palette cyan su sfondo deep blue-black, design premium.

## 2. Dove vive
- **Codice:** `C:\Users\gjela\OneDrive\Documenti\kino\`
- **URL:** **https://kino-sg.web.app**
- **Firebase project:** `sebas-reviews` (solo infrastruttura condivisa)
- **Design System:** `Downloads\kino_ui_ux_design_system.md`

## 3. Struttura
```
src/
  main.js              bootstrap + auth gate + viste
  core/
    firebase.js        config Firebase. APP_ID = "kino"
    auth.js            login Google, getUser, authReady
    router.js          registry viste (supporta .hidden)
    elo.js             engine ELO puro (zero DOM)
  data/
    repo.js            unico punto Firestore + export/import CSV/JSON
  services/
    tmdb.js            proxy TMDB (posterUrl, backdropUrl, genreList, etc.)
    omdb.js            rating IMDb via proxy
    ai.js              Gemini AI via proxy
  components/
    card.js            card film riusabile
    detail.js          modal dettaglio film con dati TMDB+IMDb completi
    filters.js         filtri avanzati + ordinamento (riusabile)
    watched.js         modal "segna come visto" (rating, data, note, rewatch)
  views/
    home.js            homepage immersiva (hero + stats + carousel) [hidden]
    explore.js         scoperta TMDB con filtri avanzati
    archive.js         film visti con filtri
    watchlist.js       film da vedere con filtri
    battle.js          duelli ELO 1v1
    vault.js           statistiche + ranking
    settings.js        account, preferenze, export/import [hidden]
  styles/
    tokens.css         design system v2: palette, elevazione, motion
    app.css            tutti i componenti: hero, carousel, modal, filtri, settings
```

### Navigazione
- Logo "Kino" → Home (hidden, non è un tab)
- Tab bar: Explore, Archive, Watchlist, Battle, Vault
- Gear icon → Settings (hidden)
- Power icon → Logout

### Come si aggiunge una modalità
1. Crea `src/views/nuova.js` con `{ id, label, mount, unmount?, hidden? }`
2. Importa e registra in `main.js`

### Regole architetturali
- Le viste NON importano Firestore: passano da `data/repo.js`
- Logica ELO in `core/elo.js`, pura (niente DOM)
- Un solo design system (`styles/`). Niente CSS che si combattono.
- API key segrete nelle Cloud Functions. Mai nel client.
- **Kino ha identità visiva propria.** Non copiare stili da altri progetti.

## 4. Stato attuale
**FUNZIONA:**
- [x] Login Google + auth gate
- [x] Home page immersiva (hero backdrop, stats, carousel recenti/watchlist/trending)
- [x] 5 viste principali: Explore, Archive, Watchlist, Battle, Vault
- [x] Settings: account, preferenze landing page, export CSV/JSON, import JSON
- [x] Modal dettaglio film: dati completi TMDB + IMDb (rating, voti, cast, regista, lingua, paesi, durata)
- [x] Watched experience: rating 1-10 (step 0.5), data visione, note, rewatch
- [x] Filtri avanzati combinabili: genere, anno, rating, durata, lingua, paese, regista, cast, preferiti, data aggiunta
- [x] Ordinamento: popolarità, valutazione, anno, titolo A-Z/Z-A, data aggiunta
- [x] Design v2: palette cyan premium, glass nav, hero sections, glow effects, carousel
- [x] PWA + service worker
- [x] Deployment scripts added: `deploy-git-firestore.bat` and `watch-and-deploy.ps1`

**DA FARE:**
1. Logo/icone proprie (`assets/icons/` sono placeholder)
2. Firestore Security Rules per `apps/kino/**`
3. Vault avanzato: grafici generi, mappa paesi
4. Light mode toggle
5. Notifiche PWA
6. Pagination / infinite scroll in Explore

## 5. Comandi
```powershell
cd C:\Users\gjela\OneDrive\Documenti\kino
firebase serve                             # http://localhost:5000
firebase deploy --only hosting:kino        # → https://kino-sg.web.app
.\deploy-git-firestore.bat                 # git add/commit/push + deploy hosting+kino,firestore
.\watch-and-deploy.ps1                     # watch folder and auto-run deploy on changes
```

## 6. Firestore Rules (da aggiungere)
```
match /apps/kino/users/{uid}/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

---
*Aggiornato 2026-06-01 v1.2*
