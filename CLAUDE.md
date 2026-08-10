# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

GarimpU Finch is a Windows desktop app (Electron) wrapping a local Node.js/Express server that scrapes hotel data (Booking.com, with an Expedia fallback), downloads photo galleries, and prepares CSV files compatible with a Wix hotel collection. An optional Python component (`organizar_hoteis.py`) classifies downloaded photos into categories using CLIP embeddings + KNN and YOLOv8 (person detection). Everything runs locally; there is no database, auth, or multi-user isolation. The UI text, code comments, and commit messages are in Portuguese (pt-BR) — keep new code/comments consistent with that.

## Commands

```powershell
# Run the server standalone (no Electron UI)
node scraper.js

# Run the full Electron app (rebuilds Tailwind + copies vendor JS first)
npm run dev

# Syntax-check every server-side JS file (mirrors CI)
npm run check

# Node tests (node:test), all files in test/
npm test
node --test test/scraper-fallback.test.js   # run a single test file

# Full local validation, same as .github/workflows/validate.yml
npm run validate

# Python side (optional organizer) — syntax + lightweight unit tests only,
# does NOT load torch/CLIP/Florence/YOLO or touch real images
npm run check:python
python -m unittest discover        # tests_python/
```

There is no separate lint step and no bundler for the frontend — `public/` is plain HTML/CSS/JS served statically, plus Tailwind CSS built to `public/vendor/tailwind.css` via `npm run prepare:assets`.

### Windows build/release (rarely needed; see `BUILD_WINDOWS.md`)

```powershell
npm run build:python      # PyInstaller build of the organizer -> build/python-organizer
npm run prepare:dist      # stage everything electron-builder needs
npm run build:win         # produce the NSIS installer (unsigned local build)
npm run release:win       # build + publish a GitHub Release (needs GH_TOKEN)
```

Publishing a release requires bumping `version` in `package.json`/`package-lock.json` first; the NSIS auto-updater checks GitHub Releases and won't see drafts. Users on versions before `1.2.0` must upgrade manually once.

## Configuration

All runtime config lives in `config/index.js`, resolved in this order: environment variable → `config/local.js` (gitignored, copy from `config/local.example.js`) → hardcoded default. Key values: `PORT`, `PASTA_IMAGENS` (photo storage root, also served at `/img`), `PASTA_FLORENCE` (folder the Python organizer processes), `PASTA_LOGS_FLORENCE`, `LATITUDE_PADRAO`/`LONGITUDE_PADRAO` (airport-distance fallback), `PYTHON_EXECUTABLE`, `PUPPETEER_EXECUTABLE_PATH`. In the packaged Electron app these are instead set as `process.env.*` at startup by `electron/main.js` (see `configurarAmbiente`), which also picks a free port, waits on `/api/health`, and points Puppeteer/Python at bundled resources (`resourcesPath`) instead of the project tree.

## Architecture

### Request flow
`scraper.js` builds the Express app (`criarAplicacao`) and wires three routers plus static file serving:
- `routes/buscar.routes.js` → `POST /api/buscar`, the main hotel-search endpoint
- `routes/galeria.routes.js` → gallery/local-image endpoints
- `routes/organizacao.routes.js` → start/status endpoints for the Python image organizer, backed by `state/status-organizacao.js`

`scraper.js` also exports `iniciarServidor`/`encerrarServidor`, which is what `electron/main.js` calls (rather than running the file directly) — the Electron main process treats the Express app as a managed subsystem it starts, health-checks, and tears down on quit/update.

### Scraper coordinator and provider fallback
`services/scraper.service.js` is a **factory** (`criarCoordenadorScraper`) that takes `buscarNaBooking`, `buscarNaExpedia`, and `lancarBrowser` as injected dependencies — this is what lets `test/scraper-fallback.test.js` exercise the Booking→Expedia fallback logic without Puppeteer or network access. The module-level default export wires the factory to the real providers and a real `puppeteer.launch(...)`.

Flow for `rasparDadosHotel`:
1. Classify the input as free text, a Booking URL, or an Expedia URL (`classificarEntrada`); URLs are validated against an allowlist (`validarUrlPermitida`).
2. Try Booking first (unless the input is an explicit Expedia link). On a Booking failure that qualifies for fallback (`ehErroQueAcionaFallback`, see `services/scraper/scraper-errors.js`), close the current Puppeteer page, open a fresh one on the **same browser instance**, and retry on Expedia — using a term derived from the failed Booking link (`derivarTermoDeLinkBooking`) when the original input was a URL rather than free text.
3. If both fail, the errors from both providers are combined into one message (`montarMensagemFalhaCombinada`).

Since candidate selection (`escolherMelhorCandidato`/`candidatoCompativel` in `scraper-utils.js`) matches only on hotel name text, a same-named hotel in the wrong city/country can be picked. Before returning, `rasparDadosHotel` calls `avaliarLocalizacaoForaDaArea` to compare the scraped hotel's GPS (`coordenadas`) against the search's reference point (`latitudeReferencia`/`longitudeReferencia`, the same coordinates used for the airport-distance fallback); if farther than `RAIO_ALERTA_LOCALIZACAO_KM` (300 km), the response carries `localizacaoForaDaArea: true` and `distanciaReferenciaKm`. The frontend never blocks on this — the hotel is kept in the result/CSV like any other. In single search (`public/js/busca.js`, `iniciarBusca`) it just swaps the final status message for a warning; in batch search (`pesquisarHoteisEmLote`) the row is styled as a warning instead of success and the hotel is added to `hoteisLocalizacaoSuspeita`, which feeds the "copiar lista" button (`btnCopiarProblemasLote`/`copiarProblemasLote`) shown at the end of the batch results once the run finishes, alongside hotels that errored out (`hoteisComErro`).

Provider-specific scraping (DOM selectors, regex extraction, photo URL discovery) lives in `services/scraper/booking.provider.js` and `services/scraper/expedia.provider.js`; shared helpers (name normalization, folder naming, distance calc, URL allowlisting) are in `services/scraper/scraper-utils.js`.

Open browsers are tracked in a `Set` so `encerrarServidor()`/Electron shutdown can force-close any in-flight Puppeteer sessions (`fecharNavegadoresAtivos`).

### Python image organizer
`organizar_hoteis.py` (root) plus the `python_organizador/` package classify photos in `PASTA_FLORENCE` into `entretenimento`, `gastronomia`, `acomodacoes`, `criancas` using CLIP embeddings (cached in `cache_embeddings_treino.npz`, trained against `Fotos exemplos/`) + KNN, and YOLOv8 (`yolov8n.pt`) for person detection. It also writes `alt_texts.json` per hotel and appends run metadata to `logs/florence/log_classificacao_florence.csv`, which the "Organização IA" tab in the UI reads to estimate future run durations. `services/organizador-python.service.js` and `services/python-runtime.service.js` launch/monitor this as a subprocess (a packaged PyInstaller `.exe` in the built app, or `PYTHON_EXECUTABLE` in dev). This is a separate, potentially slow/CPU-bound process from the main scrape — do not assume it runs synchronously with `/api/buscar`. Python 3.12.x specifically is required.

### Frontend
`public/index.html` + `public/js/*.js` (no framework, no bundler): `busca.js` (search + batch search + CSV accumulation/export, the largest file), `interface.js` (general UI wiring), `galeria.js` (photo gallery, ZIP download via JSZip), `organizacao.js` (Python organizer tab/status polling), `configuracoes.js` (Electron settings IPC), `tema.js` (palette/theme switching), `navegacao.js`. Tailwind CSS, JSZip, and Papa Parse are pulled from CDN in non-bundled dev mode but vendored locally for the packaged app via `scripts/copy-vendor.js`.

### CSV/Wix integration (frontend-only logic, in `busca.js`)
Two export modes: without a Wix CSV, hotels accumulate in-memory and export as `Hoteis_Dados_Acumulados.csv` with generated UUIDs for missing IDs; with a full Wix-exported CSV (must contain `ID` and `Nome_Hotel` columns), existing rows are matched and updated **only** by exact ID match (an unmatched ID is rejected rather than silently creating a duplicate), and new rows get a generated UUID. All accumulated data lives only in page memory — a reload discards anything not yet exported.

## Testing notes

- Tests use Node's built-in `node:test` runner (`test/*.test.js`), no separate framework.
- `test/scraper-fallback.test.js` is the reference example for testing the scraper coordinator: it injects fake `buscarNaBooking`/`buscarNaExpedia`/`lancarBrowser` into `criarCoordenadorScraper` instead of hitting real sites.
- Python tests (`tests_python/`, run via `python -m unittest discover`) are intentionally lightweight — they check syntax/logic only and never load torch/CLIP/Florence/YOLO or perform real scraping/image processing, matching what CI runs.

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
rtk uv run <cmd>        # Compact uv project command output
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->