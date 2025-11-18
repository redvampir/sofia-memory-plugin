/**
 * Интерфейс записи памяти с обязательными служебными полями.
 */

export interface MemoryEntry {
  /** Уникальный идентификатор записи */
  id: string;
  /** Тип содержимого (например, note, task) */
  type: string;
  /** Источник появления записи (файл, чат и т.п.) */
  source: string;
  /** Идентификатор пользователя-инициатора */
  user_id?: string;
  /** Идентификатор агента-инициатора */
  agent_id?: string;
  /** Проект или пространство, к которому относится запись */
  project: string;
  /** Теги для быстрого поиска */
  tags: string[];
  /** Приоритет важности 0–3 (0 — низкий, 3 — критичный) */
  priority: number;
  /** Доверие к данным 0–1 (0 — недостоверно, 1 — подтверждено) */
  trust: number;
  /** Язык содержимого (ISO-код) */
  lang: string;
  /** Состояние записи (draft/active/archived) */
  status: MemoryStatus;
  /** Временная метка создания (ISO строка) */
  created_at: string;
  /** Временная метка последнего изменения (ISO строка) */
  updated_at: string;
  /** Основное содержимое записи */
  content: any;
}

/**
 * Допустимые статусы записи.
 */
export const MEMORY_STATUSES = ["draft", "active", "archived"] as const;

export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

/**
 * Ошибка валидации приоритета.
 */
export class PriorityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PriorityValidationError";
  }
}

/**
 * Ошибка валидации доверия.
 */
export class TrustValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrustValidationError";
  }
}

/**
 * Ошибка валидации статуса.
 */
export class StatusValidationError extends Error {
  constructor(message: string) {
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
export function assertPriority(priority: unknown): number {
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
export function assertTrust(trust: unknown): number {
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
export function assertStatus(status: unknown): MemoryStatus {
  if (typeof status !== "string") {
    throw new StatusValidationError("Статус должен быть строкой.");
  }
  if (!MEMORY_STATUSES.includes(status)) {
    throw new StatusValidationError(
      `Статус должен быть одним из: ${MEMORY_STATUSES.join(", ")}.`
    );
  }
  return status as MemoryStatus;
}
