# Pixel Wall design

## Overview

Pixel Wall is a small shared drawing tool for Sepolia participants. A cream page, dark type and square colour samples keep attention on the actual onchain canvas. The wide layout puts the canvas beside a three-step toolkit; the wallet balances follow both. Descriptive copy explains the payment economics below the task controls. This direction was inferred from the product brief, not a supplied brand system.

The implementation lives in `web/src/style.css`, `web/src/App.tsx` and `web/src/Canvas.tsx`. This document lives under `docs/` because the task's explicit write scope forbids a root `DESIGN.md`.

## Colors

The CSS root defines a compact semantic palette using hex values:

| Token | Value | Use |
| --- | --- | --- |
| `--page` | `#f6f5f0` | Page and empty draft surface |
| `--surface` | `#fffefa` | Toolkit, inputs and neutral buttons |
| `--text` | `#242724` | Headings, body and selected outlines |
| `--muted` | `#63685f` | Descriptions, labels and metadata |
| `--line` | `#dddfd5` | Structural dividers |
| `--control` | `#888e82` | Input and control boundaries |
| `--accent` | `#2948ce` | Current payment action and keyboard focus |
| `--accent-hover` | `#203aa9` | Primary action hover |
| `--accent-soft` | `#eff1ff` | Network notice background |
| `--error` / `--error-bg` | `#a42b22` / `#fff0ed` | Action failures |
| `--frame` | `#e9e9e1` | Canvas frame and neutral action fill |

The drawing palette is content, independent of UI status: `#2a4bd7`, `#ee5947`, `#f4b942`, `#2b805d`, `#8556b8`, `#ea81b0`, white and black. The native colour input allows any RGB colour. Hex labels and checkmarks complement swatch colour. There is one light theme; no gradients or image backgrounds.

Measured rendered contrasts: body/page 13.83:1, muted/page 5.23:1, body/surface 14.96:1, muted/surface 5.66:1, focus/surface 7.14:1, input border/surface 3.34:1. Measurements and automatic-check limitations are in `frontend/rendered-contrast.txt` and `FRONTEND_VALIDATION.md`.

## Typography

System fonts are used without a network font request: `'Helvetica Neue', Arial, sans-serif` for the interface; `ui-monospace, SFMono-Regular, Consolas, monospace` for hex values; platform monospace for coordinates and step numbers. The browser may substitute locally installed faces. No particular font file is bundled or claimed as loaded.

The root is 16px/1.5. Tokens are `--body: .9375rem`, `--small: .8125rem`, `--label: .75rem`. UI text uses weight 400 or above. `h1` is `clamp(2.5rem, 4.5vw, 3.7rem)`, requested weight 500, line-height 1.07, letter-spacing −.065em. Section headings use 1rem/1.4 and weight 600; the explanatory section heading uses 1.25rem. Uppercase eyebrows use .1em letter-spacing. Numeric inputs remain 1rem. These are CSS weight requests rather than claims about every platform's installed font weights.

Headings balance their wrapping; paragraphs use `text-wrap: pretty`. Changing amounts use tabular numerals and preserve full base-unit precision instead of rounding away a cost. Addresses and large amounts wrap. Long explanations stay within 65ch. Ruler coordinates are deliberately small auxiliary marks; the coordinate fields expose the same positions at normal input size.

## Layout

`.wrap` caps content at 1200px, initially leaving 40px gutters. `.workspace` uses a flexible canvas column, a 364px toolkit and a 40px gap. Controls and content follow their DOM order; no fixed overlay covers actions. Repeated inner gaps are 6–12px, groups use 18–24px, major sections use 32–50px.

- At 64rem and below: 24px gutters, a 330px toolkit, 24px column gap, vertically arranged canvas facts.
- At 48rem and below: the toolkit moves below the canvas, balances become two columns, explanatory content becomes two columns, swatches get 44px height.
- At 34rem and below: 16px gutters, stacked introduction and explanatory content, four swatches per row, full-width withdrawal button.

The canvas scales as a square without smoothing. The browser review covered 1440, 800 and 320px with the actual RPC-backed export; automated connected-state checks also covered 390px. No horizontal overflow was measured at those widths or with 200% root text sizing at 320px. This is reflow/text-resize evidence, not browser-native zoom or a physical-device test.

## Elevation & Depth

The interface is flat: no shadows, floating panels or modal overlays. A tonal frame separates the black canvas from the page. Borders group the toolkit and define inputs; whitespace separates the instructions and wallet state. The skip link alone rises above content when focused.

## Shapes

Controls use 6px radii, inputs 5px, colour swatches 4px, the canvas frame 8px and the toolkit 10px. Pixels stay square. Most controls have at least 44px height. Compact desktop swatches remain above the 24px target baseline; larger coordinate controls provide an equivalent alternative to small canvas cells.

## Components

- `Canvas` in `web/src/Canvas.tsx` takes `colours`, `queue`, `selected` and `onSelect`. It draws the live RGB bytes, overlays draft pixels with dashed outlines and marks selection with black/white inset strokes. Pointer selection and arrow keys update the same coordinate controls. It exposes an accessible label and equivalent labelled inputs outside the drawing.
- Toolkit sections in `App.tsx` use `.editor-section`, numbered headings and a consistent choice → position → review sequence. Selected swatches have a checkmark and `aria-pressed`. A 3px blue keyboard ring with a 5px offset distinguishes focus from selection.
- Shared buttons have neutral, `.primary` and `.quiet` treatments. Only the next payment step has the primary fill. Disabled states explain their prerequisite nearby. Wallet, approval, paint and withdrawal actions retain named pending labels.
- Queue rows show coordinates, hex colour and a named Remove control. The list scrolls after 200px. Empty state explains how to add a mark; a full queue disables Add. Clear only discards the local draft.
- `.wallet-panel` presents balance, Canvas allowance and withdrawable PIXL together. Unavailable values are dashes, not zero. Outdated data is labelled and payment gates close on read failure.
- `.transaction-status` is a stable polite live region. `.notice.error` uses an alert with a recovery/dismiss control. Transaction links remain visible after submission errors.
- Native `details` holds session events, read block and full contract links. No custom dialog/focus trap is required.

Focus uses a 3px accent outline with 4px offset, and system Highlight in forced-colors mode. Hover styles apply only on hover-capable devices. Optional button feedback uses 120ms background/scale transitions and `.96` press scale under `prefers-reduced-motion: no-preference`; no entrance animation runs.

## Do's and Don'ts

Reuse `.wrap`, section headings, existing button variants and the semantic colour tokens. Keep amounts exact, state changes announced and controls gated by chain/verification prerequisites. Use normal document flow and native elements for new controls. Keep the content palette separate from payment status. Do not add a remote font, fake canvas artwork, an in-page swap or an independent deployment address map.

If another small static view is later authorized, start with the same wrap, descending heading scale, flat surface treatment and responsive single-column fallback. Preserve relative asset paths and the existing runtime deployment loader.

Design guidance was adapted from Jakub Krehel's Better Interface, MIT, pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`. Documentation guidance was adapted from Paul Bakaus's Impeccable, Apache-2.0, pinned commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. The supplied guide was consulted as design reference; its source text is not redistributed here.
