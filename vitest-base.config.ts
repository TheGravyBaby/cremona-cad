import { defineConfig } from 'vitest/config';

// agents run suites side by side on an 8 GB machine, and the default of 7 workers per run swamps it
export default defineConfig({
  test: { maxWorkers: 2 },
});
