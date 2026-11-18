import { defineConfig } from 'vitest/config';

// agents run suites side by side on an 8 GB machine, and the default of 7 workers per run swamps it.
// Node 25 on has a localStorage of its own, undefined without a file to back it, and jsdom won't
// replace a global that's already there; turning Node's off gives the specs jsdom's
export default defineConfig({
  test: {
    maxWorkers: 2,
    execArgv: Number(process.versions.node.split('.')[0]) >= 25 ? ['--no-webstorage'] : [],
  },
});
