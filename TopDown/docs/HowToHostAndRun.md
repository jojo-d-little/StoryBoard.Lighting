# How to Host and Run the Lighting Demos

From a terminal, change to the `TopDown` folder and install dependencies:

```powershell
npm ci
```

Use Node.js `26.8.2` for this workspace. The required version is recorded in
`.nvmrc`.

## Test harness

Build the lighting package, then start a simple HTTP server:

```powershell
npm run build:package
npx http-server .
```

Open this URL in the browser:

```text
http://localhost:8080/TopDownLightingTestHarness.html
```

If `http-server` selects a different port, replace `8080` with that port. Do not open the HTML file directly with `file://`; the browser will block its module requests.

## Programmatic consumer

Start the Vite development server:

```powershell
npm run consumer:dev
```

Open this URL in the browser:

```text
http://localhost:5173/programmatic-consumer/
```

If Vite selects a different port, replace `5173` with that port. This command builds the lighting package before starting the consumer server.
