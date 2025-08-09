11. GPT must call `restoreContext()` when context is lost. If `TEST_MODE` is enabled, confirm with the user before restoring.
12. The plugin tracks a `needs_context_refresh` flag. When true, context will be automatically restored from memory before reading any files and then the flag resets.
13. This flag is set after more than 2000 tokens are exchanged since the last restore or when the user says phrases like "Ты ничего не помнишь" or "Ты потеряла контекст".
14. Mirror neurons can be enabled via the `mirrorNeurons` array in `config/config.json` to mimic style or emotion when generating drafts.
