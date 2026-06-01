# Kino

App cinema. Stessa infra Firebase di *sebas-reviews*, **dati isolati** sotto
`apps/kino/...`. Architettura modulare: una vista = un file registrato nel router.

## Struttura
```
src/
  core/      firebase, auth, router (registry viste), elo (engine puro)
  data/      repo.js  — UNICO punto Firestore
  services/  tmdb, omdb, ai — client delle Cloud Functions (riusate)
  views/     explore, archive, watchlist, battle, vault
  components/ card.js
  styles/    tokens.css + app.css  (UN design system)
  main.js    bootstrap + auth gate
```

## Aggiungere una nuova modalità
1. Crea `src/views/mia-vista.js` che esporta `{ id, label, mount(el, ctx) }`.
2. In `src/main.js`: importa e aggiungila all'array di `register`.
Fine. Tab e routing automatici.

## Firebase — primo deploy
Stesso progetto `sebas-reviews`, nuovo sito hosting `kino`.

```bash
firebase login                       # se non già loggato
firebase hosting:sites:create kino   # crea il sito (una tantum)
firebase deploy --only hosting:kino  # deploy
```
URL: https://kino.web.app

> Le Cloud Functions (tmdbProxy/omdbProxy/analyzeReview) e le API key sono già
> deployate nel progetto sebas-reviews: Kino le riusa, niente da configurare.

## Dati
Tutto sotto `apps/kino/users/{uid}/movies`. Non tocca i film di sebas-reviews.
Cache OMDb (`omdb_cache`) resta condivisa — è solo cache pubblica di rating IMDb.

## Stato
- [x] Foundation: auth, router, data layer, services, design system, PWA
- [x] Viste: explore (TMDB+IMDb+add), archive, watchlist, battle (Elo), vault
- [ ] Modal dettaglio film + form voto/recensione completo
- [ ] Vault: grafici (Chart.js) e mappa (Leaflet) on-demand
- [ ] Logo/icone proprie (ora placeholder da sebas-reviews)
- [ ] Firestore rules per path `apps/kino/**`
