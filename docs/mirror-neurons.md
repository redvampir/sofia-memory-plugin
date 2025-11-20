# Mirror Neurons Architecture

Mirror Neurons — это модульные компоненты для анализа и воспроизведения стилистических характеристик текста. Каждый нейрон анализирует образец текста и извлекает специфические паттерны (стиль, структура, эмоциональный тон), которые затем воспроизводятся при генерации ответов.

**Применение:** Создание ответов LLM, сохраняющих стиль, структуру или эмоциональный тон исходного материала (документация, письма, учебные материалы).

---

## 🧠 Архитектура

```
┌─────────────────────┐
│  DraftGenerator     │ ← Оркестратор
└──────────┬──────────┘
           │
           ├─→ StyleMirrorNeuron      (стиль: длина предложений, пунктуация)
           ├─→ StructureMirrorNeuron  (структура: типы предложений, пассив)
           └─→ EmotionMirrorNeuron    (тон: эмоциональная окраска)
```

### Основные классы

- **`BaseNeuron`** — абстрактный класс с методами `analyze()` и `generate()`
- **`MirrorNeuron`** — базовая реализация для зеркальных нейронов
- **`DraftGenerator`** — загружает нейроны из конфигурации и формирует черновики

---

## 📦 Готовые нейроны

### 1. StyleMirrorNeuron

**Что анализирует:**
- Среднюю длину предложений (слов на предложение)
- Частоту пунктуации (знаков на слово)
- Формальность стиля (наличие сокращений типа "don't", "it's")

**Алгоритм:**

```javascript
analyze(input) {
  // 1. Разбиваем на предложения
  const sentences = input.split(/[.!?]+/).filter(Boolean);

  // 2. Считаем среднюю длину предложения
  const wordCounts = sentences.map(s => s.split(/\s+/).length);
  const avgSentenceLength = totalWords / sentences.length;

  // 3. Считаем частоту пунктуации
  const punctuationMatches = input.match(/[.,!?:;]/g) || [];
  const punctuationFrequency = punctuationMatches.length / totalWords;

  // 4. Определяем формальность по сокращениям
  const contractions = input.match(/\b\w+'[a-zA-Z]+\b/g) || [];
  const formality = contractions.length / totalWords > 0.05
    ? 'informal'
    : 'formal';

  return { avgSentenceLength, punctuationFrequency, formality };
}
```

**Пример использования:**

```javascript
const StyleMirrorNeuron = require('./src/generator/neurons/StyleMirrorNeuron');

const neuron = new StyleMirrorNeuron();
const sample = "Hello! This is a test. How are you doing today? I'm fine.";

// Анализ
const style = neuron.analyze(sample);
console.log(style);
// {
//   avgSentenceLength: 4.5,
//   punctuationFrequency: 0.36,
//   formality: 'informal'  // из-за "I'm"
// }

// Генерация
const generated = neuron.generate({ text: "New content" });
console.log(generated);
// Создаст текст со схожей длиной предложений и пунктуацией
```

---

### 2. StructureMirrorNeuron

**Что анализирует:**
- Типы предложений (утвердительные, вопросительные, восклицательные)
- Порядок типов предложений
- Частоту пассивного залога

**Алгоритм:**

```javascript
analyze(input) {
  const sentences = input.match(/[^.!?]+[.!?]/g) || [];

  // Классификация предложений
  const counts = { declarative: 0, interrogative: 0, exclamatory: 0 };
  const order = [];

  sentences.forEach(s => {
    const last = s.trim().slice(-1);
    if (last === '?') {
      counts.interrogative++;
      order.push('interrogative');
    } else if (last === '!') {
      counts.exclamatory++;
      order.push('exclamatory');
    } else {
      counts.declarative++;
      order.push('declarative');
    }
  });

  // Детекция пассивного залога
  const passiveRegex = /\b(be|am|is|are|was|were|been|being)\b\s+\w+ed\b/i;
  const passiveCount = sentences.filter(s => passiveRegex.test(s)).length;

  return {
    structure: counts,
    order,
    passiveRatio: passiveCount / sentences.length
  };
}
```

**Пример использования:**

```javascript
const StructureMirrorNeuron = require('./src/generator/neurons/StructureMirrorNeuron');

const neuron = new StructureMirrorNeuron();
const sample = "The book was written by John. Who read it? Amazing story!";

const structure = neuron.analyze(sample);
console.log(structure);
// {
//   structure: { declarative: 1, interrogative: 1, exclamatory: 1 },
//   order: ['declarative', 'interrogative', 'exclamatory'],
//   passiveRatio: 0.33  // 1 из 3 предложений в пассиве
// }
```

---

### 3. EmotionMirrorNeuron

**Что анализирует:**
- Эмоциональный тон текста через словарь ключевых слов
- Определяет: happy, sad, angry, neutral

**Алгоритм:**

```javascript
analyze(input) {
  const dictionary = {
    happy: ['happy', 'joy', 'glad', 'excited', 'love'],
    sad: ['sad', 'down', 'unhappy', 'depressed', 'cry'],
    angry: ['angry', 'mad', 'furious', 'irritated', 'hate']
  };

  let emotion = 'neutral';
  const lower = input.toLowerCase();

  // Проверяем наличие эмоциональных слов
  for (const [emotionType, words] of Object.entries(dictionary)) {
    if (words.some(w => lower.includes(w))) {
      emotion = emotionType;
      break;
    }
  }

  return { emotion };
}
```

**Пример использования:**

```javascript
const EmotionMirrorNeuron = require('./src/generator/neurons/EmotionMirrorNeuron');

const neuron = new EmotionMirrorNeuron();
const sample = "I'm so happy and excited about this news! What a joy!";

const emotion = neuron.analyze(sample);
console.log(emotion);
// { emotion: 'happy' }

const generated = neuron.generate({ text: "Great update" });
console.log(generated);
// "Great update Yay! 😊"
```

---

## ⚙️ Конфигурация

В `config/config.json` укажите список нейронов для активации:

```json
{
  "mirrorNeurons": [
    "StyleMirrorNeuron",
    "StructureMirrorNeuron",
    "EmotionMirrorNeuron"
  ]
}
```

---

## 🔨 Создание собственного нейрона

### Шаг 1: Создайте класс

Создайте файл `src/generator/neurons/MyCustomNeuron.js`:

```javascript
const MirrorNeuron = require('./MirrorNeuron');

class MyCustomNeuron extends MirrorNeuron {
  /**
   * Анализирует входной текст
   * @param {string} input - образец текста
   * @returns {Object} извлечённые характеристики
   */
  analyze(input = '') {
    // Ваша логика анализа
    const wordCount = input.split(/\s+/).length;
    const hasNumbers = /\d/.test(input);

    this.style = { wordCount, hasNumbers };
    return this.style;
  }

  /**
   * Генерирует текст на основе анализа
   * @param {Object} context - контекст генерации
   * @returns {string} сгенерированный текст
   */
  generate(context = {}) {
    const { wordCount, hasNumbers } = this.style;

    let result = context.text || 'Generated text';

    if (hasNumbers) {
      result += ' (includes statistics)';
    }

    return result;
  }
}

module.exports = MyCustomNeuron;
```

### Шаг 2: Зарегистрируйте нейрон

Добавьте в `config/config.json`:

```json
{
  "mirrorNeurons": ["MyCustomNeuron"]
}
```

### Шаг 3: Используйте

```javascript
const DraftGenerator = require('./src/generator/draft/DraftGenerator');
const config = require('./config');

const generator = new DraftGenerator(config);
const draft = await generator.generate({
  sample: "Sample text with 42 statistics",
  prompt: "Generate similar content"
});
```

---

## 🔄 Последовательность работы

```
┌─────────────────┐
│ 1. analyze()    │  ← Каждый нейрон анализирует образец
└────────┬────────┘
         │
         v
┌─────────────────┐
│ 2. generate()   │  ← Генерация на основе паттернов
└────────┬────────┘
         │
         v
┌─────────────────┐
│ 3. Объединение  │  ← DraftGenerator собирает черновик
└─────────────────┘
```

**Пример полного цикла:**

```javascript
const generator = new DraftGenerator({
  mirrorNeurons: ['StyleMirrorNeuron', 'EmotionMirrorNeuron']
});

// Образец
const sample = "I'm so excited! This is amazing. What a great day!";

// Генерация
const draft = await generator.generate({
  sample,
  prompt: "Write about new features"
});

// Результат будет:
// - Короткие предложения (как в образце)
// - Восклицательные знаки
// - Позитивный эмоциональный тон
```

---

## 🎯 Best Practices

1. **Выбирайте нейроны по задаче:**
   - Документация → `StyleMirrorNeuron`
   - Маркетинг → `EmotionMirrorNeuron`
   - Научные тексты → `StructureMirrorNeuron`

2. **Комбинируйте нейроны:**
   ```json
   {
     "mirrorNeurons": ["StyleMirrorNeuron", "StructureMirrorNeuron"]
   }
   ```

3. **Тестируйте на образцах:**
   - Используйте реальные тексты из `memory/answers/`
   - Сохраняйте эталоны в `memory/drafts/`

4. **Расширяйте словари:**
   - Для `EmotionMirrorNeuron` добавьте больше эмоций
   - Адаптируйте под свой язык (русский/английский)

---

## 📚 Интеграция с памятью плагина

Нейроны работают с файлами из `memory/`:

```javascript
// 1. Загрузите образец из памяти
const sample = await readMemoryFile('memory/answers/style_guide.md');

// 2. Проанализируйте
const neuron = new StyleMirrorNeuron();
neuron.analyze(sample);

// 3. Сгенерируйте ответ
const draft = neuron.generate({ text: 'New content' });

// 4. Сохраните результат
await saveMemoryFile('memory/drafts/new_draft.md', draft);
```

---

## 🐛 Отладка

Включите debug-логирование:

```javascript
const neuron = new StyleMirrorNeuron();
neuron.debug = true;

neuron.analyze("Sample text");
// [StyleMirrorNeuron] avgSentenceLength: 5.2
// [StyleMirrorNeuron] punctuationFrequency: 0.15
// [StyleMirrorNeuron] formality: formal
```

---

**Автор документации:** Claude (AI Assistant)
**Последнее обновление:** 2025-11-20
