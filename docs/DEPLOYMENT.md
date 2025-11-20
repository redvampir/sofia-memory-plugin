# 🚀 Deployment Guide

Руководство по деплою Sofia Memory Plugin на production.

---

## ⚡ Quick Start

### 1. Предеплойная проверка

Перед деплоем **обязательно** запустите:

```bash
npm run pre-deploy
```

Этот скрипт проверит:
- ✅ Версию Node.js (>= 18.x)
- ✅ Переменные окружения
- ✅ npm зависимости
- ✅ Уязвимости безопасности
- ✅ Все тесты
- ✅ OpenAPI спецификацию
- ✅ Критичные файлы

**Если проверка не пройдена - не деплойте!**

---

## 🌐 Деплой на Render

### Шаг 1: Создать Web Service

1. Перейдите на [render.com](https://render.com)
2. Подключите ваш GitHub репозиторий
3. Выберите "Web Service"

### Шаг 2: Настроить переменные окружения

**Обязательные:**
```bash
TOKEN_SECRET=<генерируйте: openssl rand -hex 32>
PORT=10000
NODE_ENV=production
```

**Опциональные:**
```bash
MEMORY_MODE=github
GITHUB_REPO=https://github.com/yourname/memory-repo.git
PUBLIC_BASE_URL=https://your-app.onrender.com
DEBUG_ADMIN_TOKEN=<только для staging>
```

### Шаг 3: Настроить Build & Deploy

**Build Command:**
```bash
npm install
```

**Start Command:**
```bash
npm start
```

**Health Check Path:**
```
/health
```

### Шаг 4: Настроить OpenAPI для Render

```bash
export PUBLIC_BASE_URL="https://your-app.onrender.com"
npm run prepare:render
git add openapi.yaml ai-plugin.json
git commit -m "chore: Update OpenAPI для Render"
git push
```

---

## 🔍 Health Check Endpoints

После деплоя проверьте:

### 1. Простой health check
```bash
curl https://your-app.onrender.com/health
```

**Ожидаемый ответ:**
```json
{
  "status": "ok",
  "uptime": "5m 32s",
  "version": "4.0.0",
  "timestamp": "2025-11-20T08:00:00.000Z"
}
```

### 2. Детальная диагностика
```bash
curl https://your-app.onrender.com/health/detailed
```

**Ожидаемый ответ:**
```json
{
  "status": "healthy",
  "uptime": "5m 32s",
  "version": "4.0.0",
  "environment": {
    "nodeEnv": "production",
    "memoryMode": "github",
    "tokenSecretSet": true,
    "port": 10000
  },
  "resources": {
    "memory": {
      "rss": "156MB",
      "heapUsed": "19MB",
      "heapTotal": "21MB"
    },
    "disk": {
      "status": "ok",
      "message": "Cache directory writable"
    }
  },
  "checks": {
    "tokenSecret": "configured",
    "memoryMode": "github",
    "nodeVersion": "v22.21.1"
  }
}
```

### 3. Kubernetes probes

**Readiness (готов принимать трафик):**
```bash
curl https://your-app.onrender.com/health/ready
```

**Liveness (процесс жив):**
```bash
curl https://your-app.onrender.com/health/live
```

---

## 📦 Деплой на Railway

### Шаг 1: Создать проект

```bash
railway login
railway init
railway link
```

### Шаг 2: Установить переменные

```bash
railway variables set TOKEN_SECRET=$(openssl rand -hex 32)
railway variables set NODE_ENV=production
railway variables set PORT=10000
railway variables set MEMORY_MODE=local
```

### Шаг 3: Деплой

```bash
railway up
```

---

## 🐳 Деплой через Docker (опционально)

### Создать Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:10000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["npm", "start"]
```

### Собрать и запустить

```bash
docker build -t sofia-memory-plugin .

docker run -p 10000:10000 \
  -e TOKEN_SECRET="your-secret" \
  -e NODE_ENV="production" \
  -e MEMORY_MODE="local" \
  sofia-memory-plugin
```

---

## 🔐 Безопасность

### 1. Генерация TOKEN_SECRET

**Никогда не используйте слабые значения!**

```bash
# Генерация безопасного ключа (64 символа)
openssl rand -hex 32

# Или через Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Проверка переменных окружения

При старте сервер автоматически проверяет:
- TOKEN_SECRET >= 32 символа
- NODE_ENV в [development, production, test]
- MEMORY_MODE в [local, github]
- PORT - число

**Если проверка не пройдена - сервер не запустится!**

### 3. Логирование токенов

Токены **автоматически маскируются** в логах:
```
TOKEN_SECRET: ***
DEBUG_ADMIN_TOKEN: ***
```

---

## 🛠️ Мониторинг

### Автоматический мониторинг

Render и другие хостинги используют `/health` для проверки:
- Каждые 30 секунд запрос на `/health`
- Если код ответа не 200 - перезапуск

### Ручной мониторинг

```bash
# Локальный мониторинг
npm run health

# Production мониторинг
watch -n 10 'curl -s https://your-app.onrender.com/health | jq'
```

### Метрики производительности

```bash
curl https://your-app.onrender.com/health/detailed | jq '.resources.memory'
```

---

## 🔄 Graceful Shutdown

Сервер корректно завершается при:
- SIGTERM (Render, Kubernetes)
- SIGINT (Ctrl+C локально)
- Uncaught exceptions

**Процесс shutdown:**
1. Перестаёт принимать новые запросы
2. Завершает текущие запросы (таймаут 30 сек)
3. Очищает ресурсы
4. Выходит с кодом 0

Запросы во время shutdown получат:
```json
{
  "error": "Server is shutting down",
  "message": "Please retry your request"
}
```

---

## 📋 Чеклист деплоя

Перед деплоем на production:

- [ ] Запустили `npm run pre-deploy` - всё прошло
- [ ] TOKEN_SECRET >= 32 символов
- [ ] NODE_ENV=production
- [ ] Обновили `openapi.yaml` через `npm run prepare:render`
- [ ] Проверили health endpoints локально
- [ ] Настроили переменные окружения на хостинге
- [ ] Протестировали health checks после деплоя
- [ ] Настроили мониторинг (optional)
- [ ] Создали backup плана (optional)

---

## 🆘 Troubleshooting

### Сервер не запускается

**Проверьте:**
1. `TOKEN_SECRET` установлен и >= 32 символов
2. Все зависимости установлены: `npm install`
3. Версия Node.js >= 18: `node --version`
4. Логи при старте показывают конфигурацию

### Health check возвращает 503

**Возможные причины:**
1. TOKEN_SECRET не установлен (readiness probe)
2. Сервер в процессе shutdown
3. Недостаточно памяти

**Решение:**
```bash
# Проверить переменные
curl https://your-app.onrender.com/health/ready

# Проверить детальную диагностику
curl https://your-app.onrender.com/health/detailed
```

### npm run pre-deploy падает с ошибкой

**Типичные проблемы:**
- Тесты не проходят → исправьте тесты
- Уязвимости npm → запустите `npm audit fix`
- TOKEN_SECRET не задан → создайте .env файл

---

## 📚 Дополнительные ресурсы

- [Render Documentation](https://render.com/docs)
- [Railway Documentation](https://docs.railway.app)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

---

**Вопросы?** Создайте issue в репозитории.
