# Add 3D to a project

Adds `Content.3D` and `Header.3D` modules, rendering a glb uploaded to DatoCMS.

This is the path for **existing** projects. New projects scaffolded from the current boilerplate already have all of this — delete it if the project isn't selling 3D.

Follow every step in order. Step 2 defines `api_key`s that are effectively permanent: there is no migration tooling and DatoCMS schema is copied per project, so renaming a field later means hand-editing this project's CMS *and* its fragments. Get them right the first time.

---

## 1. Install the package

```bash
npm i github:gridonic/dastro-3d#v0.1.6
```

Requires `dastro` ^2.1.5, `astro` ^6.3.5 and `@datocms/astro` ^0.6.12 — every Dastro project already has them.

---

## 2. Create the DatoCMS schema

Three things: one **block** holding the viewer's fields, and two **models** that reference it. The fields live in the block so `content_3d` and `header_3d` can't drift apart — the same reason `ContentVideoPlayerRecord` references a `VideoRecord` rather than owning video fields itself.

### 2a. Block: `model_3d`

Create a **block** with api_key `model_3d`:

| Field | api_key | Type | Settings |
|---|---|---|---|
| Model | `model` | Single asset | **Required.** Validation → *File size* → max **8 MB**. Validation → *File extension* → `glb` |
| Poster | `poster` | Single asset | **Required.** Image only. Shown until the model loads, and the fallback when WebGL is unavailable |
| Load trigger | `load_trigger` | Single-line string, select dropdown | **Required.** Values: `approach`, `click`. Default `approach` |
| Environment | `environment` | Single-line string, select dropdown | **Required.** Values: `studio`, `neutral`, `dark`. Default `studio` |
| Auto rotate | `auto_rotate` | Boolean | Default `true` |
| View label | `view_label` | Single-line string | Optional. Click-to-load button text. Default in the viewer: `View in 3D` |

> The **8 MB file-size validation is the only hard guardrail** against an editor uploading an 80 MB Blender export. Nothing else in the stack stops it — DatoCMS does no processing on glb whatsoever (no LOD, no compression, no transcode; see ADR-0002). Do not skip it.

Set the Poster field hint to: *"Shown before the 3D model loads, and to visitors without WebGL. Always set alt text."*

### 2b. Models: `content_3d` and `header_3d`

| Model | api_key | Fields |
|---|---|---|
| Content 3D | `content_3d` | `viewer` (single block → `model_3d`, required), `caption` (text, optional) |
| Header 3D | `header_3d` | `viewer` (single block → `model_3d`, required), `title` (single-line string) |

Add both to the modular content field they belong in — `content_3d` to the page's content modules, `header_3d` to its header module.

---

## 3. Add the GraphQL fragments

`src/datocms/data/core/Model3d.gql` — the Viewer Contract, defined once:

```graphql
fragment ModelViewer on Model3dRecord {
  model {
    url
    size
    mimeType
  }
  poster {
    responsiveImage(imgixParams: { fit: crop, auto: format }) {
      ...ResponsiveImage
    }
  }
  loadTrigger
  environment
  autoRotate
  viewLabel
}
```

`src/datocms/data/modules/Content3d.gql`:

```graphql
fragment Content3d on Content3dRecord {
  caption
  viewer {
    ...ModelViewer
  }
}
```

`src/datocms/data/modules/Header3d.gql`:

```graphql
fragment Header3d on Header3dRecord {
  title
  viewer {
    ...ModelViewer
  }
}
```

Then add `...Content3d` and `...Header3d` to the module fragments of every page type that should offer them.

---

## 4. Add the module components

`src/components/content-modules/Content3d.astro`:

```astro
---
import type { Content3dFragment } from '@generated/datocms.types';
import { Model3d } from 'dastro-3d/components';
import { contentLinkAttrs } from 'dastro/components';

interface Props {
  data: Content3dFragment;
}

const { data } = Astro.props;
---

<div class="content-3d -compact-stacking ui-grid">
  <figure class="figure" {...contentLinkAttrs({ source: data.caption })}>
    <Model3d data={data.viewer} aspectRatio={16 / 9} sizes="88vw" />
    {data.caption && <figcaption class="figcaption text-sm">{data.caption}</figcaption>}
  </figure>
</div>

<style lang="scss">
  .content-3d {
    padding-top: var(--module-stacking-gap-half);

    > .figure {
      grid-column: grid-width;
    }

    > .figure > .figcaption {
      margin-top: 1rem;
      color: var(--base-color-foreground-faded);
    }
  }
</style>
```

`src/components/header-modules/Header3d.astro`:

```astro
---
import type { Header3dFragment } from '@generated/datocms.types';
import { Model3d } from 'dastro-3d/components';

interface Props {
  data: Header3dFragment;
}

const { data } = Astro.props;
---

<div class="header-3d ui-grid view-transition-header">
  {data.title && <h1 class="title text-5xl ui-break-words">{data.title}</h1>}
  <Model3d data={data.viewer} class="viewer" sizes="100vw" />
</div>

<style lang="scss">
  .header-3d {
    > .title {
      grid-column: grid-width;
    }

    > .viewer {
      grid-column: full-width;
      height: 70vh;
    }
  }
</style>
```

The wrapper owns the box — grid placement, aspect ratio, height. The package owns the render. This mirrors how `ContentMediaAsset` and `HeaderTextMedia` both wrap the same dastro `MediaAsset`.

---

## 5. Register the modules

In `src/config/modules.config.ts`:

```ts
import Content3d from '@/components/content-modules/Content3d.astro';
import Header3d from '@/components/header-modules/Header3d.astro';

export const moduleComponents = {
  // Header
  Header3dRecord: Header3d,

  // Content
  Content3dRecord: Content3d,
  // …existing entries
} as const satisfies Record<string, AstroComponent>;
```

Miss this step and an editor adding the module gets an orange `No Component registered for Content3dRecord` box on the live site.

---

## 6. Generate types and check

```bash
npm run dato:generate-types
npm run build
```

`dato:generate-types` validates every fragment against the project's live DatoCMS schema. If step 2's api_keys don't match step 3's fragments exactly, it fails here — which is the point.

---

## 7. Brief the editors

Send them [export-preset.md](./export-preset.md). Compression is theirs to do; the 8 MB validation only tells them when they haven't.
