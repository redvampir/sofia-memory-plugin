/**
 * Модель записи лога использования памяти.
 */
export interface MemoryUsageLog {
  /** Уникальный идентификатор записи */
  id: string;
  /** Временная метка ISO */
  timestamp: string;
  /** Идентификатор пользователя */
  user_id?: string;
  /** Идентификатор агента */
  agent_id?: string;
  /** Проект или пространство */
  project: string;
  /** Тип запроса (например, get_context) */
  request_type: string;
  /** Пользовательский запрос или фильтр */
  query: string;
  /** Список затронутых записей памяти */
  memory_ids: string[];
  /** Итог выполнения (ok/error/иное) */
  outcome: string;
  /** Дополнительные заметки */
  notes: string;
}

export type MemoryUsageLogStorage = 'file' | 'sqlite';

export interface MemoryUsageLogConfig {
  mode: MemoryUsageLogStorage;
  filePath: string;
  sqlitePath: string;
}
