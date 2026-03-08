import { test, expect, type Page, request } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import {
  navigateToFlows,
  createFlow,
  addBlankStep,
  configureStep,
  saveStep,
  runFlowAndWaitForResult,
} from '../helpers/flow-helpers';
import { API_BASE, JSON_PLACEHOLDER } from '../helpers/constants';

test.beforeEach(async () => {
  await cleanupAll();
  // Also clean up environments
  const ctx = await request.newContext();
  const envs = await ctx.get(`${API_BASE}/environments`);
  if (envs.ok()) {
    for (const env of await envs.json()) {
      await ctx.delete(`${API_BASE}/environments/${env.id}`);
    }
  }
  await ctx.dispose();
});

/** Create an environment with given variables */
async function createEnvironment(name: string, variables: Record<string, string>) {
  const ctx = await request.newContext();
  const resp = await ctx.post(`${API_BASE}/environments`, {
    data: { name, variables: JSON.stringify(variables) },
  });
  const env = await resp.json();
  await ctx.dispose();
  return env;
}

/** Activate an environment */
async function activateEnvironment(envId: number) {
  const ctx = await request.newContext();
  await ctx.post(`${API_BASE}/environments/${envId}/activate`);
  await ctx.dispose();
}

/** Get environment by ID */
async function getEnvironment(envId: number) {
  const ctx = await request.newContext();
  const resp = await ctx.get(`${API_BASE}/environments/${envId}`);
  const env = await resp.json();
  await ctx.dispose();
  return env;
}

/** Fill a script editor with content */
async function fillScriptEditor(page: Page, scriptType: 'pre' | 'post', content: string) {
  // Click the correct subtab to show the editor (only one editor visible at a time)
  const tabButton = page.getByRole('button', { name: scriptType === 'pre' ? 'Pre-Script' : 'Post-Script' });
  await tabButton.click();

  // Navigate from tab button up to FormField wrapper which contains the CodeEditor:
  // button → div.flex.gap-1 → div.flex.items-center (subtab row) → FormField wrapper div
  const formField = tabButton.locator('..').locator('..').locator('..');
  const editor = formField.locator('.cm-content');

  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await editor.fill(content);
}

/** Click the JavaScript mode toggle button */
async function switchToJavaScriptMode(page: Page, scriptType: 'pre' | 'post') {
  // Click the subtab first so the DSL/JavaScript toggle affects the right script
  const tabButton = page.getByRole('button', { name: scriptType === 'pre' ? 'Pre-Script' : 'Post-Script' });
  await tabButton.click();
  // The DSL/JavaScript toggle is in the same subtab row
  const subtabRow = tabButton.locator('..').locator('..');
  await subtabRow.getByRole('button', { name: 'JavaScript' }).click();
}

test.describe('Flow JavaScript Scripts', () => {
  test('should show DSL and JavaScript toggle buttons for scripts', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'JS Toggle Test');
    await addBlankStep(page);

    // Expand step
    await page.getByText('Untitled Step').click();

    // Verify Pre-Script and Post-Script subtab buttons are visible
    await expect(page.getByRole('button', { name: 'Pre-Script' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Post-Script' })).toBeVisible();

    // Verify shared DSL/JavaScript toggle buttons are visible
    await expect(page.getByRole('button', { name: 'DSL' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'JavaScript' })).toBeVisible();
  });

  test('should toggle between DSL and JavaScript modes', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'JS Mode Toggle');
    await addBlankStep(page);

    // Expand step
    await page.getByText('Untitled Step').click();

    // Switch to Post-Script subtab to show its editor
    await page.getByRole('button', { name: 'Post-Script' }).click();

    // Default is JavaScript mode for empty scripts - check placeholder
    const postTab = page.getByRole('button', { name: 'Post-Script' });
    const formField = postTab.locator('..').locator('..').locator('..');
    await expect(formField.locator('.cm-content[aria-placeholder*="Post-request script"]')).toBeVisible();

    // Switch to DSL mode
    const subtabRow = postTab.locator('..').locator('..');
    await subtabRow.getByRole('button', { name: 'DSL' }).click();

    // Now placeholder should show DSL JSON example
    await expect(formField.locator('.cm-content[aria-placeholder*="assertions"]')).toBeVisible();
  });

  test('should execute JavaScript pm.test assertions', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'JS pm.test Test');
    await addBlankStep(page);

    // Expand step and configure
    await page.getByText('Untitled Step').click();
    await configureStep(page, {
      name: 'JS Test Step',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });

    // Switch to JavaScript mode and add test
    await switchToJavaScriptMode(page, 'post');
    const jsScript = `pm.test("Status is 200", function() {
  pm.response.to.have.status(200);
});`;
    await fillScriptEditor(page, 'post', jsScript);

    await saveStep(page);
    await runFlowAndWaitForResult(page);

    // Flow should succeed
    await expect(page.getByText('Success')).toBeVisible();
    // Should show assertion count
    await expect(page.getByText('1/1 assertions')).toBeVisible();
  });

  test('should fail JavaScript test when assertion fails', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'JS Fail Test');
    await addBlankStep(page);

    // Expand step and configure
    await page.getByText('Untitled Step').click();
    await configureStep(page, {
      name: 'Failing JS Step',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });

    // Switch to JavaScript mode and add failing test
    await switchToJavaScriptMode(page, 'post');
    const jsScript = `pm.test("Status is 404", function() {
  pm.response.to.have.status(404);
});`;
    await fillScriptEditor(page, 'post', jsScript);

    await saveStep(page);
    await runFlowAndWaitForResult(page);

    // Flow should fail
    await expect(page.getByText('Failed', { exact: true })).toBeVisible();
    // Should show 0/1 assertions
    await expect(page.getByText('0/1 assertions')).toBeVisible();
  });

  test('should execute pm.environment.get and set', async ({ page }) => {
    // Create and activate environment with initial variables
    const env = await createEnvironment('Test Env', { targetCurrency: 'USD' });
    await activateEnvironment(env.id);

    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'JS Environment Test');
    await addBlankStep(page);

    // Expand step and configure
    await page.getByText('Untitled Step').click();
    await configureStep(page, {
      name: 'Env Test Step',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });

    // Switch to JavaScript mode
    await switchToJavaScriptMode(page, 'post');
    const jsScript = `var currency = pm.environment.get("targetCurrency");
pm.test("Environment variable is set", function() {
  pm.expect(currency).to.equal("USD");
});

// Set a new environment variable
pm.environment.set("postId", pm.response.json().id.toString());`;
    await fillScriptEditor(page, 'post', jsScript);

    await saveStep(page);
    await runFlowAndWaitForResult(page);

    // Flow should succeed
    await expect(page.getByText('Success')).toBeVisible();

    // Verify the environment variable was updated in DB
    const updatedEnv = await getEnvironment(env.id);
    const vars = JSON.parse(updatedEnv.variables);
    expect(vars.postId).toBe('1');
  });

  test('should handle forEach loops in JavaScript', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'JS forEach Test');
    await addBlankStep(page);

    // Expand step and configure - using posts endpoint which returns an array
    await page.getByText('Untitled Step').click();
    await configureStep(page, {
      name: 'forEach Step',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts?_limit=5`,
    });

    // Switch to JavaScript mode
    await switchToJavaScriptMode(page, 'post');
    const jsScript = `var posts = pm.response.json();
var count = 0;

posts.forEach(function(post) {
  if (post.id > 0) {
    count++;
  }
});

pm.test("Counted all posts", function() {
  pm.expect(count).to.equal(5);
});`;
    await fillScriptEditor(page, 'post', jsScript);

    await saveStep(page);
    await runFlowAndWaitForResult(page);

    // Flow should succeed
    await expect(page.getByText('Success')).toBeVisible();
  });

  test('should persist environment changes to database', async ({ page }) => {
    // Create and activate environment
    const env = await createEnvironment('Persist Test Env', { initial: 'value' });
    await activateEnvironment(env.id);

    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'JS Persist Test');
    await addBlankStep(page);

    // Expand step and configure
    await page.getByText('Untitled Step').click();
    await configureStep(page, {
      name: 'Persist Step',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });

    // Switch to JavaScript mode
    await switchToJavaScriptMode(page, 'post');
    const jsScript = `pm.environment.set("newVariable", "newValue123");
pm.environment.set("anotherVar", "test456");`;
    await fillScriptEditor(page, 'post', jsScript);

    await saveStep(page);
    await runFlowAndWaitForResult(page);

    // Flow should succeed
    await expect(page.getByText('Success')).toBeVisible();

    // Verify environment variables were persisted
    const updatedEnv = await getEnvironment(env.id);
    const vars = JSON.parse(updatedEnv.variables);
    expect(vars.initial).toBe('value'); // Original still exists
    expect(vars.newVariable).toBe('newValue123');
    expect(vars.anotherVar).toBe('test456');

    // Refresh page and run again - variables should still be there
    await page.reload();
    await navigateToFlows(page);

    // Click on the flow
    await page.getByText('JS Persist Test').click();

    // Expand and update script to read the persisted variable
    await page.getByText('Persist Step').click();

    // Switch to JavaScript mode again
    await switchToJavaScriptMode(page, 'post');
    const verifyScript = `pm.test("Persisted variable exists", function() {
  var val = pm.environment.get("newVariable");
  pm.expect(val).to.equal("newValue123");
});`;
    await fillScriptEditor(page, 'post', verifyScript);

    await saveStep(page);
    await runFlowAndWaitForResult(page);

    // Should still succeed
    await expect(page.getByText('Success')).toBeVisible();
  });

  test('should use pm.variables for runtime-only variables', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'JS Variables Test');

    // Step 1: Set a runtime variable
    await addBlankStep(page);
    await page.getByText('Untitled Step').click();
    await configureStep(page, {
      name: 'Set Variable',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });

    await switchToJavaScriptMode(page, 'post');
    const setScript = `var data = pm.response.json();
pm.variables.set("userId", data.userId.toString());`;
    await fillScriptEditor(page, 'post', setScript);
    await saveStep(page);

    // Step 2: Read the variable set by step 1
    await addBlankStep(page);
    await page.getByText('Untitled Step').click();
    await configureStep(page, {
      name: 'Read Variable',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/2`,
    });

    await switchToJavaScriptMode(page, 'post');
    const readScript = `pm.test("Runtime variable is accessible", function() {
  var userId = pm.variables.get("userId");
  pm.expect(userId).to.equal("1");
});`;
    await fillScriptEditor(page, 'post', readScript);
    await saveStep(page);

    await runFlowAndWaitForResult(page);

    // Flow should succeed
    await expect(page.getByText('Success')).toBeVisible();
    // Both steps should show success
    const successBadges = page.locator('.bg-green-100, .bg-green-50');
    await expect(successBadges.first()).toBeVisible();
  });

  test('should support pm.expect assertions', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'JS Expect Test');
    await addBlankStep(page);

    await page.getByText('Untitled Step').click();
    await configureStep(page, {
      name: 'Expect Step',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });

    await switchToJavaScriptMode(page, 'post');
    const jsScript = `pm.test("Using expect assertions", function() {
  var data = pm.response.json();
  pm.expect(data.id).to.equal(1);
  pm.expect(data.title).to.be.a("string");
  pm.expect(data.userId).to.be.above(0);
});`;
    await fillScriptEditor(page, 'post', jsScript);
    await saveStep(page);

    await runFlowAndWaitForResult(page);

    // Flow should succeed
    await expect(page.getByText('Success')).toBeVisible();
  });

  test('should handle parseInt and parseFloat', async ({ page }) => {
    // Create env with string numbers
    const env = await createEnvironment('Parse Test Env', { amount: '1000', rate: '1.5' });
    await activateEnvironment(env.id);

    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'JS Parse Test');
    await addBlankStep(page);

    await page.getByText('Untitled Step').click();
    await configureStep(page, {
      name: 'Parse Step',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });

    await switchToJavaScriptMode(page, 'post');
    const jsScript = `var amount = parseInt(pm.environment.get("amount"), 10);
var rate = parseFloat(pm.environment.get("rate"));

var result = amount * rate;
pm.environment.set("result", result.toString());

pm.test("Math works correctly", function() {
  pm.expect(result).to.equal(1500);
});`;
    await fillScriptEditor(page, 'post', jsScript);
    await saveStep(page);

    await runFlowAndWaitForResult(page);

    // Flow should succeed
    await expect(page.getByText('Success')).toBeVisible();

    // Verify result
    const updatedEnv = await getEnvironment(env.id);
    const vars = JSON.parse(updatedEnv.variables);
    expect(vars.result).toBe('1500');
  });

  test('should support pm.execution.setNextRequest for flow control', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'JS Flow Control Test');

    // Single step that stops the flow using setNextRequest(null)
    await addBlankStep(page);
    await page.getByText('Untitled Step').click();
    await configureStep(page, {
      name: 'Stop Flow Step',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });
    await switchToJavaScriptMode(page, 'post');
    await fillScriptEditor(page, 'post', `pm.execution.setNextRequest(null);`);
    await saveStep(page);

    await runFlowAndWaitForResult(page);

    // Flow should succeed (stop is a valid action)
    await expect(page.getByText('Success')).toBeVisible();

    // Should show stop flow action (exact match to avoid matching "Stop Flow Step")
    await expect(page.getByText('stop', { exact: true })).toBeVisible();
  });

  test('should use pm.globals for workspace-wide variables', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'JS Globals Test');

    // Step 1: Set a global variable
    await addBlankStep(page);
    await page.getByText('Untitled Step').click();
    await configureStep(page, {
      name: 'Set Global',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });

    await switchToJavaScriptMode(page, 'post');
    const setScript = `var data = pm.response.json();
pm.globals.set("globalPostId", data.id.toString());
pm.globals.set("globalUserId", data.userId.toString());`;
    await fillScriptEditor(page, 'post', setScript);
    await saveStep(page);

    // Step 2: Read the global variable
    await addBlankStep(page);
    await page.getByText('Untitled Step').click();
    await configureStep(page, {
      name: 'Read Global',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/2`,
    });

    await switchToJavaScriptMode(page, 'post');
    const readScript = `pm.test("Global variable is accessible", function() {
  var postId = pm.globals.get("globalPostId");
  var userId = pm.globals.get("globalUserId");
  pm.expect(postId).to.equal("1");
  pm.expect(userId).to.equal("1");
  pm.expect(pm.globals.has("globalPostId")).to.equal(true);
});`;
    await fillScriptEditor(page, 'post', readScript);
    await saveStep(page);

    await runFlowAndWaitForResult(page);

    // Flow should succeed
    await expect(page.getByText('Success')).toBeVisible();
  });

  test('should access pm.request properties', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'JS Request Access Test');
    await addBlankStep(page);

    await page.getByText('Untitled Step').click();
    await configureStep(page, {
      name: 'Request Access Step',
      method: 'POST',
      url: `${JSON_PLACEHOLDER}/posts`,
    });

    // Note: pm.request shows the request that was sent
    await switchToJavaScriptMode(page, 'post');
    const jsScript = `pm.test("Can access request info", function() {
  // pm.request.url and pm.request.method should be available
  pm.expect(pm.request.method).to.equal("POST");
  pm.expect(pm.request.url).to.include("posts");
});`;
    await fillScriptEditor(page, 'post', jsScript);
    await saveStep(page);

    await runFlowAndWaitForResult(page);

    // Flow should succeed
    await expect(page.getByText('Success')).toBeVisible();
  });
});
