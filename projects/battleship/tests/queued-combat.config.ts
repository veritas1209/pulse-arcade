import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:['queued-combat.spec.ts','rules.spec.ts','water-vfx.spec.ts','combat-presentation.spec.ts'],workers:1,timeout:30000,reporter:'list'});
