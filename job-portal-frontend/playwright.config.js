import { defineConfig } from '@playwright/test';
import process from 'node:process';

const browserChannel = process.env.PLAYWRIGHT_CHANNEL;

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30_000,
    fullyParallel: false,
    use: {
        baseURL: 'http://localhost:5173',
        headless: true,
        trace: 'on-first-retry',
        ...(browserChannel ? {channel: browserChannel} : {})
    }
});
