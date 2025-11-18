/**
 * Интерфейс записи памяти с обязательными служебными полями.
 */

/**
 * @typedef {Object} MemoryEntry
 * @property {string} id          // Уникальный идентификатор записи
 * @property {string} type        // Тип содержимого (например, note, task)
 * @property {string} source      // Источник появления записи (файл, чат и т.п.)
 * @property {string} [user_id]   // Идентификатор пользователя-инициатора
 * @property {string} [agent_id]  // Идентификатор агента-инициатора
 * @property {string} project     // Проект или пространство, к которому относится запись
 * @property {string[]} tags      // Теги для быстрого поиска
 * @property {number} priority    // Приоритет важности 0–3 (0 — низкий, 3 — критичный)
 * @property {number} trust       // Доверие к данным 0–1 (0 — недостоверно, 1 — подтверждено)
 * @property {string} lang        // Язык содержимого (ISO-код)
 * @property {string} status      // Состояние записи (draft/active/archived)
 * @property {string} created_at  // Временная метка создания (ISO строка)
 * @property {string} updated_at  // Временная метка последнего изменения (ISO строка)
 * @property {any} content        // Основное содержимое записи
 */

/**
 * Допустимые статусы записи.
 * @type {readonly ["draft", "active", "archived"]}
 */
const MEMORY_STATUSES = ["draft", "active", "archived"];

/**
 * Ошибка валидации приоритета.
 */
class PriorityValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "PriorityValidationError";
  }
}

/**
 * Ошибка валидации доверия.
 */
class TrustValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "TrustValidationError";
  }
}

/**
 * Ошибка валидации статуса.
 */
class StatusValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "StatusValidationError";
  }
}

/**
 * Проверяет числовой приоритет на диапазон 0–3 и целочисленность.
 * @param {unknown} priority
 * @returns {number}
 * @throws {PriorityValidationError}
 */
function assertPriority(priority) {
  if (typeof priority !== "number" || Number.isNaN(priority)) {
    throw new PriorityValidationError("Приоритет должен быть числом.");
  }
  if (!Number.isInteger(priority)) {
    throw new PriorityValidationError("Приоритет должен быть целым числом.");
  }
  if (priority < 0 || priority > 3) {
    throw new PriorityValidationError("Приоритет должен быть в диапазоне 0–3.");
  }
  return priority;
}

/**
 * Проверяет уровень доверия на диапазон 0–1.
 * @param {unknown} trust
 * @returns {number}
 * @throws {TrustValidationError}
 */
function assertTrust(trust) {
  if (typeof trust !== "number" || Number.isNaN(trust)) {
    throw new TrustValidationError("Доверие должно быть числом.");
  }
  if (trust < 0 || trust > 1) {
    throw new TrustValidationError("Доверие должно быть в диапазоне 0–1.");
  }
  return trust;
}

/**
 * Проверяет статус записи на принадлежность к списку допустимых значений.
 * @param {unknown} status
 * @returns {string}
 * @throws {StatusValidationError}
 */
function assertStatus(status) {
  if (typeof status !== "string") {
    throw new StatusValidationError("Статус должен быть строкой.");
  }
  if (!MEMORY_STATUSES.includes(status)) {
    throw new StatusValidationError(
      `Статус должен быть одним из: ${MEMORY_STATUSES.join(", ")}.`
    );
  }
  return status;
}

module.exports = {
  MEMORY_STATUSES,
  PriorityValidationError,
  TrustValidationError,
  StatusValidationError,
  assertPriority,
  assertTrust,
  assertStatus,
};
