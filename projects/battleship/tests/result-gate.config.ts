import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'result-gate.spec.ts',workers:1,timeout:30_000});
