# Graph Report - kino  (2026-06-05)

## Corpus Check
- 40 files · ~361,822 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 424 nodes · 862 edges · 20 communities (16 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1dd493cb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]

## God Nodes (most connected - your core abstractions)
1. `openDetail()` - 22 edges
2. `_openSheet()` - 15 edges
3. `seedElo()` - 13 edges
4. `updateMovie()` - 12 edges
5. `movieDetails()` - 12 edges
6. `_renderHome()` - 12 edges
7. `posterUrl()` - 11 edges
8. `_buildWorldMap()` - 11 edges
9. `call()` - 10 edges
10. `_renderCollection()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `subscribe()` --calls--> `fn`  [INFERRED]
  src/core/store.js → src/services/ai.js
- `_broadcast()` --calls--> `fn`  [INFERRED]
  src/core/store.js → src/services/ai.js
- `normalize()` --calls--> `posterUrl()`  [EXTRACTED]
  src/views/explore.js → src/services/tmdb.js
- `_render()` --calls--> `openDetail()`  [EXTRACTED]
  src/views/archive.js → src/components/detail.js
- `_renderCollection()` --calls--> `openDetail()`  [EXTRACTED]
  src/views/vault.js → src/components/detail.js

## Communities (20 total, 4 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.09
Nodes (47): _ACCENTS, _appendProviders(), _directorAccent(), _dmRow(), _eloTier(), esc(), _fmtDate(), _fmtDateLong() (+39 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (46): sortMovies(), BADGE_TIERS, computeBadgeBreakpoints(), getBadge(), tallyBadges(), aggregateByCountry(), aggregateByISO(), ALIASES (+38 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (25): esc(), openWatchedModal(), SENTIMENT_COLOR, SENTIMENT_EMOJI, dict, subs, abbr(), esc() (+17 more)

### Community 3 - "Community 3"
Cohesion: 0.12
Nodes (33): getUser(), destroy(), clearOperation(), getPending(), openDB(), queueOperation(), addMatch(), addMovie() (+25 more)

### Community 4 - "Community 4"
Cohesion: 0.36
Nodes (9): _cached(), _inflight, _load(), _persist(), personImage(), _remember(), _resolve(), _viaRestSummary() (+1 more)

### Community 5 - "Community 5"
Cohesion: 0.12
Nodes (23): _applyFilters(), expectedScore(), kFactor(), pickPair(), resolveMatch(), seedElo(), _selectPair(), tierOf() (+15 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (25): login(), logout(), onAuth(), subs, app, auth, db, firebaseConfig (+17 more)

### Community 7 - "Community 7"
Cohesion: 0.17
Nodes (12): _hashId(), _hideLoadingSpinner(), navigate(), _order, register(), registerLazy(), _resolve(), _routes (+4 more)

### Community 8 - "Community 8"
Cohesion: 0.14
Nodes (13): 1. Cos'è Kino, 2. Dove vive, 3. Struttura, 4. Stato attuale, 5. Comandi, 6. Firestore Rules (da aggiungere), 7. Cloud Functions (Firebase), code:block1 (src/) (+5 more)

### Community 9 - "Community 9"
Cohesion: 0.07
Nodes (26): esc(), movieCard(), createFilterBar(), _dualSliderHTML(), esc(), filterMovies(), _inlineSection(), LANGUAGES (+18 more)

### Community 10 - "Community 10"
Cohesion: 0.11
Nodes (25): esc(), _root(), showToast(), appendMovie(), _broadcast(), getState(), init(), patchMovie() (+17 more)

### Community 11 - "Community 11"
Cohesion: 0.22
Nodes (8): Aggiungere una nuova modalità, code:block1 (src/), code:bash (firebase login                       # se non già loggato), Dati, Firebase — primo deploy, Kino, Stato, Struttura

### Community 12 - "Community 12"
Cohesion: 0.22
Nodes (8): background_color, description, display, icons, name, short_name, start_url, theme_color

### Community 14 - "Community 14"
Cohesion: 0.25
Nodes (7): firestore, rules, hosting, ignore, public, rewrites, target

### Community 20 - "Community 20"
Cohesion: 0.46
Nodes (7): _buildOverlay(), _computeStats(), _drawCard(), _loadImg(), openWrapped(), _showError(), _wrapText()

## Knowledge Gaps
- **88 isolated node(s):** `rules`, `target`, `public`, `ignore`, `rewrites` (+83 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `openDetail()` connect `Community 0` to `Community 9`, `Community 10`, `Community 2`, `Community 1`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `init()` connect `Community 10` to `Community 0`, `Community 1`, `Community 2`, `Community 3`, `Community 5`, `Community 6`, `Community 9`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `subscribe()` connect `Community 10` to `Community 0`, `Community 1`, `Community 2`, `Community 3`, `Community 6`, `Community 9`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **What connects `rules`, `target`, `public` to the rest of the system?**
  _88 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08563134978229318 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06041986687147977 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07560975609756097 - nodes in this community are weakly interconnected._