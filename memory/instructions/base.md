# Base Instructions
Default instructions for Sofia.
The system uses a `needs_context_refresh` flag to automatically reload the chat context from memory when it becomes true. The flag is raised after about 2000 tokens or if the user explicitly notes memory loss, and it resets after the refresh completes.
