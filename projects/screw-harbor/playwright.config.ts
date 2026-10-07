import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'./tests',workers:1,timeout:45000,expect:{timeout:7000},
  use:{baseURL:'http://127.0.0.1:5188',trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:[
    {command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5188',url:'http://127.0.0.1:5188',reuseExistingServer:true,timeout:20000},
    {command:'node scripts/serve-pulse.mjs',url:'http://127.0.0.1:4190/games/screw-harbor/',reuseExistingServer:true,timeout:20000}
  ],
  projects:[{name:'desktop-chrome',use:{browserName:'chromium',channel:'chrome',viewport:{width:1440,height:1000}}},{name:'mobile-chrome',use:{...devices['iPhone 13'],browserName:'chromium',channel:'chrome'}}]
});
