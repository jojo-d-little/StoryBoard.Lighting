# Pixi Lighting Component Workflow

This workspace runs a dual-harness setup:

- Browser harness runtime: `TopDownLightingTestHarness.html` + generated `dist/TopDownLightingPipelineComponent.js`
- Engine-integration source of truth: `TopDownLightingPipelineComponent.ts`

## Rules

1. Edit `TopDownLightingPipelineComponent.ts` only.
2. Do not hand-edit files under `dist/` (they are generated).
3. Rebuild JS after TS edits before testing in the HTML harness.

## Commands

- Install deps: `npm install`
- Build once: `npm run build`
- Watch mode while iterating: `npm run dev`
- Type-check only: `npm run typecheck`

## Typical Loop

1. Edit `TopDownLightingPipelineComponent.ts`
2. Run `npm run dev`
3. Refresh `TopDownLightingTestHarness.html` and test behavior
4. When stable, copy/import TS component into the game engine

## Why This Setup

- Prevents JS/TS drift by compiling from one source
- Keeps fast visual iteration in the standalone harness
- Keeps engine-facing contract typed and ready for integration

## Handover Docs

- Integration and usage handover: `LightingComponentHandover.md`
