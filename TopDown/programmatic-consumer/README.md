# Programmatic consumer

This is the code-only Phase 5 consumer. It has no lighting controls or
harness bridge. It renders an unlit room surface into a PixiJS `RenderTexture`,
submits room-space lighting data, renders with an explicit clock value, and
displays the package's composed output.

Build the package first, then serve the `TopDown` directory:

```bash
npm run consumer:dev
```

Open `/programmatic-consumer/` from that server. The browser example imports
the package's built `dist` entry point. `consumer:packed-smoke` goes one step
further by packing the package, installing that tarball into a temporary clean
consumer, and importing the package from the installed dependency.
