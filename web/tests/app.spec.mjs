import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { mockChain, manifest } from './fixtures.mjs';
const unit = 10n ** 18n;
async function open(page, options) {
  const state = await mockChain(page, options);
  await page.goto('./');
  await expect(page.getByText('● Live', { exact: true })).toBeVisible();
  return state;
}
async function connect(page) {
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await expect(page.getByTestId('balance')).toContainText('10000');
}
async function add(page) { await page.getByRole('button', { name: 'Add pixel to queue' }).click(); }
async function approve(page) {
  await page.getByRole('button', { name: '1. Approve PIXL' }).click();
  await expect(page.getByRole('button', { name: 'Approval confirmed' })).toBeVisible();
}
test('static subpath, no wallet, coordinate/keyboard draft, remove and clear', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await open(page, { noWallet: true });
  await expect(page.getByRole('button', { name: '1. Approve PIXL' })).toBeDisabled();
  await page.locator('canvas').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown');
  await expect(page.getByLabel('Column (x)')).toHaveValue('1'); await expect(page.getByLabel('Row (y)')).toHaveValue('1');
  await page.getByRole('button', { name: 'Use colour #ee5947' }).click(); await add(page);
  await expect(page.getByTestId('total')).toHaveText('10 PIXL');
  await expect(page.getByRole('list', { name: 'Queued pixels' })).toContainText('(1, 1) #EE5947');
  await page.getByRole('button', { name: 'Remove queued pixel 1' }).click();
  await expect(page.getByText('Your next mark starts here.')).toBeVisible();
  await add(page); await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await expect(page.getByRole('alert')).toContainText('No browser wallet found');
  expect(errors).toEqual([]);
});
test('single paint requires exact PIXL approval, then simulation, signature, receipt and refresh', async ({ page }) => {
  const state = await open(page); await connect(page); await add(page);
  await expect(page.getByRole('button', { name: '2. Paint 1 pixel', exact: true })).toBeDisabled();
  await approve(page);
  expect(state.sent[0].args[1]).toBe(10n * unit);
  expect(state.sent[0].args[0].toLowerCase()).toBe(manifest.contracts.find(c => c.name === 'PixelCanvas').address);
  await page.getByRole('button', { name: '2. Paint 1 pixel', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Paint confirmed' })).toBeVisible();
  expect(state.sent.map(s => s.functionName)).toEqual(['approve', 'paint']);
  await expect(page.getByTestId('balance')).toHaveText('9990 PIXL');
  await expect(page.getByTestId('allowance')).toHaveText('0 PIXL');
  expect(state.calls.filter(c => c.method === 'eth_call' && c.params[0].from).length).toBeGreaterThanOrEqual(2);
});
test('ordered duplicate batch costs 21 PIXL and uses paintBatch; withdrawal cannot pay twice', async ({ page }) => {
  const state = await open(page); await connect(page); await add(page); await add(page);
  await expect(page.getByTestId('total')).toHaveText('21 PIXL'); await approve(page);
  await page.getByRole('button', { name: '2. Paint 2 pixels', exact: true }).click();
  await expect(page.getByText('Paint confirmed. Your pixels are on the wall.', { exact: false })).toBeVisible();
  expect(state.sent[1].functionName).toBe('paintBatch'); expect(state.sent[1].args[0]).toEqual([0n, 0n]);
  await page.getByRole('button', { name: 'Withdraw PIXL' }).click();
  await expect(page.getByTestId('withdrawable')).toHaveText('0 PIXL');
  await expect(page.getByRole('button', { name: 'Withdraw PIXL' })).toBeDisabled();
  expect(state.sent[2].functionName).toBe('withdraw');
});
test('unknown wallet chain offers exact add-chain parameters, then switches again', async ({ page }) => {
  const state = await open(page, { chain: 1, unknownChain: true }); await connect(page); await add(page);
  await expect(page.getByRole('button', { name: '1. Approve PIXL' })).toBeDisabled();
  await page.getByRole('button', { name: 'Switch to Sepolia' }).click();
  await expect(page.getByRole('button', { name: '1. Approve PIXL' })).toBeEnabled();
  expect(state.calls.find(c => c.method === 'wallet_addEthereumChain').params).toEqual([manifest.walletAddChain]);
  expect(state.calls.filter(c => c.method === 'wallet_switchEthereumChain')).toHaveLength(2);
});
test('rejected signing and failed simulation preserve draft and send no transaction', async ({ page }) => {
  const state = await open(page); await connect(page); await add(page); state.reject = true;
  await page.getByRole('button', { name: '1. Approve PIXL' }).click();
  await expect(page.getByRole('alert')).toContainText('Request declined'); expect(state.sent).toHaveLength(0);
  state.reject = false; state.failSimulation = true;
  await page.getByRole('button', { name: '1. Approve PIXL' }).click();
  await expect(page.getByRole('alert')).toContainText('approval failed');
  await expect(page.getByTestId('total')).toHaveText('10 PIXL'); expect(state.sent).toHaveLength(0);
});
test('price change invalidates approval, insufficient balance gates payment, account change clears balances', async ({ page }) => {
  const state = await open(page); await connect(page); await add(page); await approve(page);
  state.prices[0] = 11n * unit;
  await page.getByRole('button', { name: '2. Paint 1 pixel', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('pixel price changed'); expect(state.sent).toHaveLength(1);
  await expect(page.getByTestId('total')).toHaveText('11 PIXL');
  state.balance = 0n; await page.getByRole('button', { name: 'Refresh', exact: false }).click();
  await expect(page.getByText('You need more PIXL for this draft.')).toBeVisible();
  await expect(page.getByRole('button', { name: '1. Approve PIXL' })).toBeDisabled();
  state.connected = false; await page.evaluate(() => window.__emitWallet('accountsChanged'));
  await expect(page.getByTestId('balance')).toHaveText('— PIXL');
});
test('queue max 64, cap arithmetic and invalid coordinate bounded', async ({ page }) => {
  await open(page, { prices: { 0: 1000000n * unit } });
  for (let i = 0; i < 64; i++) await add(page);
  await expect(page.getByRole('button', { name: 'Queue full · 64 pixels' })).toBeDisabled();
  await expect(page.getByTestId('total')).toHaveText('64000000 PIXL');
  await page.getByLabel('Column (x)').fill('32'); await expect(page.getByLabel('Column (x)')).not.toHaveValue('32');
});
test('missing contract code keeps transactions disabled, retry recovers', async ({ page }) => {
  const state = await mockChain(page, { missingCode: true }); await page.goto('./');
  await expect(page.getByRole('alert')).toContainText('contract code is missing');
  await expect(page.getByRole('button', { name: '1. Approve PIXL' })).toBeDisabled();
  state.missingCode = false; await page.getByRole('button', { name: 'Retry connection' }).click();
  await expect(page.getByText('● Live', { exact: true })).toBeVisible();
});
test('mismatched token binding disables transactions', async ({ page }) => {
  await mockChain(page, { wrongToken: true }); await page.goto('./');
  await expect(page.getByRole('alert')).toContainText('does not match the attested PIXL token');
  await expect(page.getByRole('button', { name: '1. Approve PIXL' })).toBeDisabled();
});
test('RPC outage marks old state unavailable and retry restores reads', async ({ page }) => {
  const state = await open(page, { noWallet: true }); state.badRPC = true;
  await page.getByRole('button', { name: 'Refresh', exact: false }).click();
  await expect(page.getByRole('alert')).toContainText('Live state unavailable');
  await expect(page.getByRole('button', { name: '1. Approve PIXL' })).toBeDisabled();
  state.badRPC = false; await page.getByRole('button', { name: 'Retry connection' }).click();
  await expect(page.getByText('● Live', { exact: true })).toBeVisible();
});
test('reverted receipt retains draft and never enables payment', async ({ page }) => {
  const state = await open(page, { reverted: true }); await connect(page); await add(page);
  await page.getByRole('button', { name: '1. Approve PIXL' }).click();
  await expect(page.getByRole('alert')).toContainText('Transaction reverted');
  await expect(page.getByRole('button', { name: '2. Paint 1 pixel', exact: true })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'View transaction' })).toBeVisible();
  expect(state.allowance).toBe(0n);
});
test('keyboard controls, visible selected-swatch focus and pending approval gate', async ({ page }) => {
  const state = await open(page); await connect(page);
  const swatch = page.getByRole('button', { name: 'Use colour #2a4bd7' });
  await swatch.focus(); await page.keyboard.press('Space');
  expect(await swatch.evaluate(el => getComputedStyle(el).outlineWidth)).toBe('3px');
  await page.getByRole('button', { name: 'Add pixel to queue' }).focus(); await page.keyboard.press('Enter');
  state.delayReceipt = true;
  const approvalButton = page.getByRole('button', { name: '1. Approve PIXL' });
  await expect(approvalButton).toBeEnabled(); await approvalButton.focus(); await page.keyboard.press('Enter');
  await expect(page.getByText('Transaction submitted. Waiting for confirmation…', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approving…' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Add pixel to queue' })).toBeDisabled();
  state.delayReceipt = false;
  await expect(page.getByRole('button', { name: 'Approval confirmed' })).toBeVisible({ timeout: 20000 });
  expect(state.sent).toHaveLength(1);
});
test('duplicate costs preserve base-unit rounding at an odd price', async ({ page }) => {
  await open(page, { prices: { 0: 11n } }); await add(page); await add(page);
  await expect(page.getByTestId('total')).toHaveText('0.000000000000000023 PIXL');
});
test('ABI corruption fails closed before RPC verification', async ({ page }) => {
  const state = await mockChain(page);
  await page.route('**/abi/PixelCanvas.json', route => route.fulfill({ json: [] })); await page.goto('./');
  await expect(page.getByRole('alert')).toContainText('ABI verification failed');
  expect(state.sent).toHaveLength(0);
});
test('Painted event refreshes live canvas and prices', async ({ page }) => {
  const state = await open(page); await page.getByText('Live activity & contract details', { exact: true }).click();
  state.paintEvent(0, 0xff0000);
  await expect(page.getByText(/Pixel 0 painted by/)).toBeVisible({ timeout: 25000 });
  await expect(page.locator('.pixel-details')).toContainText('11 PIXL');
});
test('desktop, intermediate, mobile reflow and automated accessibility', async ({ page }) => {
  await open(page); await connect(page); await add(page);
  await mkdir('../docs/frontend', { recursive: true });
  const evidence = [];
  for (const width of [1440, 800, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const geometry = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(width);
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    evidence.push({ width, geometry, violations: audit.violations, incomplete: audit.incomplete.map(i => ({ id: i.id, description: i.description, nodes: i.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })) });
    expect(audit.violations).toEqual([]);
    if (width === 1440 || width === 320) await page.screenshot({ path: `../docs/frontend/mock-connected-${width}.png`, fullPage: true });
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await writeFile('../docs/frontend/accessibility.json', JSON.stringify(evidence, null, 2));
});
