// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    timeout: 30000,
    retries: 0,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:8080',
        screenshot: 'only-on-failure',
    },
    webServer: {
        command: 'python3 -m http.server 8080',
        port: 8080,
        reuseExistingServer: true,
    },
    projects: [
        {
            name: 'chromium',
            use: { browserName: 'chromium' },
        },
        {
            name: 'webkit',
            use: { browserName: 'webkit' },
        },
    ],
});
