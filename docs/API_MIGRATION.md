# API Migration Guide - Sofia Memory Plugin v4.x → v5.0

> **Дата:** 2025-11-20
> **Статус:** В разработке
> **Версия миграции:** 4.x → 5.0

---

## 📢 Важно

С версии **5.0.0** все легаси эндпоинты будут **удалены**. Пожалуйста, мигрируйте на новые `/api/*` эндпоинты до выхода версии 5.0.

**Текущая версия (4.x):**
- ✅ Поддерживает оба варианта (легаси + новые)
- ⚠️ Легаси эндпоинты возвращают заголовок `X-Deprecated-Endpoint: true`
- ⚠️ В консоли сервера появляются warnings

---

## 🔄 Таблица миграции эндпоинтов

### Операции с файлами

| Легаси (deprecated) | Новый (рекомендуемый) | Метод | Описание |
|---------------------|----------------------|-------|----------|
| `POST /save` | `POST /api/files/save` | POST | Сохранить произвольный файл |
| `POST /read` | `POST /api/files/read` | POST | Прочитать произвольный файл |

**Пример миграции:**
```javascript
// Было (deprecated):
fetch('http://localhost:10000/save', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    path: 'memory/notes/test.md',
    content: '# Test',
    useGithub: true
  })
});

// Стало (рекомендуемый):
fetch('http://localhost:10000/api/files/save', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    path: 'memory/notes/test.md',
    content: '# Test',
    useGithub: true
  })
});
```

---

### Операции с памятью

| Легаси (deprecated) | Новый (рекомендуемый) | Метод | Описание |
|---------------------|----------------------|-------|----------|
| `POST /saveMemory` | `POST /api/memory/save` | POST | Сохранить файл памяти |
| `POST /readMemory` | `POST /api/memory/read` | POST | Прочитать файл памяти |
| `POST /saveMemoryWithIndex` | `POST /api/memory/save-with-index` | POST | Сохранить + обновить индекс |
| `POST /loadToContext` | `POST /api/memory/load-to-context` | POST | Загрузить в контекст |
| `GET /memory` | `GET /api/memory/context` | GET | Получить текущий контекст |

**Пример миграции:**
```javascript
// Было (deprecated):
fetch('http://localhost:10000/saveMemory', {
  method: 'POST',
  body: JSON.stringify({ path: 'memory/core/context.md', content: '...' })
});

// Стало (рекомендуемый):
fetch('http://localhost:10000/api/memory/save', {
  method: 'POST',
  body: JSON.stringify({ path: 'memory/core/context.md', content: '...' })
});
```

---

### Операции с уроками

| Легаси (deprecated) | Новый (рекомендуемый) | Метод | Описание |
|---------------------|----------------------|-------|----------|
| `POST /saveLessonPlan` | `POST /api/lessons/save-plan` | POST | Сохранить план урока |
| `POST /saveAnswer` | `POST /api/lessons/save-answer` | POST | Сохранить эталонный ответ |
| `POST /version/commit` | `POST /api/lessons/version/commit` | POST | Зафиксировать версию |
| `POST /version/rollback` | `POST /api/lessons/version/rollback` | POST | Откатить версию |

---

### GitHub интеграция

| Легаси (deprecated) | Новый (рекомендуемый) | Метод | Описание |
|---------------------|----------------------|-------|----------|
| `POST /github/repos` | `POST /api/github/repos` | POST | Список репозиториев |
| `POST /github/repository` | `POST /api/github/repository` | POST | Структура репозитория |
| `POST /github/file` | `POST /api/github/file` | POST | Содержимое файла |
| `POST /setToken` | `POST /api/github/set-token` | POST | Установить токен |
| `GET /token/status` | `GET /api/github/token/status` | GET | Статус токена |

---

### Системные операции

| Легаси (deprecated) | Новый (рекомендуемый) | Метод | Описание |
|---------------------|----------------------|-------|----------|
| `POST /setMemoryRepo` | `POST /api/system/switch_repo` | POST | Сменить репозиторий |
| `POST /switch_memory_repo` | `POST /api/system/switch_repo` | POST | Сменить режим памяти |
| `GET /api/switch_memory_repo` | `POST /api/system/switch_repo` | POST | Использовать POST вместо GET |
| `GET /profile` | `GET /api/system/profile` | GET | Профиль пользователя |
| `GET /ping` | `GET /api/system/ping` | GET | Health check |

---

## 🚀 Автоматическая миграция клиента

### JavaScript/Node.js

Используйте обёртку для автоматической миграции:

```javascript
class SofiaClient {
  constructor(baseUrl = 'http://localhost:10000') {
    this.baseUrl = baseUrl;
    this.apiPrefix = '/api';
  }

  // Обёртка для запросов
  async request(endpoint, options = {}) {
    // Автоматически добавляем /api если не указан
    const url = endpoint.startsWith('/api')
      ? `${this.baseUrl}${endpoint}`
      : `${this.baseUrl}${this.apiPrefix}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    // Проверяем на deprecated эндпоинт
    if (response.headers.get('X-Deprecated-Endpoint')) {
      console.warn(`⚠️ Используется deprecated эндпоинт: ${endpoint}`);
    }

    return response.json();
  }

  // Новые методы
  async saveMemory(path, content, updateIndex = false) {
    return this.request('/memory/save', {
      method: 'POST',
      body: JSON.stringify({ path, content, updateIndex }),
    });
  }

  async readMemory(path) {
    return this.request('/memory/read', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  }

  async switchRepo(repoUrl, userId = 'default') {
    return this.request('/system/switch_repo', {
      method: 'POST',
      body: JSON.stringify({ repoUrl, userId }),
    });
  }
}

// Использование:
const client = new SofiaClient();
await client.saveMemory('memory/notes/test.md', '# Test');
```

### Python

```python
import requests
from typing import Optional

class SofiaClient:
    def __init__(self, base_url: str = "http://localhost:10000"):
        self.base_url = base_url
        self.api_prefix = "/api"

    def _request(self, endpoint: str, method: str = "GET", data: dict = None):
        url = f"{self.base_url}{self.api_prefix}{endpoint}"

        response = requests.request(
            method=method,
            url=url,
            json=data,
            headers={"Content-Type": "application/json"}
        )

        # Проверка deprecated
        if response.headers.get("X-Deprecated-Endpoint"):
            print(f"⚠️ Используется deprecated эндпоинт: {endpoint}")

        return response.json()

    def save_memory(self, path: str, content: str, update_index: bool = False):
        return self._request("/memory/save", "POST", {
            "path": path,
            "content": content,
            "updateIndex": update_index
        })

    def read_memory(self, path: str):
        return self._request("/memory/read", "POST", {"path": path})

# Использование:
client = SofiaClient()
client.save_memory("memory/notes/test.md", "# Test")
```

---

## ⏱️ Временная шкала миграции

| Дата | Версия | Изменения |
|------|--------|-----------|
| **2025-11-20** | v4.0.0 | Добавлены новые `/api/*` эндпоинты, легаси работают с warnings |
| **2025-12-01** | v4.1.0 | Добавлен заголовок `X-Deprecated-Endpoint` |
| **2026-01-01** | v4.5.0 | Легаси эндпоинты логируют warnings в консоль сервера |
| **2026-03-01** | v5.0.0 | 🚨 **Легаси эндпоинты удалены** |

---

## ✅ Чеклист миграции

Перед обновлением на v5.0.0 убедитесь:

- [ ] Все вызовы API используют `/api/*` эндпоинты
- [ ] Клиентский код обновлён и протестирован
- [ ] Нет warnings в консоли о deprecated эндпоинтах
- [ ] Обновлена документация проекта
- [ ] Настроены мониторинг и алерты для новых эндпоинтов

---

## 🆘 Получить помощь

- **GitHub Issues:** [redvampir/sofia-memory-plugin/issues](https://github.com/redvampir/sofia-memory-plugin/issues)
- **Документация:** См. `README.md` и `docs/`
- **Примеры:** См. `tests/` для примеров использования новых эндпоинтов

---

**Удачной миграции! 🚀**
