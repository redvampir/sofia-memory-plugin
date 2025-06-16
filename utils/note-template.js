
function generateTemplate(title, type) {
  return `# ${title}

**Тип:** ${type}
**Дата:** ${new Date().toLocaleDateString()}

## Содержание
- Цель урока/заметки
- Основные шаги
- Примеры кода

## Что нужно повторить
-

## Связанные файлы памяти
-

---
_Сгенерировано Sofia Memory Plugin_
`;
}

module.exports = { generateTemplate };
