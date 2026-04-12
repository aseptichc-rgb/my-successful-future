import { test, expect } from '@playwright/test';

const pages = [
  { name: 'Home (/)', path: '/' },
  { name: 'Login (/login)', path: '/login' },
  { name: 'Signup (/signup)', path: '/signup' },
  { name: 'Chat (/chat)', path: '/chat' },
];

for (const pg of pages) {
  test(`${pg.name} - 콘솔 에러 및 페이지 로드 확인`, async ({ page }) => {
    const errors: string[] = [];
    const consoleErrors: string[] = [];

    // Collect console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(`[console.error] ${msg.text()}`);
      }
    });

    // Collect page errors (uncaught exceptions)
    page.on('pageerror', (err) => {
      errors.push(`[pageerror] ${err.message}`);
    });

    // Collect failed network requests
    const failedRequests: string[] = [];
    page.on('response', (response) => {
      if (response.status() >= 500) {
        failedRequests.push(`[${response.status()}] ${response.url()}`);
      }
    });

    const response = await page.goto(pg.path, { waitUntil: 'networkidle', timeout: 15000 });

    // Check HTTP status
    expect(response?.status(), `${pg.name} HTTP 상태 코드`).toBeLessThan(500);

    // Wait a bit for async errors
    await page.waitForTimeout(2000);

    // Report findings
    const allIssues = [...errors, ...consoleErrors, ...failedRequests];
    if (allIssues.length > 0) {
      console.log(`\n=== ${pg.name} 발견된 이슈 ===`);
      allIssues.forEach((issue) => console.log(issue));
    }

    // Fail if there are uncaught page errors
    expect(errors, `${pg.name} 페이지 에러`).toEqual([]);
  });
}
