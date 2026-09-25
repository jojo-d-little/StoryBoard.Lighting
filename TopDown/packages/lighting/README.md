# @jojo-d-little/storyboard-lighting

This is the engine-facing PixiJS 8 lighting package. It accepts a host-owned
Pixi renderer and keeps room-space geometry separate from viewport presentation.

## Phase 2 boundary

The public entry point exports the lighting payload contracts and
`TopDownLightingPipeline`. The package does not create an `Application`,
renderer, ticker, canvas, or DOM dependency. It owns the occlusion, occlusion
blur, light-map, and composition render passes after room setup.

Room textures are `borrowed` by default. The host remains responsible for a
borrowed texture; an explicitly `owned` texture is destroyed by the component
when replaced or disposed. `resize()` accepts room-space geometry and does not
represent a display viewport resize.

Before room setup, `submitFrame()` stores state, `getOutputs()` returns `null`,
and `renderFrame()` throws a descriptive pre-initialization error. The host
supplies an absolute `timeSeconds` value to `renderFrame()` so animation is
deterministic and the host remains in control of the clock.

`resize()` is for room/image geometry and reallocates the package-owned pass
targets. A viewport resize should be handled by the host renderer and scene
presentation without changing the room geometry.

The extracted shaders currently target PixiJS 8's WebGL renderer. Consumers
should request WebGL explicitly until equivalent WebGPU shader variants are
added.

Room lighting provides a scalar `ambient` level and an optional `ambientColor`
whose default is neutral white. Point-light radius, intensity, colors, gradient,
height, and animation settings are supplied through `pointLightDefaults` or
overridden on individual point lights. There is no global point-light intensity
multiplier.

This package is published privately to GitHub Packages under the
`@jojo-d-little` scope. Consumers must map that scope to
`https://npm.pkg.github.com` and authenticate with permission to read the
package.
