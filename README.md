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
- `MEMORY_METADATA_TTL_MS`: TTL кеша метаданных GitHub (размер, ETag, ветка по умолчанию, определённая кодировка);
  по умолчанию 300000 мс (5 минут).

## Быстрый обзор API

- `GET /ping` — проверка живости.
- `POST /api/memory/save` — сохранить объект памяти `{ id, data, userId }`.
- `POST /api/memory/read` — прочитать объект памяти `{ id, userId }`.
- `GET /api/system/status` — статус сервиса и текущего режима.

`/api/memory/read` поддерживает частичное чтение через параметр `range=start:bytes` (в теле запроса или как query-параметр). В ответе
возвращаются метаданные: `status`, `file`, `size`, `chunkStart`, `chunkEnd`, `truncated`, `encoding`, `content` и, для JSON-файлов,
`json`. Для GitHub-запросов можно указать ветку/коммит через параметр `ref` (или добавить `#branch` к URL репозитория); при его
отсутствии ветка определяется автоматически по default branch репозитория и кешируется вместе с размером файла. Определённая
кодировка/бинарность также кешируется (с TTL), чтобы повторные диапазонные запросы не анализировали содержимое заново.

Пример частичного чтения первых 512 байт:

```bash
curl -X POST http://localhost:10000/api/memory/read \
  -H "Content-Type: application/json" \
  -d '{"filename":"memory/profile/user.json","range":"0:512"}'
```

Примеры запросов и сценарии см. в `docs/` и `tests/` (`tests/runAll.js`). Дополнительные предложения по улучшению API сведены в `docs/предложения-улучшения.md`.

Дополнительные материалы по зеркальным нейронам и расширению пайплайна:
- `docs/mirror-neurons.md` — обзор архитектуры и алгоритмов Style/Structure/Emotion нейронов.
- `docs/custom-neuron-tutorial.md` — пошаговый гайд по созданию и подключению собственного нейрона.

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

## Нейминг и автоматическое переименование

- Используем `camelCase` для функций и переменных, избегаем кириллических идентификаторов и `snake_case`.
- Отчёт по текущим нарушениям: `node scripts/renameToCamelCase.js --report docs/naming_scan.md --limit 150` (по умолчанию сканируются `src/`, `api/`, `tools/`, `logic/`, `memory/`).
- Массовая замена по карте: подготовьте `mapping.json` вида `{ "old_name": "newName" }` и запустите `node scripts/renameToCamelCase.js --mapping mapping.json --apply`.
- Дополнительные исключения можно передать через `--exclude custom_exclude.json`; встроенный список покрывает переменные окружения, так что лишние значения не переименуются.

## Скрипты npm

- `npm start` — запуск сервера (PORT по умолчанию 10000).
- `npm run lint` — eslint.
- `npm run typecheck` — `tsc --noEmit`.
- `npm test` — интеграционные тесты (`tests/runAll.js`).
- `npm run build:openapi` — генерация `openapi.yaml`.
- `npm run prepare:render` — обновление `openapi.yaml`/`ai-plugin.json` под `PUBLIC_BASE_URL`.

## Лицензия

MIT, см. LICENSE.
