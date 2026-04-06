import { defineConfig } from '@playwright/test';
import path from 'path';
import { PlayPromOptions } from '../src/PlayPromReporter';

export default defineConfig({
  testDir: './',
  reporter: [
    ['list'],
    [path.resolve(__dirname, '../dist/index.js'), {
      host: '127.0.0.1',
      port: 8125,
      project: 'demo-app',
      env: 'local',
      testType: 'e2e',
    } satisfies PlayPromOptions],
  ],
});
