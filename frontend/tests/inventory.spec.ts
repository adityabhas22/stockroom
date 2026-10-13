import { test, expect } from '@playwright/test';

test('create, receive, issue, edit, and archive an item', async ({ page }) => {
  const sku = `E2E-${Date.now()}`;
  await page.goto('/');
  await page
    .getByLabel('Workspace password')
    .fill(process.env.OPERATOR_PASSWORD || 'stockroom-local');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inventory', exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await page.getByLabel('Item name').fill('Browser test caliper');
  await page.getByLabel('SKU', { exact: true }).fill(sku);
  await page.getByLabel('Category', { exact: true }).fill('Tools');
  await page.getByLabel('Shelf location').fill('T-01');
  await page.getByRole('button', { name: 'Create item' }).click();
  await page.getByRole('searchbox').count();
  await page.getByLabel('Search inventory').fill(sku);
  const row = page.getByRole('row').filter({ hasText: sku });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Record movement for Browser test caliper' }).click();
  await page.getByLabel('Units to receive').fill('7');
  await page.getByLabel('Reason or reference').fill('E2E receipt');
  await page.getByRole('button', { name: 'Record movement', exact: true }).click();
  await expect(row).toContainText('In stock');
  await row.getByRole('button', { name: 'Record movement for Browser test caliper' }).click();
  await page.getByRole('button', { name: 'Issue stock' }).click();
  await page.getByLabel('Units to issue').fill('7');
  await page.getByLabel('Reason or reference').fill('E2E issue');
  await page.getByRole('button', { name: 'Record movement', exact: true }).click();
  await expect(row).toContainText('Out of stock');
  await row.getByRole('button', { name: `Browser test caliper ${sku}` }).click();
  await expect(page.getByText('E2E receipt', { exact: true })).toBeVisible();
  await expect(page.getByText('E2E issue', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit details' }).click();
  await page.getByLabel('Shelf location').fill('T-02');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(row).toContainText('T-02');
  await row.getByRole('button', { name: `Browser test caliper ${sku}` }).click();
  await page.getByRole('button', { name: 'Archive item' }).click();
  await page.getByRole('button', { name: 'Confirm archive' }).click();
  await expect(page.getByRole('heading', { name: 'No matching items' })).toBeVisible();
  await page.getByRole('button', { name: 'Movements', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Movement ledger.' })).toBeVisible();
  await expect(page.getByText('E2E receipt', { exact: true }).first()).toBeVisible();
});

test('mobile layout, keyboard dialog dismissal, and session expiry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page
    .getByLabel('Workspace password')
    .fill(process.env.OPERATOR_PASSWORD || 'stockroom-local');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inventory', exact: false })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await expect(page.getByLabel('Item name')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.context().clearCookies();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Open your stockroom' })).toBeVisible();
});

test('network failure has a retry path', async ({ page }) => {
  await page.route('**/api/session', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Stockroom is unavailable' })).toBeVisible();
  await page.unroute('**/api/session');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Open your stockroom' })).toBeVisible();
});
