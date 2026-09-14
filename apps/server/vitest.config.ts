import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Server suites stand up real SQLite stores and render real .docx/.xlsx/.pptx
    // artifacts; running files in separate parallel workers intermittently kills
    // a worker. Serial file execution keeps the suite deterministic.
    fileParallelism: false,
  },
});
