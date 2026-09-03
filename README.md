# dastro-3d

Astro/Dastro content module for rendering 3D models with Three.js.

Renders a glb uploaded to DatoCMS as an interactive product viewer — orbit, auto-rotate, studio lighting — with three.js kept out of your main bundle until someone actually looks at it.

## Install

See [docs/install.instruction.md](./docs/install.instruction.md) — the package is one step of several, since the DatoCMS schema and the module wrappers live in the project.

```bash
npm i github:gridonic/dastro-3d#v0.1.4
```

## Use

```astro
---
import { Model3d } from 'dastro-3d/components';
---

<Model3d
  data={data.viewer}
  aspectRatio={16 / 9}
  sizes="88vw"
  zoom={1.35}
  backgroundColor={{ rgba: { red: 17, green: 24, blue: 39, alpha: 0.92 } }}
  rotateCursor="/icons/rotate.svg"
  rotateCursorScale={1.5}
/>
```

`data` is the `...ModelViewer` fragment. The wrapper owns the box (grid, aspect ratio, height); the component owns the render.

`zoom` is optional and controls initial camera distance after framing. `backgroundColor` is optional and replaces the environment background when present; pass either a CSS color string, `{ hex: "#111827" }`, or `{ rgba: { red, green, blue, alpha } }`. `rotateCursor` is optional — a URL to an image in the consuming project, used as the canvas cursor once the model can be rotated. `rotateCursorScale` is optional (default `1`); the hotspot is always the centre of the scaled icon.

## What it costs

| | gzip | when |
|---|---|---|
| Page script | ~1 KB | on page load |
| Viewer chunk (three.js) | ~167 KB | only once the load trigger fires |

A page with a viewer below the fold pays ~1 KB until someone scrolls near it. Editors choose per module whether that's on approach or on click.

## What it is not

A three.js toolkit. `scene`, `renderer` and `camera` are not exposed and won't be — see [ADR-0001](./docs/adr/0001-sealed-viewer-three-js-stays-internal.md). Art-directed, bespoke 3D work should use three.js directly rather than this package.

It also does no compression. Editors compress before upload against a documented [export preset](./docs/export-preset.md), and a DatoCMS file-size validation enforces it — see [ADR-0002](./docs/adr/0002-no-compression-pipeline-editors-compress.md).

## Docs

- [CONTEXT.md](./CONTEXT.md) — the domain language and where each piece lives
- [docs/adr/](./docs/adr/) — why it's shaped this way
- [docs/install.instruction.md](./docs/install.instruction.md) — adding 3D to a project
- [docs/export-preset.md](./docs/export-preset.md) — for editors preparing models

## Development

```bash
npm install
npm run astro:check
```
