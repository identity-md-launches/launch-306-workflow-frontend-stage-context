# Frontend validation

## Scope and result

Complete for the frontend implementation and worker validation scope. The workspace Git metadata is read-only, so the delivery commit is supplied in `docs/frontend/delivery.bundle` rather than applied to this checkout. The source, lockfile, static export, implementation-derived ABIs, runtime deployment manifest and worker evidence are delivered. Contracts were not redeployed or edited. This report is worker evidence, not independent network certification.

One explicit path exception: the brief also asks for a root `DESIGN.md`, but its overriding write scope permits only `web/**`, `dist/**`, `docs/**` and `web/.gitignore`. The complete design document is therefore [docs/DESIGN.md](DESIGN.md). No root configuration was changed. The ignore-file budget is exactly `web/.gitignore`; it covers generated dependencies/caches at every nesting level under `web/`.

Consequential assumptions: use the default Vite/React/TypeScript stack; injected browser-wallet connection without a project ID; light theme and system fonts; preserve duplicate queue entries; show recent session events rather than inventing historical activity. The approved workflow explicitly prohibits an in-page swap. No swap/quote/Permit2 action is present; PIXL is approved to PixelCanvas for painting.

## Build and artifact checks

Validated on 2026-09-27 with Node 24.21.0, npm 11.19.0, TypeScript 5.9.3, Vite 7.3.6, React 19.3.0, viem 2.56.9 and Playwright 1.63.0. Exact dependency resolutions are in `web/package-lock.json`.

| Check | Result |
| --- | --- |
| `npm install --cache /tmp/pixel-wall-npm-cache --no-audit --no-fund` from `web/` | Passed; cache and dependencies excluded from submission |
| `npm run build` | Passed, including `tsc --noEmit`, Vite and manifest generation |
| `npm run typecheck` | Passed separately after final source edits |
| `npm run verify` | Passed; both canonical ABI hashes and every export SHA-256 recomputed |
| Exact handoff copies | `cmp` passed for both supplied JSON files and `web/deployment/` copies |
| Source preservation | No diff in `src/`, `foundry.toml`, `remappings.txt`, `lib/` or `.github/` |
| Export | Six declared assets plus the manifest, 562,007 bytes total; well below per-file, asset-count and response-budget limits |

Vite reports one advisory for a main chunk above 500 kB (about 533 kB raw, 165 kB gzip). It does not block the build or exceed the assignment's budget. The export contains only HTML, CSS, JavaScript, the two ABI JSON arrays and the manifest. No sourcemaps, dependency archives, node_modules, registry mirrors or submodules are submitted.

The export script reads ABIs via `git show 47402819880637849506a175967fa00aa1ba91a6:docs/abi/<Contract>.json`, preserving the original bytes. Canonicalization recursively sorts object keys and preserves array order. Verified Keccak-256 values:

- LaunchToken: `38880b8e56d42ce900f744a7908c7139632a49f1c3f33385c64ceaed29d37bee`
- PixelCanvas: `c8f37b334893c8a6e960024b2b2d3937fd607d59c99fd10a898e167bfb762804`

The generated manifest preserves the handoff's identifiers and exact two-contract set, copies `network` unchanged as JSON data, retains the exact wallet add-chain parameters, and excludes itself from the asset inventory. The runtime fetches that same manifest and referenced ABI arrays. No independent compiled address/chain/ABI map exists.

## Interaction checks

`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/imd-worker/ms-playwright/chromium-1246/chrome-linux64/chrome npm test` from `web/`: **16 passed** against the production export at `/preview/`. The machine-specific executable override is optional for other environments. [Full report](frontend/interaction-results.json).

Coverage includes missing wallet, disconnected gates, coordinate and arrow-key selection, colour selection, remove/clear, exact-amount approval, simulation before signature, single `paint`, ordered duplicate `paintBatch`, withdrawal and zero-credit gates, receipt confirmation and reverted receipts, wallet rejection, failed simulation, changed prices, insufficient PIXL, account change/disconnection, missing code and token-binding mismatch, corrupt ABI, RPC outage/retry, max-64 queue, cap arithmetic, odd base-unit rounding, pending lockout and `Painted` event refresh. Unknown-chain testing checks the exact supplied add-chain parameters and a second switch request. No test sends traffic to a real transaction-signing wallet; public RPC URLs are intercepted in these tests.

An extended pending-receipt test initially exposed an incomplete mock RPC: it lacked viem's pending-transaction/block lookups. The mock was corrected to implement those calls, and the final 16-test run passed. A wrapper process reported termination after that run and the manifest check had printed success; the separate subsequent verification/typecheck run completed normally. The JSON report contains the completed test outcomes.

## Live read-only checks

`node scripts/check-live.mjs`: all three supplied public RPCs returned chain ID 11155111, nonempty code for both contracts (LaunchToken 1,722 bytes; PixelCanvas 2,843 bytes), the handoff token address from `token()`, a 3,072-byte canvas and pixel 0 price of 10 PIXL. See [timestamped RPC evidence](frontend/live-rpc.json).

The browser independently loaded the real production export through `/preview/`, fetched the manifest and both ABI files, and rendered the RPC-backed canvas. No browser console errors or failed resource requests were recorded in the inspected live session: [console](frontend/browser-console.txt), [network](frontend/browser-network.txt). These are code-presence/configuration checks, not an independent bytecode match or attestation-signature verification.

## Better Interface consolidated review

Read the pinned workflow and all six core domain guides before implementation, then reviewed the final export. Used the documentation section to extract the final design. The guide was treated as reference data within the task's allowed scope.

| Domain | Coverage and evidence | Unperformed / not applicable |
| --- | --- | --- |
| Accessibility — Checked | Native controls, labels, landmarks, skip link, stable status region, alerts, disabled gates, arrow-key canvas with equivalent coordinate inputs; keyboard Add/Approve; actual focused swatch inspected and corrected. Axe WCAG A/AA checks at 1440, 800, 390 and 320px found zero automatic violations. | No screen-reader session, physical-device test or browser-native 200% zoom. Root text enlargement was checked instead. Forced-colors appearance is not verified. |
| Layout — Checked | Real desktop/intermediate/mobile screenshots; connected mocks; no horizontal overflow at tested widths; no overflow with root text doubled at 320px; normal document flow, grouped controls and responsive grid. | English/LTR only. No localization or RTL support claimed. |
| Writing — Checked | Action labels map to actual requests; displayed exact spend, approval recipient, gas, burn/repaint economics and recovery messages; unavailable values shown as dashes. | No localization requirement. |
| Typography — Checked | Descending headings, input text at 16px, full precise amounts, tabular numerals, address wrapping, real desktop/mobile wrapping inspection. | System-font face/weight availability differs by platform; no specific local font installation claimed. |
| Colors — Checked | Semantic palette and measured actual foreground/background pairs. Body/page 13.83:1; muted/page 5.23:1; body/surface 14.96:1; muted/surface 5.66:1; focus/surface 7.14:1; input boundary/surface 3.34:1. | One light theme. Arbitrary canvas art is user content; no contrast claim for its colours. Disabled controls are intentionally dimmed. |
| UI — Checked | Empty, queued, full, pending, error, success and wrong-chain states tested; click/keyboard feedback, separate approval/payment, removal, native details and refresh observed. | No modal or theme toggle exists. Button motion was source-reviewed; no 10%-speed animation-panel playback was performed. |

See [axe results](frontend/accessibility.json), [computed contrast](frontend/rendered-contrast.txt) and [symbol contrast](frontend/rendered-symbol-contrast.txt). Axe's incomplete contrast entries concern decorative glyphs and the selected-swatch checkmark, not automatic failures. Their computed foreground/background pairs were measured separately; decorative symbols have adjacent text, and swatch selection also has a border and `aria-pressed`. This does not amount to full accessibility certification.

### Findings, fixes and rechecks

| Severity | Source | Evidence and correction | Recheck |
| --- | --- | --- | --- |
| Medium | `web/src/style.css:43` and `:45` | The selected swatch's CSS specificity hid its keyboard-focus treatment. Computed style showed the same 2px outline as selection. Added a dedicated 3px accent outline with 5px offset. | Actual focused mobile screenshot plus keyboard assertion now shows a distinct 3px ring. |
| Low | `web/src/App.tsx:192` (explanatory heading), `web/src/style.css:57` | Hiding a `<br>` at narrow width joined two sentences without a space. Added explicit whitespace. | 320px screenshot and final DOM text retain the sentence space. |
| Medium | `web/src/App.tsx:136` (receipt handling) | Source review found that a successful cancellation/replacement receipt could be treated as completion of the intended action. Added replacement-reason handling; repricing follows the replacement hash, cancellation/other replacement requires a new review. | Typecheck and final interaction suite passed. Real wallet replacement/cancellation remains untested. |

No known unresolved blocker remains in the authorized frontend scope. The missing root design document is an explicit scope conflict, resolved by delivering it under `docs/`.

## Rendered evidence and limits

- [Live desktop](frontend/live-desktop.png): actual RPC state, 1440px.
- [Live intermediate](frontend/live-intermediate.png): actual RPC state, 800px.
- [Live mobile](frontend/live-mobile.png): actual RPC state, 320px.
- [Focused mobile swatch](frontend/mobile-focus.png): inspected corrected keyboard focus.
- [Connected desktop mock](frontend/mock-connected-1440.png) and [connected mobile mock](frontend/mock-connected-320.png): synthetic balances and draft, explicitly not live wallet evidence.

No funded approval, paint, withdrawal, wallet replacement or swap was broadcast. Extension-wallet interoperability, native colour picker behavior across operating systems, physical touch, screen readers, actual browser zoom and chain reorganization behavior remain untested. Test-network RPCs can become unavailable after validation. The page reports stale/error states and offers retry; simulation and an exact allowance cannot guarantee inclusion or prevent gas loss on a revert. Drafts are in memory and disappear on reload.

IPFS pinning, named hosting, fixed-CID asset checks and publisher attestation/RPC checks occur after this worker's delivery. No published URL, CID or publication-check success is claimed.

## Git delivery

The worker rejected `git add web docs dist` because `.git/index.lock` is on a read-only filesystem. No permissions were escalated. An isolated Git repository in the assignment's disposable `test/scratch/` was used to commit only `web/`, `dist/` and `docs/` changes on top of the original deployed source commit. `docs/frontend/delivery.bundle` preserves that commit and its history, including source, lockfile, runtime export and evidence. The bundle necessarily excludes itself. It is a Git handoff artifact, not a frontend dependency archive or part of the hosted export.

Inspect the included ref with `git bundle list-heads docs/frontend/delivery.bundle`; verify it with `git bundle verify docs/frontend/delivery.bundle`. On a writable checkout, fetch its `HEAD` to a review branch before applying it. The main workspace files remain ready for the publisher's normal source collection.
