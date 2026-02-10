import { type Page, expect } from '@playwright/test';

/** Navigate to the Flows tab in the sidebar */
export async function navigateToFlows(page: Page) {
  await page.getByRole('button', { name: 'Flows' }).click();
}

/** Create a new flow via the sidebar UI */
export async function createFlow(page: Page, name: string) {
  await page.getByRole('button', { name: /New Flow/ }).click();
  await page.getByPlaceholder('Flow name').fill(name);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  // Wait for flow editor to load with the name in the h2 heading
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

/** Add a blank step to the current flow */
export async function addBlankStep(page: Page) {
  await page.getByRole('button', { name: 'Add Step' }).click();
  await page.getByText('Add Blank Step').click();
  // Wait for the step card to appear
  await expect(page.getByText('Untitled Step')).toBeVisible();
}

/** Expand a step by clicking on its card (0-based index) */
export async function expandStep(page: Page, index: number) {
  const steps = page.locator('.group >> text=Untitled Step, .group >> text=GET, .group >> text=POST');
  // Click the step card area. Steps are in order, find by step number.
  const stepNumber = page.locator('.rounded-full.bg-blue-600').nth(index);
  // Click adjacent step content area
  const stepCard = stepNumber.locator('..').locator('..').locator('.group .cursor-pointer').first();
  await stepCard.click();
}

/** Configure a step that is already expanded */
export async function configureStep(
  page: Page,
  opts: {
    name?: string;
    method?: string;
    url?: string;
    headers?: string;
    body?: string;
    bodyType?: string;
    extractVars?: string;
  },
) {
  if (opts.name !== undefined) {
    const nameInput = page.getByPlaceholder('Step name');
    await nameInput.clear();
    await nameInput.fill(opts.name);
  }
  if (opts.method !== undefined) {
    await page.locator('select.font-mono').selectOption(opts.method);
  }
  if (opts.url !== undefined) {
    const urlInput = page.getByPlaceholder('https://api.example.com/endpoint');
    await urlInput.clear();
    await urlInput.fill(opts.url);
  }
  if (opts.headers !== undefined) {
    // Switch to Raw mode first
    await page.getByRole('button', { name: 'Raw' }).click();
    const headersInput = page.getByPlaceholder('{"Content-Type": {"value": "application/json", "enabled": true}}');
    await headersInput.clear();
    await headersInput.fill(opts.headers);
  }
  if (opts.bodyType !== undefined) {
    await page.getByRole('button', { name: opts.bodyType, exact: true }).click();
  }
  if (opts.body !== undefined) {
    // Body uses CodeMirror editor - target the first one (body editor, not pre/post script)
    // Find by placeholder text which contains typical body content hint
    const bodyEditor = page.locator('.cm-content[aria-placeholder*="key"]').first();
    await bodyEditor.click();
    await bodyEditor.fill(opts.body);
  }
  if (opts.extractVars !== undefined) {
    const extractInput = page.getByPlaceholder('{"token": "$.data.accessToken"}');
    await extractInput.clear();
    await extractInput.fill(opts.extractVars);
  }
}

/** Save the currently expanded step and close the modal */
export async function saveStep(page: Page) {
  await page.getByRole('button', { name: 'Save Step' }).click();
  // Wait for save to complete (button text changes back from "Saving...")
  await expect(page.getByRole('button', { name: 'Save Step' })).toBeVisible();
  // Close the fullscreen modal
  await page.keyboard.press('Escape');
}

/** Run the current flow and wait for results */
export async function runFlowAndWaitForResult(page: Page) {
  await page.getByRole('button', { name: 'Run Flow' }).click();
  // Wait for "Flow Result" to appear
  await expect(page.getByText('Flow Result')).toBeVisible({ timeout: 30_000 });
}
