# Ручная проверка эндпоинта `POST /api/saveMemory`

Ниже описаны шаги для ручной проверки сохранения памяти на сервере `sofia-memory.onrender.com`. В примерах используется `curl`; можно применять любой HTTP‑клиент (Postman, Insomnia) с теми же параметрами.

## 1. Подготовка запроса
- Метод: `POST`
- URL: `https://sofia-memory.onrender.com/api/saveMemory`
- Заголовок: `Content-Type: application/json`
- Тело (сырой JSON, **не** вложенный в поле `data`):
  ```json
  {
    "filename": "test_memory.json",
    "data": "Тестовая запись для проверки работы API sofia-memory.onrender.com"
  }
  ```

## 2. Быстрый запуск через `curl`
```bash
curl -i \
  -X POST "https://sofia-memory.onrender.com/api/saveMemory" \
  -H "Content-Type: application/json" \
  -d '{"filename":"test_memory.json","data":"Тестовая запись для проверки работы API sofia-memory.onrender.com"}'
```

Что должно прийти в теле ответа:
```json
{
  "status": "ok",
  "file": "test_memory.json"
}
```

## 3. Типовые ошибки и их причины
- Сообщение «Не хватает обязательных полей» появляется, если ключи названы иначе (`fileName`, `content`) или поле отсутствует. Проверьте, что имена ровно `filename` и `data`.
- Ответ с ошибкой возможен, если `Content-Type` задан неверно или тело отправлено как `form-data`/`x-www-form-urlencoded`. Используйте только JSON.

## 4. Дополнительные проверки
- Убедитесь, что тело запроса отправляется в корне JSON, а не вложено в поле `data` (частая ошибка в Postman при выборе `raw`+`JSON`).
- При необходимости смените `filename` на уникальное, чтобы не затирать существующие записи.
- Если сервер долго отвечает, повторите запрос после паузы: хостинг на Render иногда прогревается 10–20 секунд.

## 5. Фиксация результата
- Если пришёл `{"status":"ok","file":"test_memory.json"}`, тест успешен.
- Если получена ошибка: сохраните `response.text`, сверите ключи и заголовки, повторите запрос с корректировкой.
