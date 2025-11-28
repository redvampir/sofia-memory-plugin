# Sofia Memory Plugin

[![CI](https://github.com/redvampir/sofia-memory-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/redvampir/sofia-memory-plugin/actions/workflows/ci.yml)

HTTP‑сервис на Node.js, который даёт ассистенту долговременную «память» через REST API. Данные хранятся либо локально на диске, либо в GitHub‑репозитории. Есть скрипты для генерации OpenAPI/ai-plugin.json и подготовки деплоя на Render.

## Требования

- Node.js 18+
- npm 8+
- Секрет `TOKEN_SECRET` (минимум 32 hex‑символа, можно сгенерировать `openssl rand -hex 32`)

## Установка и запуск локально

```bash
npm install
export TOKEN_SECRET="$(openssl rand -hex 32)"
export MODE=local
export PORT=10000
npm start
```

Проверка:

```bash
curl http://localhost:10000/ping
```

## Конфигурация

- `config/config.json` — базовые параметры (режим памяти, пути, GitHub‑репозиторий).
- Переменные окружения:
  - `MODE`: `local` (файлы) или `github` (через GitHub API).
  - `TOKEN_SECRET`: обязательный ключ шифрования/подписи токенов.
  - `GITHUB_API_URL`: кастомный URL GitHub API для моков (по умолчанию api.github.com).
  - `GITHUB_TOKEN`: PAT для режима `github`.
  - `LOCAL_MEMORY_PATH`: путь для локального режима (по умолчанию `./local_memory`).
  - `PORT`: порт HTTP (по умолчанию 10000).

## Быстрый обзор API

- `GET /ping` — проверка живости.
- `POST /api/memory/save` — сохранить объект памяти `{ id, data, userId }`.
- `POST /api/memory/read` — прочитать объект памяти `{ id, userId }`.
- `GET /api/system/status` — статус сервиса и текущего режима.

`/api/memory/read` поддерживает частичное чтение через параметр `range=start:bytes` (в теле запроса или как query-параметр). В ответе
возвращаются метаданные: `status`, `file`, `size`, `chunkStart`, `chunkEnd`, `truncated`, `encoding`, `content` и, для JSON-файлов,
`json`.

Пример частичного чтения первых 512 байт:

```bash
curl -X POST http://localhost:10000/api/memory/read \
  -H "Content-Type: application/json" \
  -d '{"filename":"memory/profile/user.json","range":"0:512"}'
```

Примеры запросов и сценарии см. в `docs/` и `tests/` (`tests/runAll.js`). Дополнительные предложения по улучшению API сведены в `docs/предложения-улучшения.md`.

## Работа с GitHub

```bash
export MODE=github
export GITHUB_TOKEN="<PAT>"
export REPO="https://github.com/<owner>/<repo>"
npm start
```

Для разработки можно замокать GitHub:

```bash
node scripts/mock_github_api.js --port 9999 &
export GITHUB_API_URL="http://localhost:9999"
```

## Деплой на Render

1. В Render Dashboard задайте секреты: `TOKEN_SECRET`, `MODE` (`github`/`local`), `REPO` (если `github`), опционально `GITHUB_TOKEN`.
2. Проставьте публичный URL и обновите спецификации:
   ```bash
   export PUBLIC_BASE_URL="https://<your-app>.onrender.com"
   npm run prepare:render
   ```
   Скрипт обновит `openapi.yaml` и `ai-plugin.json`.
3. Задеплойте и проверьте:
   ```bash
   curl https://<your-app>.onrender.com/ping
   curl https://<your-app>.onrender.com/openapi.yaml
   ```

## Безопасность

- Не коммитьте `.env`, токены и кеши из `tools/.cache/tokens/`.
- В production не ставьте `ALLOW_INSECURE_LOCAL=1`.
- Храните `TOKEN_SECRET`/`GITHUB_TOKEN` в секретах CI/Render.

## CI

GitHub Actions (`.github/workflows/ci.yml`) выполняют:
- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- Интеграционные запросы `/ping`, `/api/memory/save`, `/api/memory/read`, `/api/system/status` с мокнутым GitHub.

## Скрипты npm

- `npm start` — запуск сервера (PORT по умолчанию 10000).
- `npm run lint` — eslint.
- `npm run typecheck` — `tsc --noEmit`.
- `npm test` — интеграционные тесты (`tests/runAll.js`).
- `npm run build:openapi` — генерация `openapi.yaml`.
- `npm run prepare:render` — обновление `openapi.yaml`/`ai-plugin.json` под `PUBLIC_BASE_URL`.

## Лицензия

MIT, см. LICENSE.
