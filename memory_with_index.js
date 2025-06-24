// Экспорт функции сохранения с обновлением индекса
const { saveMemoryWithIndex: save_memory_with_index } = require('./logic/storage');

module.exports = {
  // Функция сохраняет файл и обновляет индекс
  save_memory_with_index,
};
