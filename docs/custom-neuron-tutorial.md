# Короткий гайд: добавляем собственный Mirror Neuron

Этот рецепт показывает, как написать свой нейрон, подключить его к пайплайну и быстро проверить работу вместе с `DraftGenerator`.

## Шаг 1. Создаём класс-наследник

- Наследуемся от `MirrorNeuron`, чтобы автоматически получить базовые правила (повторение регистра и последнего символа).
- Храним извлечённые признаки в `this.style` и возвращаем их из `analyze()`.

```javascript
// src/generator/neurons/MyCustomNeuron.js
const MirrorNeuron = require('./MirrorNeuron');

class MyCustomNeuron extends MirrorNeuron {
  analyze(input = '') {
    const text = String(input || '');
    const hasNumbers = /\d/.test(text);
    const words = text.split(/\s+/).filter(Boolean);

    this.style = {
      ...super.analyze(text),
      hasNumbers,
      avgWordLength: words.length
        ? words.join('').length / words.length
        : 0,
    };
    return this.style;
  }

  generate(context = {}) {
    const base = super.generate(context) || 'Generated text';
    const suffix = this.style.hasNumbers ? ' (цифры сохранены)' : '';
    return `${base} [avgWordLength=${this.style.avgWordLength.toFixed(2)}]${suffix}`;
  }
}

module.exports = MyCustomNeuron;
```

## Шаг 2. Экспортируем нейрон

Добавьте класс в список доступных модулей, чтобы его мог подхватить конфиг:

```javascript
// src/generator/neurons/index.js
const MyCustomNeuron = require('./MyCustomNeuron');

module.exports = {
  // ...существующие нейроны,
  MyCustomNeuron,
};
```

## Шаг 3. Подключаем через конфигурацию

В `config/config.json` включите новый нейрон (можно комбинировать с другими):

```json
{
  "mirrorNeurons": [
    "StyleMirrorNeuron",
    "EmotionMirrorNeuron",
    "MyCustomNeuron"
  ]
}
```

## Шаг 4. Проверяем в генераторе черновиков

```javascript
const DraftGenerator = require('../src/generator/draft/DraftGenerator');

(async () => {
  const generator = new DraftGenerator();
  const draft = await generator.generate('Напиши отчёт 2024', {
    hotCache: ['Отчёт за 2023 содержит 12 метрик'],
  });
  console.log(draft.text);
})();
```

В ответе появится строка с отметкой `avgWordLength` и пометкой о наличии чисел — признак того, что ваш нейрон отработал.

## Полезные советы

- Добавляйте простую валидацию входа: строка, не `null/undefined`.
- Логируйте промежуточные значения только в debug-режиме, чтобы не шуметь в проде.
- При необходимости сохраняйте состояние нейронов в `data/mirror-neurons/` через существующие фабрики (см. `BookMirrorFactory`).
