# Pixel Wall frontend

A one-page React + TypeScript application for the deployed PixelCanvas and PIXL token. Vite produces the committed static site in `../dist/`. No backend, indexer, remote fonts, credentials or WalletConnect project ID is required.

## Install, build and preview

Use Node 22.12+ (validated with Node 24.21.0) and npm.

```sh
cd web
npm ci --cache /tmp/pixel-wall-npm-cache
npm run typecheck
npm run build
npm run verify
node scripts/serve.mjs
```

Open `http://localhost:4173/preview/`. Stop the preview with Ctrl+C. The preview deliberately serves the export at a subpath. `npm run preview` is also available. The production build has `base: './'` and no path-based routing; copy all of `dist/` together to a static host or IPFS gateway. A working HTTP(S) origin is needed for configuration fetches; opening `index.html` through `file://` is unsupported.

`npm run dev` is a source-development convenience. For deployment-bound validation use the production build and preview: Vite's development server does not supply the generated deployment files automatically.

## Deployment source of truth

`deployment/handoff.json` and `deployment/network.json` are exact preserved copies of the provided handoff. `scripts/export.mjs` runs after Vite and:

1. Reads `docs/abi/<Contract>.json` with `git show` at the handoff's deployed source commit. Keep that commit in Git history when rebuilding.
2. Parses the raw ABI array, recursively sorts object keys without changing array order, serializes compact JSON, and verifies its Keccak-256 against `abiHash`.
3. Copies the original implementation-derived ABI bytes into `dist/abi/`.
4. Emits `dist/imd-deployment.json` with the exact launch, chain, source, attestation and contract set, the unchanged `network` object and the supplied `walletAddChain` parameters.
5. Inventories every other export file using SHA-256, with a maximum of 128 assets and 8 MiB per asset. The manifest does not hash itself.

`npm run verify` recomputes these checks without changing the export. Never hand-edit a deployed address or a built file. Build again after source changes so the asset hashes remain correct.

At runtime, `src/config.ts` fetches **that same manifest** and its referenced ABI files. It verifies the canonical ABI hashes, creates viem clients from the manifest's network, and contains no independent address, chain-ID or ABI map. `src/model.ts` checks the RPC chain, nonempty contract code and `PixelCanvas.token()` binding before enabling transactions. Token reads and approvals use the address actually returned by `token()`, with decimals read from the verified token. These checks establish the supplied ABI/configuration binding and code presence; they do not independently compare the runtime bytecode to a reproducible build or validate the attestation's signature.

RPC reads try the supplied public URLs in order with seven-second timeouts. An injected wallet on the required chain is the final read fallback. Signing always stays with the visitor's injected browser wallet. A 4902/unknown-chain switch failure offers `wallet_addEthereumChain` using the handoff's exact parameters, then switches again. No mobile WalletConnect connector is configured; use an injected browser wallet or a wallet's embedded browser.

## Use the canvas

- Select a canvas cell, use arrow keys while the canvas is focused, or enter column and row from 0 through 31. Choose a colour and add the pixel to the queue.
- Up to 64 entries are allowed. Repeated coordinates are intentional and priced sequentially, with integer rounding and the contract's price cap. Dashed outlines are local draft pixels; they are not confirmed chain state.
- Review the total, connect a wallet, and approve **exactly** that many PIXL to PixelCanvas. Approval is a separate transaction for each draft, even if a prior allowance exists. Then confirm painting. One entry calls `paint`; multiple entries call `paintBatch`.
- Every transaction is simulated before asking for a signature. Account/chain identity is rechecked, prices and balances are refreshed before payment, and controls lock while pending. A changed draft or cost invalidates the approval step. An allowance capped at the quoted total also bounds the spend if another painter raises the price while a transaction is pending; the contract may revert and gas can still be spent.
- Withdraw collects the connected wallet's entire credit. Zero credit disables the action. Transactions link to the configured explorer; wallet rejection, simulation failure, receipt failure and uncertain confirmation are shown separately. Repriced transactions can complete; a cancellation or other replacement must be reviewed again.
- Reads use a single block per snapshot. `canvas()` draws all 1,024 pixels. `Painted` events trigger a refresh and populate a short session activity list; views also refresh every 15 seconds. Event availability failures are reported. No historical activity index or persistent local draft is stored: reloading discards the draft.

The approved workflow explicitly says **no in-page swap**. Copy explains that PIXL comes from swapping Sepolia ETH in the launch pool. No router, quoter or Permit2 actions are implemented or needed for canvas payments; PIXL approval goes to PixelCanvas. The attested Uniswap addresses remain unchanged in the runtime network configuration.

## Validation

```sh
cd web
npx playwright install chromium
npm test
node scripts/check-live.mjs
```

On a worker with an existing Chromium binary, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its path instead of installing another browser. Playwright starts a bounded local preview automatically when none is running. Tests use the committed production export and intercepted RPC/wallet requests. They cannot sign or broadcast a real transaction. Screenshots and JSON results are written under `docs/frontend/`; generated test output stays ignored under `web/`.

The read-only live check uses the actual public RPCs and records chain ID, code presence, token binding, canvas length and pixel price. It never accesses a wallet or broadcasts. See [validation and limitations](../docs/FRONTEND_VALIDATION.md) and [implemented design](../docs/DESIGN.md).

## Scope and packaging

The explicit ignore-file path budget is **one file: `web/.gitignore`**. It ignores nested `node_modules`, `.cache`, `.vite`, test reports and TypeScript build metadata throughout `web/`. Source, lockfile, runtime assets and export are included; dependency caches, vendored registries and package archives are excluded. Contract source and root configuration are preserved. The task's root `DESIGN.md` request conflicts with its higher-priority allowed paths, so the document is delivered as `docs/DESIGN.md`.

Publication, IPFS pinning, site naming and real funded transactions are outside this worker assignment. Publishing the committed export does not require rebuilding it.
