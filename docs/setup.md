# Настройка и деплой Sofia Memory Plugin на Render

Документ описывает полный цикл запуска сервиса на Render, проверку доступности API и сохранения в GitHub, а также подключение плагина по публичному URL.

## Переменные окружения
Задайте переменные в Render Dashboard (секция **Environment**) или в локальном `.env`, чтобы имена совпадали между окружениями:

- `TOKEN_SECRET` — обязательный секрет для шифрования токенов GitHub (без него сервер завершится с ошибкой при старте).
- `MODE` — режим работы памяти (`github` по умолчанию; поддерживается алиас `MEMORY_MODE`).
- `REPO` — опциональный URL репозитория GitHub, если нужно жёстко задать хранилище (алиас `GITHUB_REPO`).
- `PUBLIC_BASE_URL` — публичный URL сервиса на Render, используется при сборке `openapi.yaml` и `ai-plugin.json`.
- `GITHUB_TOKEN` — персональный токен GitHub (PAT) с правами чтения/записи содержимого репозитория; передавайте его в запросах через заголовок `Authorization: Bearer`.

## Деплой на Render
1. Убедитесь, что в Render заданы переменные `TOKEN_SECRET`, `MODE`, `REPO` (если требуется), `PUBLIC_BASE_URL`. Значения должны совпадать с [render.yaml](../render.yaml).
2. Подготовьте артефакты плагина под публичный URL Render (команда использует `PUBLIC_BASE_URL`):
   ```bash
   export PUBLIC_BASE_URL="https://<имя-сервиса>.onrender.com"
   npm run prepare:render
   ```
3. Задеплойте сервис (Render выполнит `npm install` и `npm run prepare:render` автоматически согласно `render.yaml`). После старта в логах должна быть строка `Server start` и порт `10000`.

## Проверки доступности API
После деплоя замените `SERVICE_URL` на домен Render (например, `sofia-memory-plugin.onrender.com`) и выполните проверки:

- Базовый пинг:
  ```bash
  curl -i https://SERVICE_URL/ping
  ```
- Открытая спецификация:
  ```bash
  curl -i https://SERVICE_URL/openapi.yaml
  ```
- Статус режима и репозитория (ожидаем `mode=github`):
  ```bash
  curl -s https://SERVICE_URL/api/system/status | jq
  ```
  В ответе убедитесь, что поле `mode` равно `github`, а в блоке `repo` указан ожидаемый URL.

## Проверка сохранения в GitHub
1. Получите PAT с правами `repo` (чтение/запись содержимого) и задайте `GITHUB_TOKEN` в окружении Render или передайте в запросе.
2. Выполните тестовый запрос сохранения (замените значения на свои):
   ```bash
   curl -X POST https://SERVICE_URL/api/memory/save \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer ${GITHUB_TOKEN}" \
     -d '{
       "id": "memory/notes/render-check.md",
       "type": "note",
       "version": "1.0",
       "data": "# Проверка Render\nСервис отвечает и сохраняет в GitHub."
     }'
   ```
3. Убедитесь, что ответ содержит `ok: true`, и проверьте появление файла `memory/notes/render-check.md` в репозитории GitHub.

## Подключение плагина по публичному URL
1. После успешного пинга откройте настройки Actions/GPT и добавьте плагин, указав публичный URL `https://SERVICE_URL`.
2. Проверьте, что загрузка манифеста проходит без ошибок (Render собирает `ai-plugin.json` и `openapi.yaml` с вашим доменом после `npm run prepare:render`).
3. Выполните тестовый вызов `/ping` уже из интерфейса плагина, чтобы убедиться, что прокси LLM видит сервис.

## Дополнительная проверка режима `github`
Для контроля конфигурации выполните запрос:
```bash
curl -s https://SERVICE_URL/api/system/status | jq '{mode, repo}'
```
Поля `mode: "github"` и `repo.url` должны совпадать с настройками Render. Если режим отличается, проверьте значения `MODE`/`MEMORY_MODE` в окружении и `config/config.json`.
