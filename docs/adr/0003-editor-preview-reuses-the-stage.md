---
status: proposed
---

# Editor preview reuses the Stage, it does not reimplement it

## Status

Proposed — 2026-09-08

Supersedes nothing. Amends the scope boundary set in ADR-0001.

## Context

DatoCMS stores `.glb` uploads as generic binaries. Every 3D asset in the
Boilerplate project reports `is_image: false`, `blurhash: null`,
`thumbhash: null`, `width: null`, `height: null`. There is no derived
preview of any kind, and none is coming — imgix does not transform
geometry and Mux does not touch it.

The practical consequence is that an editor filling a **Model 3D** block
sees a filename. Nothing else. They cannot tell whether the model is
oriented correctly, whether `zoom: 1` frames it sensibly, whether the
`dark` environment renders their matte black product as a silhouette, or
whether the upload is even the file they meant. The schema already
compensates for this: `poster` is `required` in every generation of the
block. That required field is a manual workaround for a missing preview,
and it costs an editor a screenshot round-trip per model.

A DatoCMS plugin can close this. The question this ADR answers is not
whether to build one, but **where the Three.js code comes from** when it
does.

Three facts constrain the answer:

1. `ModelStage` (`src/client/stage.client.ts`, ~215 lines) is already
   framework-agnostic. It owns the entire scene lifecycle — renderer,
   camera, PMREM/`RoomEnvironment` lighting, the three hardcoded
   environment presets, `OrbitControls`, `GLTFLoader` + `MeshoptDecoder`,
   bounding-sphere auto-framing, and `dispose()`. Its constructor is
   `(canvas: HTMLCanvasElement, options: StageOptions)`, and no Astro,
   Dastro or DatoCMS value is reachable from it at runtime.

   Its *type* graph was another matter. It imported `ModelEnvironment`
   from `components/component.types.ts`, whose first line imports
   `AstroBuiltinAttributes` from `astro`. `import type` is erased at
   runtime, but because the package has no build step the consumer
   typechecks our raw `.ts` itself — so that one line made `astro` a
   hard requirement of the engine. The pure vocabulary now lives in
   `client/stage.types.ts`, which imports nothing, and
   `component.types.ts` re-exports it.

2. The package has no build step. `exports` maps a single subpath
   (`./components`) directly at `./src/components/index.ts`, and the
   consuming project's Astro toolchain compiles the raw `.ts`/`.astro`
   source. A plain Vite/React app cannot use that entry point, because
   resolving it pulls in `.astro` files it has no compiler for.

3. Installing `dastro-3d` today also imposes its package-wide peer
   dependencies: `astro ^6.3.5 || ^7.0.0`, `@datocms/astro ^0.6.12`, and
   `dastro ^2.1.5 || ^3.0.0` — the last resolving to
   `git+ssh://git@github.com/gridonic/dastro.git`, so installing it at
   all requires SSH access to a private repo. A DatoCMS plugin needs
   none of the three, and npm 7+ will attempt to install them
   automatically.

ADR-0001 sealed the viewer: `scene`, `renderer` and `camera` are never
exposed, and `three` stays a plain `dependency` rather than a
`peerDependency`, so no consumer can end up with two copies of Three.js
and broken `instanceof` checks. A naive reading of that ADR forbids
exporting `ModelStage` at all. That reading is wrong, and this ADR says
so explicitly rather than leaving the ambiguity for a future argument.

## Decision

**Publish a second entry point, `dastro-3d/stage`, that exports the
`ModelStage` class and the small pure types and parsers it depends on.
Build the DatoCMS preview plugin as a separate repository that consumes
that entry point.**

Specifically:

- `exports` gains `"./stage": "./src/client/stage.client.ts"`. The
  existing `"./components"` entry is unchanged.
- The exported surface is `ModelStage`, `StageOptions`,
  `ModelEnvironment`, `LoadTrigger`, `parseEnvironment`,
  `parseLoadTrigger`. Nothing else. `StageOptions` was not previously
  exported, and the types and parsers are re-exported from
  `stage.client.ts`, so the one entry file above covers the whole
  surface without a barrel.
- `scene`, `renderer` and `camera` remain private. ADR-0001 holds in
  full. What is exported is a class with a `load()/start()/stop()/
  dispose()` lifecycle, not a Three.js handle.
- `ModelStage` gains `setEnvironment`, `setBackgroundColor` and
  `setZoom` beside the existing `setAutoRotate`, so a preview can follow
  an editor's field changes without being torn down and rebuilt. All of
  them are cheap: the PMREM irradiance map is built from
  `RoomEnvironment` and is identical across the three presets — they
  differ only in background, exposure and intensity — so no setter
  regenerates it, and `setZoom` re-places the camera from a radius
  cached at load rather than re-reading the glb.
- `three` remains a plain `dependency`. **The plugin must not declare
  `three` in its own dependencies**, so exactly one copy is bundled,
  reached through `dastro-3d`. `@types/three` moves from
  `devDependencies` to `dependencies`: `three` ships no types of its
  own, and a package that ships raw `.ts` makes its dependencies' types
  part of its own contract.
- `astro`, `@datocms/astro` and `dastro` move to
  `peerDependenciesMeta: { optional: true }`. Every Astro consumer
  already has all three installed by virtue of being an Astro/Dastro
  project, so nothing real is lost, and the plugin stops being forced to
  resolve a private GitHub repo it will never import.
- The same three are added to `devDependencies`. They were previously
  installed here *only* as a side effect of being non-optional peers,
  so making them optional stops `npm run astro:check` — the repo's one
  quality gate — from being able to run at all.
- The plugin registers as a **field addon on the `model` file field**,
  rendering below the stock file picker rather than replacing it. The
  picker keeps working exactly as editors already know it.
- **Scope for v1 is `model3d` in the Boilerplate project (119249),
  primary environment, only.** Field-path resolution is configurable via
  plugin parameters so the other generations can be added later.

### Why exporting the Stage does not break the seal

ADR-0001 protects two things: that consumers cannot reach into the
render loop, and that `three` cannot be duplicated in a bundle. Neither
is threatened here.

The plugin is a first-party surface inside the same product boundary,
not a third-party consumer building a bespoke scene. It receives the
same sealed object an Astro page receives — a stage it can load, start,
stop and dispose, with no access to the internals. And because `three`
stays a plain dependency reached transitively, there is still exactly
one copy.

The seal is about *what* is exposed, not *how many entry points* expose
it.

### Why the preview will be faithful

DatoCMS serves `.glb` byte-for-byte. There is no imgix step, no Mux
step, no server-side optimization anywhere in the pipeline — ADR-0002
established this deliberately, pushing compression onto editors via the
export preset. Uploads are public and unsigned
(`https://www.datocms-assets.com/119249/…glb`) with correct
`model/gltf-binary` MIME.

Same file plus same `ModelStage` plus same settings therefore yields the
same pixels. This is the property that makes the plugin worth building
at all: a preview that can diverge from production is worse than no
preview, and here divergence is structurally impossible.

### What has been verified

`npm pack` plus a throwaway TypeScript consumer — no `astro`, no
`dastro`, no `three` of its own — typechecks `dastro-3d/stage` cleanly,
resolves `three` and `@types/three` transitively, and installs without
touching the private repo.

The same probe importing `dastro-3d/components` fails with `Cannot find
module 'astro'` at `component.types.ts:1`. That is precisely what
`./stage` would have done before the type split, and precisely what a
check on installing rather than typechecking would have missed.

Still outstanding: nothing here proves a `.glb` *renders* outside Astro.
The entry point resolves and typechecks; the runtime spike is separate.

## Consequences

### Good

- Editors see their model, framed and lit as the site will frame and
  light it, before publishing.
- The three environment presets stop being blind guesses. `studio`,
  `neutral` and `dark` are hardcoded `{ background, exposure, intensity }`
  triples generated in code via PMREM over `RoomEnvironment` — there is
  no HDRI file to inspect and no way to reason about them from the field
  label alone.
- Two settings discrepancies become visible rather than latent. The CMS
  default for `zoom` is `1`, while the code fallback (`FRAMING_MARGIN`)
  is `1.25`; `Model3d.astro` resolves `autoRotate` as
  `data.autoRotate ?? false` while both the CMS field default and
  `docs/install.instruction.md` say `true`. A live preview surfaces
  these immediately.
- `dastro-3d` gains its first proof that the engine runs outside a full
  Astro build. The repo currently has no tests, no CI, no Storybook and
  no demo page, so this has never been demonstrated.
- Gridonic gains a deployed custom-plugin path. The only existing
  first-party plugin ("Block Helper Text", SDK v2, installed in six
  projects) points at `http://localhost:5173` and is not wired to any
  field in any project. The SDK-v2 pattern exists; the hosting and
  install path does not.

### Bad, or at least costly

- A second entry point is a second public surface to keep working. It
  must be covered by whatever test and CI setup the package eventually
  gets — which today is none.
- `peerDependenciesMeta.optional` weakens the install-time guardrail for
  Astro consumers. The recipe in `docs/install.instruction.md` becomes
  the place that guarantees those packages are present, rather than npm.
- The plugin inherits a version drift that sits one level down.
  `dastro-3d` itself accepts `astro ^6.3.5 || ^7.0.0`; it is
  `dastro@2.1.5` that pins `astro ^6.3.5`, while `astro-boilerplate` is
  on `^7.1.6` and `dastro` v3.0.0 is tagged. This repo develops against
  the 6.x/dastro-2.1.5 pair. That is a separate problem, but the plugin
  makes it more expensive to keep ignoring.
- Reading sibling settings inside a nested block is the fiddly part. The
  values live at `content3d → viewer → model3d`, reached via
  `ctx.formValues` and `ctx.fieldPath`. A file field's form value is
  `{ upload_id, alt, title, … }` and not a URL, so resolving the asset
  requires the `currentUserAccessToken` permission and a CMA call —
  declared in the manifest up front.
- `normalizeBackgroundColor()` lives in `Model3d.astro`, the one file
  with zero reuse value. Its ~10 lines must be reimplemented in the
  plugin, and `background_color` arrives as a colour object rather than
  a CSS string.

### Neutral

- The entire `stripStega()` layer drops away. It exists for draft-mode
  CDA reads; a plugin reads raw form values and never encounters stega
  characters.
- `model-viewer.client.ts` (~150 lines) is not reused. Its decisions —
  WebGL feature detection, approach-versus-click triggering, pausing
  offscreen, `prefers-reduced-motion` — are all worth reproducing, but
  it extends Dastro's `BaseComponent` and must be rewritten as a React
  hook. The logic ports; the glue does not.
- `rotate-cursor.client.ts` is reusable with one `log.debug` swap, but
  is not needed for v1.

## Alternatives considered

**Vendor a copy of `stage.client.ts` into the plugin repo.** Fastest
path, no changes to `dastro-3d` at all. Rejected: it creates two copies
of the engine that will silently diverge on the first bug fix. This is
precisely the duplication pattern documented in
`gridonic-playground/PLAN.md` — "a bug fix in one doesn't propagate" —
and reproducing it in a package whose entire purpose is consolidation
would be self-defeating.

**Extract the engine into a third package, `dastro-3d-stage`.**
Architecturally tidiest: no peer-dependency contortions, a clean
non-Astro package with `three` as its only dependency. Rejected for now
as premature. It triples the release surface (engine, Astro wrapper,
plugin) for two consumers, and the `peerDependenciesMeta` route achieves
the same result with one line. Revisit if a third non-Astro consumer
appears.

**A field editor replacing the file picker, rather than an addon.**
Rejected: it forces the plugin to reimplement upload, replace and remove
interactions that DatoCMS already does well, and it fails closed — if
the plugin URL is unreachable, the editor cannot set the file at all. An
addon degrades to "no preview," which is the status quo.

**Support all three block generations in v1.** Rejected. The schema has
diverged into three incompatible shapes: nested `model3d` with 9 fields
and a 10 MB cap (Boilerplate, 119249); `model_viewer` with 5 fields, an
8 MB cap and a `default` enum value where the Boilerplate has `neutral`
(221906); and flat `content3d` with 5 fields (Gridonic Website 136473,
Everstride Website 221972). Handling all three multiplies the hardest
part of the work — field-path resolution — for no additional proof that
the approach is sound.

**Do nothing; keep relying on the required `poster` field.** This is the
status quo and it functions. Rejected because the poster is generated
*after* the fact, by a person who has already had to guess at the
settings, and it verifies nothing about how the model will actually
render.

## Open questions

- `dispose()` frees geometries, materials, the PMREM target and the
  renderer, but never calls `renderer.forceContextLoss()`. Browsers cap
  live WebGL contexts at around 16, and an editor opening one block
  after another is the first workload that will genuinely test this.
- Exactly how DatoCMS Plugin SDK v2 exposes `formValues` for fields
  nested inside a `single_block` is not verified. If sibling resolution
  proves unreliable, the fallback is to preview the geometry using the
  model file plus plugin-parameter defaults — a "geometry and framing"
  preview without live settings binding. That still delivers most of the
  value and remains a valid v1.
- The 10 MB validator in the Boilerplate versus 8 MB elsewhere is worth
  harmonising, but is out of scope here.
