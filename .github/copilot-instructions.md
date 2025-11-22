<!-- Auto-generated guidance for GitHub Copilot / coding agents. Keep concise (~20-50 lines). -->
# Sofia Memory Plugin — quick instructions for AI coding agents

Summary
- Minimal Node.js service that exposes a REST API to store and retrieve "memory" files (local or GitHub-backed).
- Key entrypoints: `server.js` (simple local server), `src/` (core plugin code), `memory/` (sample data), `tests/` (integration/unit test harness).

What matters for code changes
- Default port and start: server listens on PORT (env) default 10000; `npm start` runs `node server.js`.
- Required secret: `TOKEN_SECRET` — tests will auto-populate a deterministic value when missing, but production must provide a secure secret.
- Memory mode: configured via `MODE` env var or `config/config.json` (`memory.mode`) — modes: `github` (default) or `local`.

Developer workflows (explicit steps)
- Install: `npm install`.
- Run the server: `PORT=10001 npm start` (on Windows PowerShell: `$env:PORT='10001'; npm start`).
- Run tests: `npm test` — uses `tests/runAll.js` which sets a test `TOKEN_SECRET` if missing; tests call both `.js` and `.ts` tests via `ts-node`.
- Build OpenAPI: `npm run build:openapi`; Prepare for Render: `npm run prepare:render` (requires PUBLIC_BASE_URL in production).
- Mock GitHub for offline debugging: `node scripts/mock_github_api.js --port 9999` then set `GITHUB_API_URL=http://localhost:9999`.

Patterns and conventions (project-specific)
- API status messaging: many endpoints return application-level `{ ok: boolean, error? }` at HTTP 200; don't assume non-200 == error. Inspect `README.md` and `openapi.yaml` for route contracts.
- Filesystem vs GitHub: local memory files live under `memory/` and the code supports switching between `local` and `github` memory modes. See `utils/memory_mode.js` and `tools/token_store.js`.
- Token handling: GitHub tokens are encrypted with `TOKEN_SECRET` and stored under `tools/.cache/tokens/<userId>.txt` — avoid printing tokens to logs or tests.
- Tests and harness: `tests/runAll.js` drives the suite and uses `ts-node/register/transpile-only` — add new tests alongside existing `*.test.js` or `*.test.ts` files.

Files to inspect first when changing behavior
- `server.js` — simple express server and baseline endpoints (/ping, /api/memory/save, /api/memory/read).
- `src/*.js` and `logic/*` and `utils/*` — main logic, validators and helpers.
- `openapi_template.yaml` / `openapi.yaml` and `ai-plugin.json` — update before deploy (`prepare:render` copies data using PUBLIC_BASE_URL).
- `scripts/generate_openapi.js` & `scripts/prepare_render.js` — scripts that modify OpenAPI + plugin metadata.

Examples to copy for edits
- Use the same env handling approach: read env vars first, then fall back to `config/config.json` or defaults (see `utils/memory_mode.js`).
- For new API routes keep consistent style: return JSON with `{ok:true|false, ...}` and use existing path conventions (`/api/memory/*`, `/api/files/*`).

If unsure, ask
- Which memory mode is intended (`local` vs `github`), whether to run with a mock GitHub server, and whether tests must cover the change.

Done — update or ask for clarification if any area should be expanded.
