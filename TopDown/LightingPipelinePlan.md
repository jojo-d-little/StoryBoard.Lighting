# Lighting Pipeline Plan (Demo -> Engine)

## Purpose
This document captures why the current pipeline is structured the way it is, what we intend to build next, and how to evolve this test harness into an engine-ready lighting subsystem.

## Current State Summary
We now have a stable baseline where light placement and shape are correct.

Key outcomes achieved:
- Direct light-map preview is correctly positioned and circular.
- Shader-based preview and compose align with direct preview.
- Coordinate handling is consistent by running lighting work in image-space render targets.

## Core Reasoning (Why Earlier Attempts Failed)
The main issue was not one bug. It was a mismatch between coordinate spaces.

What caused instability:
- Mixed use of display-space and image-space sampling.
- Competing Y-axis conventions across passes.
- Filter UV behavior on scaled display sprites introduced offset and shape distortion.

What fixed it:
- Generate and sample lighting in a single, stable internal space (image space).
- Treat screen scaling as presentation only.
- Use explicit pixel-based sampling where needed to avoid ambiguous UV transforms.

## Guiding Principles
These are non-negotiable for future stages.

1. Stage contract first.
- Every pass defines: inputs, outputs, coordinate space, and blend semantics.

2. One canonical internal space.
- Lighting simulation runs in source-image pixels.
- UI/view transforms must not change lighting math.

3. Display is last.
- The on-screen sprite is a presentation step, not a simulation step.

4. Add complexity only when justified.
- Separate responsibilities now.
- Add extra render passes only when behavior or quality needs it.

## Pipeline Direction (Short Term)
We want true multi-stage behavior without unnecessary complexity.

Recommended stage model:
1. Scene/Albedo Stage
- Output: base scene texture.

2. Point Light Accumulation Stage
- Output: point light map texture.
- Spatially varying and worth being a real pass.

3. Ambient Contribution
- Keep distinct in contract, but not necessarily a full pass yet.
- For now, ambient can remain a uniform term unless it becomes spatial.

4. Compose Stage
- Output: final lit scene.
- Formula: final = albedo * (ambient + pointLight), with clamp/tone policy.

5. Optional Softening Stage (next best visual gain)
- Small blur on point light map for cleaner falloff and style control.

## Why Ambient and Point Should Be Distinct (But Not Always Separate Passes)
- Distinct responsibilities improve debugability and scalability.
- A dedicated ambient pass is not required while ambient is uniform.
- Promote ambient to a full pass only when needed (zones, AO, fog, probes, gradients).

## Normal Maps: When to Add
Normal maps are valuable, but not the minimum-risk next step.

Decision criteria to add normals:
- Current stage boundaries are stable.
- Pass debugging is easy and repeatable.
- We have normal-map assets or a generation strategy.

If criteria are met, normals become Stage 2 enhancement (light response), not a pipeline rewrite.

## Engineization Goals
Convert this test harness into reusable runtime components.

Target architecture:
- TopDownLightingPipelineComponent (orchestrator)
- Pass interfaces (init, resize, execute, dispose)
- Resource registry (render textures, formats, dimensions)
- Debug view router (show any stage output)
- Config schema (quality presets, pass toggles)

Suggested interfaces (conceptual):
- IPass.execute(context)
- context contains: renderer, resources, frame constants, scene constants

## Milestone Plan

### Milestone 1: Stage Contracts and Naming
- Rename and document current passes with explicit input/output contracts.
- Add inline comments for coordinate space assumptions.
- Success criteria: anyone can trace data flow without reading shader code first.

### Milestone 2: Stage Debug Panel
- Add a stage viewer dropdown: albedo, pointMap, composed.
- Add simple overlays for click marker and light center marker.
- Success criteria: stage-level issues are visible in one minute.

### Milestone 3: Light Softening Stage
- Add optional blur stage on point map (small kernel first).
- Expose quality knob (off/low/med).
- Success criteria: clear visual improvement with bounded performance cost.

### Milestone 4: Pipeline Class Extraction
- Move pass setup/execute logic out of monolithic HTML script.
- Keep behavior identical while improving code organization.
- Success criteria: no visual regressions and easier pass addition.

### Milestone 5: Normal-Ready Extension Point
- Add placeholder hooks and uniforms for normal sampling in light response stage.
- Implement only after milestone 4 is stable.
- Success criteria: normals can be added without changing orchestration model.

## Risk Register
- Coordinate drift after refactors.
  - Mitigation: stage contracts + debug stage viewer + marker overlays.

- Pass explosion and maintenance burden.
  - Mitigation: only promote to full pass when spatial variability or quality demands it.

- Performance regressions on large images.
  - Mitigation: quality tiers, optional stages, and resolution scaling for heavy passes.

## Definition of "Functional Enough" for Engine Reuse
We can start engine formalization when all are true:
- Stage outputs are stable and inspectable.
- Coordinate behavior is deterministic across resize and aspect ratios.
- Passes can be toggled without side effects.
- Core lighting behavior is covered by basic visual regression checks.

## Immediate Next Actions
1. Implement Milestone 1 documentation updates in code comments.
2. Implement Milestone 2 stage debug panel.
3. Implement Milestone 3 optional blur stage.

## Open Questions
- Should ambient remain scalar only, or add ambient color now?
- Do we need quality presets before adding blur?
- Should stage outputs support export snapshots for regression checks?

## Shadow Tweak Taxonomy (Global vs Per-Cell)
This section keeps us aligned on which knobs are engine-wide lighting behavior and which knobs are object/cell presentation cues.

### Global Shadow Tweaks (engine/system level)
- Penumbra strength: scales shadow softness growth with distance.
- Blur amount/quality: post-process soften for all shadows.
- Contact hardening factor: controls near-vs-far edge hardness globally.
- Shadow intensity curve: remaps occlusion to visual darkness.
- Jitter/noise edge amount: subtle dithering before blur to reduce banding.

Why global:
- These define overall look/quality policy for the room or quality preset.
- They should be consistent and cheap to tune for platform tiers.

### Per-Cell Properties (object/presentation level)
- Blocker height (cells): already implemented candidate property.
- Blocker footprint size (cells): already implemented candidate property.
- Blocker shadow strength (0..1): supports translucent or soft-blocking objects.
- Blocker edge roundness/inset: reduces blocky silhouettes while staying grid-based.
- Optional subcell occupancy mask (2x2 or 4x4): captures partial shape detail.

Why per-cell:
- These represent object/material cues and belong with game content data.
- Designers can tune object identity without changing global lighting policy.

## Shadow Enhancement Backlog (Do Not Implement All At Once)
1. Add blocker shadow strength per cell (first per-cell expansion).
2. Add global penumbra factor based on light height, blocker height, and distance.
3. Add optional tiny separable blur stage on occlusion/light map.
4. Add blocker edge roundness parameter (per-cell) or a global fallback.
5. Add quality presets that gate expensive tweaks.

## Code Commenting Contract For This Project
When adding or editing lighting/shadow parameters, tag comments using one of:
- [GLOBAL] for engine-wide behavior/quality controls.
- [CELL] for per-cell/object presentation properties.

This is a readability contract so future contributors can quickly separate rendering policy from content data.
