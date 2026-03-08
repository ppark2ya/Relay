import { test, expect, request } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import { API_BASE, JSON_PLACEHOLDER } from '../helpers/constants';

test.beforeEach(async () => {
  await cleanupAll();
});

test.describe('Flow Goto Warnings', () => {
  test('should include warning when setNextRequest targets non-existent step', async () => {
    const ctx = await request.newContext();

    const flowRes = await ctx.post(`${API_BASE}/flows`, {
      data: { name: 'Goto Warning Test', description: '' },
    });
    expect(flowRes.ok()).toBeTruthy();
    const flow = await flowRes.json();

    // Step 1: jumps to non-existent "Wrong Name"
    await ctx.post(`${API_BASE}/flows/${flow.id}/steps`, {
      data: {
        name: 'Step A',
        method: 'GET',
        url: `${JSON_PLACEHOLDER}/posts/1`,
        stepOrder: 1,
        postScript: 'pm.execution.setNextRequest("Wrong Name");',
      },
    });

    // Step 2: will execute due to fallthrough
    await ctx.post(`${API_BASE}/flows/${flow.id}/steps`, {
      data: {
        name: 'Step B',
        method: 'GET',
        url: `${JSON_PLACEHOLDER}/posts/2`,
        stepOrder: 2,
      },
    });

    const runRes = await ctx.post(`${API_BASE}/flows/${flow.id}/run`, {
      data: {},
      timeout: 30_000,
    });
    expect(runRes.ok()).toBeTruthy();

    const result = await runRes.json();
    expect(result.success).toBe(true);

    // Both steps execute (fallthrough preserved)
    expect(result.steps).toHaveLength(2);

    // Flow-level warnings should mention the failed goto
    expect(result.warnings).toBeDefined();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('Wrong Name');

    // Step-level warnings on Step A
    expect(result.steps[0].warnings).toBeDefined();
    expect(result.steps[0].warnings.length).toBeGreaterThan(0);
    expect(result.steps[0].warnings[0]).toContain('Wrong Name');

    await ctx.dispose();
  });

  test('should include warning for duplicate step names', async () => {
    const ctx = await request.newContext();

    const flowRes = await ctx.post(`${API_BASE}/flows`, {
      data: { name: 'Duplicate Name Warning Test', description: '' },
    });
    expect(flowRes.ok()).toBeTruthy();
    const flow = await flowRes.json();

    // Step 1: jumps to "Worker"
    await ctx.post(`${API_BASE}/flows/${flow.id}/steps`, {
      data: {
        name: 'Start',
        method: 'GET',
        url: `${JSON_PLACEHOLDER}/posts/1`,
        stepOrder: 1,
        postScript: 'pm.execution.setNextRequest("Worker");',
      },
    });

    // Step 2: first "Worker"
    await ctx.post(`${API_BASE}/flows/${flow.id}/steps`, {
      data: {
        name: 'Worker',
        method: 'GET',
        url: `${JSON_PLACEHOLDER}/posts/2`,
        stepOrder: 2,
      },
    });

    // Step 3: duplicate "Worker"
    await ctx.post(`${API_BASE}/flows/${flow.id}/steps`, {
      data: {
        name: 'Worker',
        method: 'GET',
        url: `${JSON_PLACEHOLDER}/posts/3`,
        stepOrder: 3,
      },
    });

    const runRes = await ctx.post(`${API_BASE}/flows/${flow.id}/run`, {
      data: {},
      timeout: 30_000,
    });
    expect(runRes.ok()).toBeTruthy();

    const result = await runRes.json();
    expect(result.success).toBe(true);

    // Should have warning about duplicate step name
    expect(result.warnings).toBeDefined();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w: string) => w.includes('Duplicate step name'))).toBe(true);

    // Goto should target FIRST "Worker" (step 2), then continue to step 3
    // So: Start → Worker(first) → Worker(second) = 3 steps
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0].requestName).toBe('Start');
    expect(result.steps[1].requestName).toBe('Worker');
    expect(result.steps[2].requestName).toBe('Worker');

    await ctx.dispose();
  });

  test('should include warning for space mismatch in step name', async () => {
    const ctx = await request.newContext();

    const flowRes = await ctx.post(`${API_BASE}/flows`, {
      data: { name: 'Space Mismatch Warning Test', description: '' },
    });
    expect(flowRes.ok()).toBeTruthy();
    const flow = await flowRes.json();

    // Step 1: jumps to "투입"
    await ctx.post(`${API_BASE}/flows/${flow.id}/steps`, {
      data: {
        name: '확정',
        method: 'GET',
        url: `${JSON_PLACEHOLDER}/posts/1`,
        stepOrder: 1,
        postScript: 'pm.execution.setNextRequest("투입");',
      },
    });

    // Step 2: "투입" - tries to goto "승인 대기" (with space)
    await ctx.post(`${API_BASE}/flows/${flow.id}/steps`, {
      data: {
        name: '투입',
        method: 'GET',
        url: `${JSON_PLACEHOLDER}/posts/2`,
        stepOrder: 2,
        postScript: 'pm.execution.setNextRequest("승인 대기");',
      },
    });

    // Step 3: actual name is "승인대기" (no space)
    await ctx.post(`${API_BASE}/flows/${flow.id}/steps`, {
      data: {
        name: '승인대기',
        method: 'GET',
        url: `${JSON_PLACEHOLDER}/posts/3`,
        stepOrder: 3,
      },
    });

    const runRes = await ctx.post(`${API_BASE}/flows/${flow.id}/run`, {
      data: {},
      timeout: 30_000,
    });
    expect(runRes.ok()).toBeTruthy();

    const result = await runRes.json();
    expect(result.success).toBe(true);

    // Warning should contain the mismatched name
    expect(result.warnings).toBeDefined();
    expect(result.warnings.some((w: string) => w.includes('승인 대기'))).toBe(true);

    // "투입" step should have step-level warning
    expect(result.steps[1].warnings).toBeDefined();
    expect(result.steps[1].warnings.length).toBeGreaterThan(0);

    await ctx.dispose();
  });
});
