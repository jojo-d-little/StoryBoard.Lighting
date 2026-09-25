# Pixi Lighting Component Workflow

This workspace contains the reusable package and its browser validation harness:

- Browser harness: `TopDownLightingTestHarness.html`
- Package source: `packages/lighting/src/`
- Package build output: `packages/lighting/dist/`

Local development and CI use Node.js `26.8.2`, recorded in `.nvmrc` to match
the WebPortal environment.

## Rules

1. Edit TypeScript under `packages/lighting/src/` for reusable runtime behavior.
2. Do not hand-edit files under `packages/lighting/dist/` (they are generated).
3. Rebuild the package before testing the HTML harness.

## Commands

- Install deps: `npm install`
- Build once: `npm run build:package`
- Watch mode while iterating: `npm run dev`
- Type-check only: `npm run typecheck`
- Run pure-core tests: `npm test`
- Run the programmatic package smoke test: `npm run consumer:smoke`
- Run the packed-package consumer smoke test: `npm run consumer:packed-smoke`
- Serve the programmatic consumer: `npm run consumer:dev`, then open `/programmatic-consumer/`

## Release

From `main` with a clean working tree, run:

```powershell
.\Scripts\Release.ps1
```

The script suggests the next patch version, validates the package, commits the
version change, creates a SemVer release tag, and atomically pushes `main` and
the tag. The tag-triggered GitHub workflow performs the final validation and
publishes the private npm package.

The repository CI workflow repeats the package build, type checks, automated
tests, and packed-consumer validation. npm publication remains a controlled
release step after the final package name and registry access are confirmed.

## Typical Loop

1. Edit package TypeScript.
2. Run `npm run build:package`
3. Refresh `TopDownLightingTestHarness.html` and test behavior
4. When stable, consume the package entry point from the game engine

## Why This Setup

- Keeps reusable rendering and contracts in one package source of truth
- Keeps fast visual iteration in the standalone harness
- Keeps engine-facing contract typed and ready for integration

## Handover Docs

- Integration and usage handover: `LightingComponentHandover.md`
