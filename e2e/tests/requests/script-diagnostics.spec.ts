import { test, expect, request } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import { API_BASE } from '../helpers/constants';
import { navigateToRequests, expandCollection, selectRequest } from '../helpers/request-helpers';

test.beforeEach(async () => {
  await cleanupAll();
});

/** Create a collection + request via API */
async function createRequestViaApi(opts: {
  name: string;
  method: string;
  url: string;
  body?: string;
  bodyType?: string;
  preScript?: string;
  postScript?: string;
}) {
  const ctx = await request.newContext();
  const colRes = await ctx.post(`${API_BASE}/collections`, { data: { name: 'Diagnostics Collection' } });
  const col = await colRes.json();
  const reqRes = await ctx.post(`${API_BASE}/requests`, {
    data: { collectionId: col.id, ...opts },
  });
  const req = await reqRes.json();
  await ctx.dispose();
  return req;
}

/** Navigate to a request and execute it, waiting for the API response */
async function executeAndWait(page: import('@playwright/test').Page) {
  const responsePromise = page.waitForResponse(resp => resp.url().includes('/execute'));
  await page.getByRole('button', { name: 'Send' }).click();
  await responsePromise;
}

test.describe('Script Error Inline Diagnostics', () => {
  test('API should return errorDetails with line info for syntax errors', async () => {
    const req = await createRequestViaApi({
      name: 'Syntax Error Test',
      method: 'GET',
      url: `${API_BASE}/workspaces`,
      postScript: 'var x = 1;\nvar y = {;\nvar z = 3;',
    });

    const ctx = await request.newContext();
    const execRes = await ctx.post(`${API_BASE}/requests/${req.id}/execute`, { data: {} });
    const result = await execRes.json();
    await ctx.dispose();

    expect(result.postScriptResult).toBeDefined();
    expect(result.postScriptResult.success).toBe(false);
    expect(result.postScriptResult.errorDetails).toBeDefined();
    expect(result.postScriptResult.errorDetails.length).toBeGreaterThan(0);

    const detail = result.postScriptResult.errorDetails[0];
    expect(detail.line).toBeGreaterThan(0);
    expect(detail.message).toBeTruthy();
    // Clean message should not have location suffix
    expect(detail.message).not.toContain('at script:');
    expect(detail.message).not.toContain('at eval:');
  });

  test('API should return errorDetails with line info for runtime errors', async () => {
    const req = await createRequestViaApi({
      name: 'Runtime Error Test',
      method: 'GET',
      url: `${API_BASE}/workspaces`,
      postScript: 'var x = 1;\nvar y = 2;\nfoo.bar();',
    });

    const ctx = await request.newContext();
    const execRes = await ctx.post(`${API_BASE}/requests/${req.id}/execute`, { data: {} });
    const result = await execRes.json();
    await ctx.dispose();

    expect(result.postScriptResult).toBeDefined();
    expect(result.postScriptResult.success).toBe(false);
    expect(result.postScriptResult.errorDetails).toBeDefined();
    expect(result.postScriptResult.errorDetails.length).toBeGreaterThan(0);

    const detail = result.postScriptResult.errorDetails[0];
    expect(detail.line).toBe(3);
    expect(detail.message).toContain('ReferenceError');
    expect(detail.message).not.toContain('at script:');
  });

  test('API should return errorDetails for pm.test assertion failure', async () => {
    const req = await createRequestViaApi({
      name: 'Assertion Fail Test',
      method: 'GET',
      url: `${API_BASE}/workspaces`,
      postScript: `pm.test("Status is 404", function() {\n  pm.response.to.have.status(404);\n});`,
    });

    const ctx = await request.newContext();
    const execRes = await ctx.post(`${API_BASE}/requests/${req.id}/execute`, { data: {} });
    const result = await execRes.json();
    await ctx.dispose();

    expect(result.postScriptResult).toBeDefined();
    expect(result.postScriptResult.success).toBe(false);
    expect(result.postScriptResult.assertionsFailed).toBe(1);
    expect(result.postScriptResult.errorDetails).toBeDefined();
    expect(result.postScriptResult.errorDetails.length).toBeGreaterThan(0);

    const detail = result.postScriptResult.errorDetails[0];
    expect(detail.message).toContain("Status is 404");
    // pm.test call site line should be captured
    expect(detail.line).toBeGreaterThan(0);
    // Clean error should not contain location suffix or native function reference
    expect(detail.message).not.toContain('at script:');
    expect(detail.message).not.toContain('(native)');
  });

  test('API should return clean error messages in errors array', async () => {
    const req = await createRequestViaApi({
      name: 'Clean Error Test',
      method: 'GET',
      url: `${API_BASE}/workspaces`,
      postScript: 'var x = 1;\nundefinedVar.call();',
    });

    const ctx = await request.newContext();
    const execRes = await ctx.post(`${API_BASE}/requests/${req.id}/execute`, { data: {} });
    const result = await execRes.json();
    await ctx.dispose();

    expect(result.postScriptResult.errors).toBeDefined();
    expect(result.postScriptResult.errors.length).toBeGreaterThan(0);
    // errors[] should have clean messages (location suffix stripped)
    for (const err of result.postScriptResult.errors) {
      expect(err).not.toMatch(/at (script|eval):\d+:\d+/);
    }
  });

  test('API should NOT return errorDetails for successful scripts', async () => {
    const req = await createRequestViaApi({
      name: 'Success Test',
      method: 'GET',
      url: `${API_BASE}/workspaces`,
      postScript: `pm.test("Status is 200", function() {\n  pm.response.to.have.status(200);\n});`,
    });

    const ctx = await request.newContext();
    const execRes = await ctx.post(`${API_BASE}/requests/${req.id}/execute`, { data: {} });
    const result = await execRes.json();
    await ctx.dispose();

    expect(result.postScriptResult).toBeDefined();
    expect(result.postScriptResult.success).toBe(true);
    // errorDetails should be absent or empty on success
    expect(result.postScriptResult.errorDetails ?? []).toHaveLength(0);
  });

  test('should show wavy underline on script error line in editor', async ({ page }) => {
    await createRequestViaApi({
      name: 'Inline Diag Test',
      method: 'GET',
      url: `${API_BASE}/workspaces`,
      postScript: `pm.test("Should fail", function() {\n  pm.response.to.have.status(999);\n});`,
    });

    await page.goto('/');
    await navigateToRequests(page);
    await expect(page.getByRole('complementary').getByText('Diagnostics Collection')).toBeVisible({ timeout: 10_000 });
    await expandCollection(page, 'Diagnostics Collection');
    await selectRequest(page, 'Inline Diag Test');

    // Execute and wait for response
    await executeAndWait(page);
    await expect(page.getByText('Post-Script:')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('1 failed')).toBeVisible();

    // Navigate to Scripts tab → Post-Script
    await page.getByRole('button', { name: 'Scripts' }).click();
    await page.getByRole('button', { name: 'Post-Script' }).click();

    // The editor should have a lint diagnostic (cm-lintRange-error class)
    const lintRange = page.locator('.cm-lintRange-error');
    await expect(lintRange.first()).toBeVisible({ timeout: 5_000 });
  });

  test('should clear diagnostics when script is edited', async ({ page }) => {
    await createRequestViaApi({
      name: 'Clear Diag Test',
      method: 'GET',
      url: `${API_BASE}/workspaces`,
      postScript: `pm.test("Should fail", function() {\n  pm.response.to.have.status(999);\n});`,
    });

    await page.goto('/');
    await navigateToRequests(page);
    await expect(page.getByRole('complementary').getByText('Diagnostics Collection')).toBeVisible({ timeout: 10_000 });
    await expandCollection(page, 'Diagnostics Collection');
    await selectRequest(page, 'Clear Diag Test');

    // Execute and wait for response
    await executeAndWait(page);
    await expect(page.getByText('Post-Script:')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('1 failed')).toBeVisible();

    // Navigate to Scripts tab → Post-Script
    await page.getByRole('button', { name: 'Scripts' }).click();
    await page.getByRole('button', { name: 'Post-Script' }).click();

    // Verify lint diagnostic appears
    const lintRange = page.locator('.cm-lintRange-error');
    await expect(lintRange.first()).toBeVisible({ timeout: 5_000 });

    // Type in the editor to modify the script (should clear diagnostics)
    const editor = page.locator('.cm-content[contenteditable="true"]');
    await editor.first().click();
    await page.keyboard.type('// modified');

    // Diagnostics should be cleared after editing
    await expect(lintRange).toHaveCount(0, { timeout: 3_000 });
  });

  test('should show pre-script diagnostics on pre-script error', async ({ page }) => {
    await createRequestViaApi({
      name: 'Pre-Script Diag Test',
      method: 'GET',
      url: `${API_BASE}/workspaces`,
      preScript: 'var x = 1;\nundefinedVar.call();',
    });

    await page.goto('/');
    await navigateToRequests(page);
    await expect(page.getByRole('complementary').getByText('Diagnostics Collection')).toBeVisible({ timeout: 10_000 });
    await expandCollection(page, 'Diagnostics Collection');
    await selectRequest(page, 'Pre-Script Diag Test');

    // Execute and wait for response
    await executeAndWait(page);
    await expect(page.getByText('Pre-Script:')).toBeVisible({ timeout: 5_000 });

    // Navigate to Scripts tab — Pre-Script subtab is default
    await page.getByRole('button', { name: 'Scripts' }).click();

    // The pre-script editor should have a lint diagnostic
    const lintRange = page.locator('.cm-lintRange-error');
    await expect(lintRange.first()).toBeVisible({ timeout: 5_000 });
  });
});
