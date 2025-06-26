# Стандарты работы с памятью

Этот документ описывает формат индексных файлов и правила работы с метаданными, применяемые плагином Sofia Memory. Все операции чтения и записи должны соответствовать данным стандартам.

## 1. Формат `index.json`

Главный файл `memory/index.json` имеет тип `index-root` и содержит список веток:

```json
{
  "type": "index-root",
  "branches": [
    { "category": "context", "path": "plans/context/index.json" },
    { "category": "lessons", "path": "lessons/index.json" }
  ]
}
```

Каждая ветка (`memory/<категория>/index.json`) хранит массив описаний файлов:

```json
{
  "type": "index-branch",
  "category": "lessons",
  "files": [
    {
      "title": "Intro Lesson",
      "file": "lessons/intro.md",
      "tags": ["intro"],
      "priority": "high",
      "version": "1.0",
      "updated": "2025-06-25"
    }
  ]
}
```

Обязательные поля записи: `title`, `file`, `tags`, `priority`, `version`, `updated`. Значение `priority` принимает `high`, `medium` или `low`. Поле `updated` указывается в формате `YYYY-MM-DD`.

## 2. Метаданные

Записи в индексе могут содержать дополнительные поля: `summary`, `context_priority`, `pinned`, `access_count`, `edit_count`. При изменении файлов нужно сохранять существующие метаданные и обновлять только требуемые значения. Прямое перезаписывание всей записи запрещено.

## 3. Структура каталогов

Все пути в индексе начинаются с каталога `memory/` и соответствуют реальному расположению файлов. Индекс формируется по категориям, например:

```
memory/
├── answers/
├── context/
├── drafts/
├── instructions/
├── lessons/
└── plans/
```

Каждая категория имеет собственный `index.json`.

## 4. Валидация индекса

Перед сохранением индекс проверяется:
1. Путь должен находиться внутри `memory/`.
2. Файл должен существовать в репозитории.
3. Путь не должен ссылаться на файлы плагина.

Нарушения помечаются как `missing` или `invalid`. Если включены опции `auto_clean_invalid` или `auto_clean_missing`, такие записи удаляются автоматически.

## 5. Деление больших файлов

Если Markdown-файл превышает `memory_settings.max_tokens_per_file` (4096 токенов по умолчанию), он разбивается на подкаталог:

```
memory/notes/note.md → memory/notes/note/part1.md
                       memory/notes/note/part2.md
                       memory/notes/note/index.md
```

`index.md` содержит метаданные:

```markdown
---
title: Note
parts: [part1.md, part2.md]
tokens_total: 5000
split: auto
updated: 2025-06-26
---
```

В `index.json` указывается путь к `note/index.md`. При обновлении исходного файла все подфайлы и индекс пересоздаются.

## 6. Защита и версияция

Изменения индекса выполняются через утилиты плагина, которые загружают текущие данные, проверяют их и только потом записывают на диск. Это предотвращает потерю метаданных и несогласованность версий.
