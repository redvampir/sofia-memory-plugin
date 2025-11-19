# API работы с памятью (v2)

Ниже описаны новые маршруты для записи, поиска и выборки контекста с учётом приоритета, свежести и ограничения по токенам.

## POST /memory/store

Создаёт или обновляет запись в хранилище. Записи не удаляются физически — при передаче `deleted: true` они помечаются как удалённые (soft-delete).

Если доступ к хранилищу запрещён политикой безопасности, сервер вернёт `403` с текстом ошибки.

**Тело запроса**
- `type` (string, обязательно) — тип записи: например, `note`, `task`, `plan`.
- `project` (string, обязательно) — проект/пространство, которому принадлежит запись.
- `content` (string | object, обязательно) — содержимое. Объект будет сериализован в JSON.
- `tags` (string[]) — список тегов.
- `priority` (int 0–3) — важность, влияет на скоринг.
- `trust` (0–1) — доверие к данным.
- `lang` (string) — ISO-код языка.
- `status` (draft | active | archived) — состояние записи.
- `deleted` (boolean) — пометить запись как удалённую.
- `id`, `user_id`, `agent_id`, `source` — необязательные служебные поля.

**Пример**
```bash
curl -X POST http://localhost:10000/memory/store \
  -H "Content-Type: application/json" \
  -d '{
    "type": "note",
    "project": "alpha",
    "tags": ["beta", "meeting"],
    "priority": 2,
    "lang": "ru",
    "status": "active",
    "content": "Краткое резюме встречи",
    "user_id": "u-1"
  }'
```

**Ответ**
```json
{
  "status": "ok",
  "entry": { "id": "...", "type": "note", "project": "alpha", "priority": 2, ... }
}
```

## POST /memory/search

Возвращает массив записей с фильтрами. По умолчанию удалённые записи исключаются.

Перед поиском выполняется проверка прав на чтение хранилища. При запрете возвращается `403` с описанием причины.

**Фильтры в теле запроса**
- `tags` — запись должна содержать все указанные теги.
- `type`, `project`, `lang`, `status` — строгая фильтрация по полям.
- `include_deleted` — вернуть записи с `deleted: true`.

**Пример**
```bash
curl -X POST http://localhost:10000/memory/search \
  -H "Content-Type: application/json" \
  -d '{"tags": ["meeting"], "project": "alpha"}'
```

**Ответ**
```json
{
  "status": "ok",
  "items": [
    { "id": "...", "project": "alpha", "tags": ["meeting"], ... }
  ]
}
```

## POST /memory/get_context

Выбирает записи по скорингу (приоритет + свежесть) и ограничивает итоговый объём по `token_budget`.

При отсутствии прав на чтение хранилища возвращается `403`.

**Поля запроса**
- `token_budget` (number, обязательно) — максимальное число токенов для суммарного контента.
- `tags`, `type`, `project`, `lang`, `status` — те же фильтры, что и в `/memory/search`.

**Пример**
```bash
curl -X POST http://localhost:10000/memory/get_context \
  -H "Content-Type: application/json" \
  -d '{"token_budget": 500, "tags": ["meeting"], "status": "active"}'
```

**Ответ**
```json
{
  "status": "ok",
  "tokens_used": 120,
  "token_budget": 500,
  "remaining_budget": 380,
  "total_tokens": 230,
  "items": [
    { "id": "...", "tokens": 60, "priority": 3, "content": "..." },
    { "id": "...", "tokens": 60, "priority": 2, "content": "..." }
  ]
}
```

Скоринг учитывает приоритет (0–3) и свежесть записи за последние 30 дней. Записи сортируются по убыванию итогового балла.
