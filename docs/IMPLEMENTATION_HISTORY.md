# 历史实现记录

此文件保留早期实现与验证记录，描述的是各次交付时的状态；当前功能与使用方式以仓库首页为准。

# 棋间 / Knight Room

A Chinese-language local chess practice app inspired by familiar chess-site workflows. Independently implemented; not affiliated with Chess.com. The existing deployment is public.

## Implemented

- Human vs Stockfish (three uncalibrated skill settings) and two players on one device.
- Legal move validation, castling, en passant, four promotion choices, check/checkmate and common draw detection.
- Untimed, 10-minute, and 5+3 training games. Clock runs during normal replay; first move starts the clock. Entering Game Review pauses a live local game and its clock until Return to game is selected.
- Undo, resign, board flip, full move history, replay navigation.
- Position analysis, move hints, PGN import/export. Imported games are read-only replays.
- Game Review for completed games, recorded fragments of live games, and imported PGNs: per-player accuracy, move classifications, blunder navigation, best-move highlights, evaluation graph and timeline, cancellable fast/detailed local analysis. Clicking with no moves gives explicit guidance; clicking with moves immediately shows loading/progress. Incomplete games are labeled as fragments and do not receive estimated ratings.
- Experimental Elo-scale performance display, with disclosed hand-authored interpolation and wide illustrative ranges. This is uncalibrated and is not a prediction of Chess.com/FIDE ratings. Incomplete or insufficient samples do not get a performance estimate.
- Responsive mouse, keyboard, and touch interface. Games exist only in current page memory.
- Feature-detected WebMCP read-position, play-move, start-review and read-review tools.

## Boundaries

No online opponents, accounts, rating ladder, anti-cheat, courses, puzzle database, cloud persistence, or billing. The clock and draw handling are for practice, not tournament adjudication. No estimated Elo is assigned to engine settings. The bundled engine is Stockfish.js 10.0.2 for small downloads and browser compatibility, not the newest Stockfish.

## Validation

JavaScript syntax and local asset checks passed. A jsdom integration run exercised the actual Stockfish JavaScript engine inside a worker simulation: valid/invalid moves, computer reply, undo, stale-search cancellation, mate, replay, castling, en passant, knight underpromotion, valid/invalid PGN import, analysis, time increment and countdown.

This was a DOM/worker simulation, not real-browser or macOS QA. No permitted supported WebMCP browser context was available; registration and representative valid/invalid tool calls were exercised in simulation only. Static HTML has no managed preview server in this environment.

Game Review button regression: reproduced the disabled-button no-response state after two legal moves. DOM/real-engine checks cover empty-game feedback, visible loading, live-game analysis, clock pause/resume, returning from a historical board to the actual live position, cancellation, cancelling/resuming a pending computer reply, new-game invalidation, finished PGN review, and visible engine-load failure followed by successful retry.

Review unit checks: `node --test tests/review.test.mjs`. They cover white/black evaluation signs, forced mates, thresholds, aggregation, sample gating, custom FEN turn/fullmove numbering, repetition with complete move history, resignation vs board evaluation, and cancellation. Real-engine DOM integration additionally covers Fool's Mate blunder detection, both accuracy cards, notation annotations, mistake filtering/navigation, suggested-move highlights, timeline, importing during analysis, cancellation and a 33-ply completed game.

## Review method

`dist/review.mjs` independently implements the public centipawn-to-winning-chances and move-accuracy formulas documented at https://lichess.org/page/accuracy. No CAPS parity or Lichess game-score parity is claimed. Engine-selected and sole legal moves receive 100 accuracy, avoiding false blunders from adjacent timed searches with different horizons. Other moves use nonnegative loss in winning-chances score. Local volatility uses up to five adjacent position scores, clamped to a weight of 1–12; each side's game accuracy averages its volatility-weighted mean and harmonic mean. A loss of 20 / 10 / 5 percentage points marks a blunder / mistake / inaccuracy. Mate endpoints are exact; rule draws retain full game history. Resignation and timeout results do not overwrite the engine's last board evaluation.

The illustrative performance anchors are (accuracy, score): (0,100), (40,400), (60,800), (70,1100), (80,1450), (90,1850), (95,2200), (100,2600). Values interpolate linearly and round to 50. Display bands are ±400, or ±600 with fewer than 15 informative moves, clipped to 100–3000. They are not confidence intervals. Completed games need at least 10 moves by that side and 6 informative moves (multiple legal choices, pre-move chance score 10–90). All formulas and limitations are available in the UI. Stockfish 10 and bounded local search can miss tactics, especially on slow devices; the report shows actual depth.

## Third-party code

chess.js 1.4.0 (BSD-2-Clause) and stockfish.js 10.0.2 (GPL-3.0). Licenses are in `dist/vendor/`. Exact Stockfish source and build scripts are provided in `dist/vendor/stockfish-source.tar.gz`, corresponding to upstream commit `e105072e84cf8ee5dd5219e2c5be29c3b8bf8a5a`. Browser engine binary is the unmodified npm package asset. All site runtime assets are local; no CDN is required.

## Hosting

The chess client source remains under `dist/` for compatibility with the existing project. `npm run build` copies browser assets to `dist/client/` and bundles the Worker to `dist/server/index.js`. Sites provides the `DB` D1 binding. The generated Drizzle migration creates the anonymous notebook and session tables. Build output and dependencies are ignored; project identity and its public audience are preserved.


## Personal mistake training (2026-09-22)

After review, select your own color and save inaccuracies, mistakes, blunders, and missed mates that have a legal different engine recommendation. A position plus reference move is deduplicated. Chinese explanations describe legal moves and engine variations; theme tags are coarse rules, not a language model or certified chess coach. The notebook's theme/phase counts describe only collected positions, not overall playing strength.

The practice dialog uses an independent board and pauses the current game. Any promotion is selectable. Stored best moves pass immediately. Other legal moves are searched with Stockfish for both the original and resulting position: the current engine first choice or a move within two winning-chance percentage points at depth 8+ passes. Insufficient depth is inconclusive. Timed engine searches remain approximate. Hints, failed attempts, and revealed solutions do not count as independent solutions. Due exercises progress through 1, 3, 7, 14, 30 days; assistance/error schedules 10 minutes. Free practice does not advance a future due date. These intervals are product defaults, not a validated optimum.

`worker/notebook.mjs` stores notebooks in D1, isolated by a random 256-bit HttpOnly, Secure, SameSite=Strict cookie; only its SHA-256 digest is stored as the owner key. POST requires the matching Origin and JSON content type. Updates use optimistic revision checks, attempts use idempotency keys, and not-yet-due exercises cannot be repeatedly scored from stale tabs. There is no login or cross-device account syncing. A lost/expired cookie cannot recover access; users can export and restore JSON backups. Each notebook holds 500 deduplicated positions. Clearing deletes its contents. Game PGNs remain in the current page unless exported; saving a notebook sends only selected positions and engine variations, not the full PGN.

Validation: `npm test` covers evaluation rules, move validation, spaced review, visitor isolation, persistence, deduplication, idempotent grading, stale-tab prevention, concurrent updates, backup import, origin rejection, and clearing. DOM integration with real Stockfish and a real SQLite-backed API exercises review-to-notebook, training, hints, save failure/retry, and the unchanged original board. Existing Game Review pause/resume, cancellation, computer reply, and engine-failure regression flows also pass. Managed browser preview is unavailable for this Worker/static architecture; no visual or physical-device QA is claimed.

Run `npm ci`, `npm test`, `npm run build`. Source changes to the database schema require `npm run db:generate`; inspect and keep applied migrations immutable.


## First-visit and sharing improvements

The board now has visible sample, PGN import, and review actions. `?challenge=mate` opens the one-move mating example directly without replacing an existing game record. In-page training pauses a live game; its return action resumes that same position. A round summary distinguishes independent solutions, assisted/revealed solutions, and skips; examples do not enter personal statistics. The sample link can be copied, with a selectable text fallback when clipboard access is unavailable.

The PGN dialog accepts local `.pgn`/`.txt` files up to 200 KB as well as pasted text. A file read canceled by closing the dialog cannot overwrite a later draft. Review displays an approximate duration and surfaces up to three important errors for the selected color before the full report. A visible review button opens the completed report without unnecessarily recomputing it.

Additional real-engine DOM checks cover the challenge URL, honest round summary, link-copy fallback, live-game return, top-level review action, PGN file reading/cancellation, and color-specific priority errors. Existing notebook and review regression checks remain green. This is interaction/logic validation, not a physical-phone visual test.


## Daily rhythm, preparation and nearby chess

Free toolkit routes: `?tool=daily`, `?tool=prepare`, `?tool=nearby`. Opening a toolkit pauses the local game and returning resumes it. Daily rhythm is an experimental, user-defined precommitment tool: set a game/time budget and loss-streak reminder, manually record completed games, correct entries, finish with a reflection, and bring that reminder into the next session. It does not infer mental state, predict ratings, monitor external live games or block external websites. No automated notifications or background tasks are created. The anonymous session API shares the HttpOnly notebook cookie, stores its digest as owner, checks Origin, and uses optimistic revision writes. It keeps 60 sessions and supports export and deletion.

Opponent preparation imports public completed games from the official Lichess or Chess.com APIs (100-game limit), or parses a local multi-game PGN (2 MB / first 100 games). Local PGNs stay in-page. Reports disclose sample sizes, player perspective and incomplete coverage. Trend comparisons require at least 20 dated games of one time class and color. Low opening-line results are leads for investigation, not causal weaknesses or claims about a person's state. Time classes are normalized from base time + 40 increments, not guaranteed identical to either platform's labels. The shadow repertoire follows actual observed moves up to 12 full moves and stops where samples end; it is not a cloned personality or playing strength. Evidence games can be sent into the existing PGN import/review flow.

Nearby chess searches a bundled GeoNames cities15000 snapshot, or requests geolocation only on explicit click. Rounded coordinates are sent to the VK Maps Overpass endpoint. Public map records are cached for one hour; public game responses for 15 minutes. External paths are fixed and input is bounded. Venue type is inferred from tags, private/no-access locations are omitted, and no real-world availability is asserted. Coverage is incomplete. Public providers can time out; errors retain independent map search links and never become false zero-result claims. GeoNames licensing is included with the data.

Validation: 16 automated tests pass, including revision conflicts, visitor isolation, daily rules, PGN deduplication/perspective/small-sample guards and safe map filtering. DOM checks with real SQLite cover daily error/retry/reload, legal shadow replies, evidence import, city search and place/error fixtures. Existing review and training flows still pass with the real Stockfish worker. Read-only integration calls successfully parsed 100 games from each official chess API; a VK Maps Overpass query for central London returned real map elements. No browser visual or physical-device QA is claimed.

See `docs/DAILY_PRODUCT_RESEARCH.md` for competitive overlap, sources, uncertainty and the proposed retention experiment. This release does not establish huge market demand, willingness to pay or a unique killer feature.
