import { test, expect, request } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import { API_BASE, JSON_PLACEHOLDER } from '../helpers/constants';
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
  const colRes = await ctx.post(`${API_BASE}/collections`, { data: { name: 'Script Collection' } });
  const col = await colRes.json();
  const reqRes = await ctx.post(`${API_BASE}/requests`, {
    data: { collectionId: col.id, ...opts },
  });
  const req = await reqRes.json();
  await ctx.dispose();
  return req;
}

test.describe('Request Scripts', () => {
  test('should show Scripts tab and persist pre/post scripts after save', async ({ page }) => {
    await createRequestViaApi({
      name: 'Script Test',
      method: 'GET',
      url: 'https://api.example.com',
    });

    await page.goto('/');
    await navigateToRequests(page);
    await expandCollection(page, 'Script Collection');
    await selectRequest(page, 'Script Test');

    // Click Scripts tab
    await page.getByRole('button', { name: 'Scripts' }).click();

    // Should see Pre-Script and Post-Script labels
    await expect(page.getByText('Pre-Script')).toBeVisible();
    await expect(page.getByText('Post-Script')).toBeVisible();

    // Should see DSL/JavaScript toggle buttons (2 pairs)
    const dslButtons = page.getByRole('button', { name: 'DSL' });
    await expect(dslButtons).toHaveCount(2);

    const jsButtons = page.getByRole('button', { name: 'JavaScript' });
    await expect(jsButtons).toHaveCount(2);

    // Type pre-script in the first CodeMirror editor
    const editors = page.locator('.cm-content[contenteditable="true"]');
    await editors.first().click();
    await editors.first().fill('{"setVariables": [{"name": "test", "value": "hello"}]}');

    // Switch post-script to JavaScript mode
    await jsButtons.nth(1).click();

    // Type post-script in the second editor
    await editors.nth(1).click();
    await editors.nth(1).fill('pm.variables.set("result", "done");');

    // Save
    await page.getByRole('button', { name: 'Save' }).click();

    // Reload and verify scripts persist
    await page.reload();
    await navigateToRequests(page);
    await expandCollection(page, 'Script Collection');
    await selectRequest(page, 'Script Test');

    // Go to Scripts tab
    await page.getByRole('button', { name: 'Scripts' }).click();

    // Verify pre-script content
    await expect(editors.first()).toContainText('setVariables');

    // Verify post-script content
    await expect(editors.nth(1)).toContainText('pm.variables.set');
  });

  test('should save scripts via API and return them in GET', async () => {
    const req = await createRequestViaApi({
      name: 'API Script Test',
      method: 'GET',
      url: 'https://api.example.com',
      preScript: '{"setVariables": [{"name": "x", "value": "1"}]}',
      postScript: 'pm.test("ok", function() { pm.response.to.have.status(200); });',
    });

    // Verify scripts are returned
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_BASE}/requests/${req.id}`);
    const data = await res.json();
    await ctx.dispose();

    expect(data.preScript).toBe('{"setVariables": [{"name": "x", "value": "1"}]}');
    expect(data.postScript).toBe('pm.test("ok", function() { pm.response.to.have.status(200); });');
  });

  test('should include scripts in duplicate', async () => {
    const req = await createRequestViaApi({
      name: 'Original',
      method: 'GET',
      url: 'https://api.example.com',
      preScript: 'pre-test-script',
      postScript: 'post-test-script',
    });

    const ctx = await request.newContext();
    const dupRes = await ctx.post(`${API_BASE}/requests/${req.id}/duplicate`);
    const dup = await dupRes.json();
    await ctx.dispose();

    expect(dup.name).toBe('Original (Copy)');
    expect(dup.preScript).toBe('pre-test-script');
    expect(dup.postScript).toBe('post-test-script');
  });

  test('should execute request with post-script assertions and show results', async ({ page }) => {
    await createRequestViaApi({
      name: 'Assert Test',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
      postScript: `pm.test("Status is 200", function() {
  pm.response.to.have.status(200);
});`,
    });

    await page.goto('/');
    await navigateToRequests(page);
    await expandCollection(page, 'Script Collection');
    await selectRequest(page, 'Assert Test');

    // Execute
    await page.getByRole('button', { name: 'Send' }).click();

    // Wait for response
    await expect(page.getByText('200')).toBeVisible({ timeout: 30_000 });

    // Should show post-script assertion results
    await expect(page.getByText('Post-Script:')).toBeVisible();
    await expect(page.getByText('1 passed')).toBeVisible();
  });

  test('should execute request with DSL pre-script setVariables', async () => {
    // Create request with a pre-script that sets a variable
    const req = await createRequestViaApi({
      name: 'PreScript Var',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
      preScript: '{"setVariables": [{"name": "testVar", "value": "hello"}]}',
    });

    // Execute via API
    const ctx = await request.newContext();
    const execRes = await ctx.post(`${API_BASE}/requests/${req.id}/execute`, {
      data: {},
    });
    const result = await execRes.json();
    await ctx.dispose();

    expect(result.statusCode).toBe(200);
    // Pre-script should have executed
    expect(result.preScriptResult).toBeDefined();
    expect(result.preScriptResult.success).toBe(true);
    expect(result.preScriptResult.updatedVars).toHaveProperty('testVar', 'hello');
  });

  test('should execute request with DSL post-script assertions', async () => {
    const req = await createRequestViaApi({
      name: 'PostScript Assert',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
      postScript: '{"assertions": [{"type": "status", "operator": "eq", "value": 200}]}',
    });

    // Execute via API
    const ctx = await request.newContext();
    const execRes = await ctx.post(`${API_BASE}/requests/${req.id}/execute`, {
      data: {},
    });
    const result = await execRes.json();
    await ctx.dispose();

    expect(result.statusCode).toBe(200);
    expect(result.postScriptResult).toBeDefined();
    expect(result.postScriptResult.success).toBe(true);
    expect(result.postScriptResult.assertionsPassed).toBe(1);
    expect(result.postScriptResult.assertionsFailed).toBe(0);
  });

  test('should update scripts via PUT', async () => {
    const req = await createRequestViaApi({
      name: 'Update Script',
      method: 'GET',
      url: 'https://api.example.com',
    });

    const ctx = await request.newContext();

    // Update with scripts
    const updateRes = await ctx.put(`${API_BASE}/requests/${req.id}`, {
      data: {
        name: 'Update Script',
        method: 'GET',
        url: 'https://api.example.com',
        headers: '{}',
        bodyType: 'none',
        cookies: '{}',
        proxyId: -1,
        preScript: 'new-pre-script',
        postScript: 'new-post-script',
      },
    });
    const updated = await updateRes.json();

    expect(updated.preScript).toBe('new-pre-script');
    expect(updated.postScript).toBe('new-post-script');

    // Verify via GET
    const getRes = await ctx.get(`${API_BASE}/requests/${req.id}`);
    const fetched = await getRes.json();
    await ctx.dispose();

    expect(fetched.preScript).toBe('new-pre-script');
    expect(fetched.postScript).toBe('new-post-script');
  });
});
