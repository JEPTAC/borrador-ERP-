"use strict";

const { defineConfig, devices } = require("@playwright/test");
const config = require("./lib/config.cjs");

module.exports = defineConfig({
  testDir: "./tests",
  outputDir: "../qa-output/test-results",
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "qa-output/html-report", open: "never" }],
    ["json", { outputFile: "qa-output/playwright-results.json" }]
  ],
  use: {
    baseURL: config.baseURL,
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 20000,
    navigationTimeout: 30000
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", grep: /@mobile/, use: { ...devices["Pixel 7"] } }
  ]
});
