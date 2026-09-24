# @storyboard/lighting

This is the engine-facing PixiJS 8 lighting package foundation. It accepts a
host-owned Pixi renderer and keeps room-space geometry separate from viewport
presentation.

## Phase 2 boundary

The public entry point exports the lighting payload contracts and
`TopDownLightingPipeline` lifecycle boundary. The package does not create an
`Application`, renderer, ticker, canvas, or DOM dependency.

Room textures are `borrowed` by default. The host remains responsible for a
borrowed texture; an explicitly `owned` texture is destroyed by the component
when replaced or disposed. `resize()` accepts room-space geometry and does not
represent a display viewport resize.

Before room setup, `submitFrame()` stores state, `getOutputs()` returns `null`,
and `renderFrame()` throws a descriptive pre-initialization error. The actual
occlusion, light-map, and composition passes move into this package during
Phase 3.
