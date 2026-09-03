# dastro-3d

An installable package that renders 3D models uploaded to DatoCMS on Astro/Dastro websites. It ships a sealed **Model Viewer** as a product — not a three.js toolkit. Bespoke, art-directed 3D work is explicitly out of scope and does not use this package.

## Language

### The package boundary

**Model Viewer**:
The sealed, opinionated component that renders a **Model** on a page.
_Avoid_: player, scene, canvas, Model3d (that is the component's filename, not the concept)

**Model**:
A single 3D asset uploaded to DatoCMS and rendered by the **Model Viewer**.
_Avoid_: asset, mesh, object, file

**Viewer Contract**:
The hand-written TypeScript interface in dastro-3d describing the shape of **Model** data the **Model Viewer** expects. Mirrors dastro's existing `VideoPlayerData` pattern.
_Avoid_: schema, type, props

**Content Module**:
The thin, `__typename`-bound Astro wrapper living in a consuming project that supplies layout and passes a **Model** to the **Model Viewer**. Two exist — `Content3d` (in-grid) and `Header3d` (hero) — differing only in grid classes, aspect ratio and priority, exactly as `ContentMediaAsset` and `HeaderTextMedia` both wrap the same dastro `MediaAsset`.
_Avoid_: module component, block, Content3d (that is a filename)

**Sealed**:
A property of the **Model Viewer**: three.js internals (`scene`, `renderer`, `camera`) are never part of the public API. Its ceiling is raised by adding props and features, never by exposing internals.
_Avoid_: closed, private, encapsulated

**Bespoke 3D**:
Art-directed, project-specific three.js work (e.g. nussli-website's `ThreeSlider`). Out of scope — does not consume this package.
_Avoid_: custom, one-off, advanced

### The asset pipeline

**Size Budget**:
The maximum byte size of a **Model**, enforced by a file-size validation on the DatoCMS asset field so an oversized upload is rejected in the CMS UI rather than at runtime.
_Avoid_: limit, max size, quota

**Export Preset**:
The documented `gltf-transform` settings an editor applies to bring a **Model** under the **Size Budget** — meshopt compression and webp textures. The compression step is the editor's, not the system's, and Draco is not supported (see [ADR-0002](./docs/adr/0002-no-compression-pipeline-editors-compress.md)).
_Avoid_: optimization, pipeline, compression step

### Loading

**Poster**:
The DatoCMS image rendered server-side in place of the **Model** before three.js loads. Unlike the **Model**, it goes through imgix and is genuinely optimized.
_Avoid_: placeholder, thumbnail, fallback (a **Poster** is also the no-WebGL fallback, but the term names the image)

**Load Trigger**:
The CMS-configured event that causes three.js and the **Model** to be fetched — either `approach` (the **Model Viewer** nears the viewport) or `click` (the visitor opts in from the **Poster**).
_Avoid_: loading mode, hydration, lazy

**Viewer Chunk**:
The dynamically-imported JS chunk holding three.js and the **Model Viewer** engine. Never part of the page's main bundle — a page whose **Model Viewer** is never triggered pays nothing.
_Avoid_: bundle, island

## Relationships

- A **Content Module** wraps exactly one **Model Viewer**
- A **Model Viewer** renders exactly one **Model**
- A **Content Module** lives in the consuming project; a **Model Viewer** lives in dastro-3d
- A **Content Module** satisfies the **Viewer Contract** via a GraphQL fragment it owns
- **Bespoke 3D** consumes neither a **Model Viewer** nor a **Content Module**

### Distribution

**Recipe**:
The markdown install instructions (`install.instruction.md`) that add 3D to an **existing** project — create the Dato model, copy the **Content Module**, register it. Follows dastro's established `*.instruction.patch` convention, and is reliable for an agent to execute.
_Avoid_: installer, migration, setup script

## Decisions

- [ADR-0001](./docs/adr/0001-sealed-viewer-three-js-stays-internal.md) — the **Model Viewer** is **Sealed**; three.js is never public API
- [ADR-0002](./docs/adr/0002-no-compression-pipeline-editors-compress.md) — no compression pipeline; editors compress, Dato enforces the **Size Budget**

## The seam

The `__typename` coupling to a DatoCMS schema lives in the consuming project. The engine lives in the package. This mirrors dastro's existing split exactly:

| dastro (package) | astro-boilerplate (project) |
|---|---|
| `VideoPlayer.astro` (generic) | `ContentVideoPlayer.astro` (bound to `ContentVideoPlayerRecord`) |
| `VideoPlayerData` interface | `ContentVideoPlayer.gql` fragment |

dastro-3d follows it:

| dastro-3d | astro-boilerplate |
|---|---|
| **Model Viewer** | **Content Module** (`Content3d.astro`) |
| **Viewer Contract** | `Content3d.gql` fragment + `modules.config.ts` registration |

The package ships **no GraphQL** — codegen scans project `src/` only, so fragments cannot live in a dependency. The **Viewer Contract** and the fragment are linked by hand; nothing enforces it at compile time.

## Example dialogue

> **Dev:** "Client wants the model to fade in with a custom shader as you scroll. Do we add a hook to the **Model Viewer** so they can reach the scene?"
>
> **Nicolas:** "No. That's **Bespoke 3D** — it doesn't use the package at all. The **Model Viewer** stays **Sealed**. If we hand out `scene`, three.js becomes our public API and we can never upgrade it again."
>
> **Dev:** "So if three clients all ask for a fade-in?"
>
> **Nicolas:** "Then it's a feature. It becomes a prop on the **Model Viewer** and a field in the **Content Module**. We raise the ceiling from inside."

## The Viewer Contract (v1)

Five fields, defined **once** in a `model_3d` block. Both `content_3d` and `header_3d` reference that block rather than duplicating fields — one contract, two host models, no hand-syncing.

This mirrors dastro's existing shape exactly: `ContentVideoPlayerRecord` does not own video fields, it references a separate `VideoRecord` via a shared `...VideoPlayer` fragment.

```graphql
fragment ModelViewer on Model3dRecord { ... }          # the Viewer Contract, defined once

fragment Content3d on Content3dRecord { viewer { ...ModelViewer } caption ... }
fragment Header3d  on Header3dRecord  { viewer { ...ModelViewer } title ... }
```

These `api_key`s are effectively permanent — there is no migration tooling and the schema is copied per project, so a rename means hand-editing every client's Dato project and every fragment. Adding a field later is additive and safe; renaming one is not.

| `api_key` | Type | Notes |
|---|---|---|
| `model` | file | glb only, **Size Budget** validation |
| `poster` | image | goes through imgix; also the no-WebGL fallback |
| `load_trigger` | select | `approach` \| `click` |
| `auto_rotate` | boolean | suppressed under `prefers-reduced-motion` |
| `environment` | select | `studio` \| `neutral` \| `dark` |
| `view_label` | string | click-to-load button text; default `View in 3D` |

Exposure and camera framing are **Model Viewer** defaults, not editor knobs — fewer permanent `api_key`s, and fewer ways for an editor to make a model look bad.

`stripStega(data.model.url)` is mandatory. Draft mode injects invisible characters into every Dato string, and an un-stripped URL will fail to fetch. The boilerplate already does this for other fields (e.g. `ContentMediaAsset` on `data.assetSize`).

## Where things live

| Repo | Ships | Reaches existing projects? |
|---|---|---|
| **dastro-3d** | **Model Viewer**, three.js engine, decoders, **Viewer Contract**, **Recipe** | Yes — npm version bump |
| **astro-boilerplate** | `Content3d.astro`, `Header3d.astro`, `.gql` fragments, registration — live by default, deleted by projects that don't sell 3D | No — clone-once, `radar` is only a dashboard |
| **reference Dato project** | `content_3d` / `header_3d` models incl. **Size Budget** validation | No — copied per new project |

Because the boilerplate never syncs, the **Recipe** is the only path into an existing client site.

## Flagged ambiguities

- **"Content.3D"** was used to name the component. Resolved: `Content.3D` is only the rendered `data-module` attribute value (dastro's `Module.astro` derives it from `__typename`). The **Content Module** file is `Content3d.astro`; the record type is `Content3dRecord`.
- **"3D module"** was used to mean both the **Content Module** and the **Model Viewer**. Resolved: these are distinct and live in different repos.
- **"custom work"** was initially cited as a reason to expose three.js internals, while simultaneously being declared out of scope. Resolved: **Bespoke 3D** does not consume this package, therefore no escape hatch ships.
