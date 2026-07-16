---
status: accepted
---

# No compression pipeline; editors compress, DatoCMS enforces a Size Budget

There is no server-side glb optimization anywhere in this system. Editors apply a documented **Export Preset** before upload, and a file-size validation on the DatoCMS asset field enforces the **Size Budget** — an oversized upload is rejected in the CMS UI rather than discovered on a phone in production. dastro-3d ships the meshopt decoder so compressed models load, and nothing more.

## The Export Preset targets meshopt, not Draco

`gltf-transform optimize --compress meshopt --texture-compress webp`. Draco is not supported.

Draco wins on geometry ratios, but `DRACOLoader` fetches ~200KB of decoder files (`draco_decoder.wasm` + loader) from a URL at runtime — and a **Sealed** package (ADR-0001) cannot install anything into the consuming project's `public/`. Every way out is worse: a public CDN adds a third-party runtime request and a GDPR surface for Swiss clients; having the **Recipe** copy decoder files into `public/` makes the package depend on project-side files, where a missed copy is a runtime crash.

`MeshoptDecoder` is ~25KB of plain importable JS. It bundles into the **Viewer Chunk** with nothing to host and nothing to configure, and decodes faster. At 25KB — roughly 1.5% of the three.js chunk it rides in — it is not worth loading conditionally, even though a small **Model** (an 8KB glb is realistic) needs no decoder at all. It is always bundled.

Adding Draco later is additive and non-breaking. Supporting both from the start would inherit Draco's hosting problem without skipping any of the hard part, so meshopt-only is the reversible starting position.

## Why this is not the obvious choice

DatoCMS does the heavy lifting for every other media type, so a reader will reasonably assume it does for 3D too. It does not:

| Type | Dato returns | Processing |
|---|---|---|
| Image | `responsiveImage { … }` | imgix — resize, webp, blurhash |
| Video | `mp4Url(res: high\|medium\|low)` | Mux — transcodes 3 resolutions |
| **glb** | `url`, `size`, `mimeType` | **none** |

There is no `res: low` for models. No LOD, no transcode, no compression. Dato serves the glb byte-for-byte.

## Considered options

- **Build-time compression** — ruled out by architecture, not preference. The adapter is `dastroAdapterConfig()` (SSR on Netlify); editors publish through cache invalidation, not rebuilds, so a build step can never see a newly uploaded model.
- **Runtime edge transform** (Netlify function compresses on first request, caches on CDN) — an 80MB glb through Draco encode in a lambda hits memory and timeout limits; likely OOM, and the first visitor pays.
- **Ingest-time service** (Dato upload webhook → compress → write back via CMA) — the best editor experience, and the right answer if 3D volume ever justifies it. Rejected for v1 because it turns a package into a hosted SaaS someone must run and bill for.

## Consequences

Compression quality rests on humans following the **Export Preset**. The CMS-side **Size Budget** is the only hard guardrail, so it must be configured on the asset field in every project — it is per-project Dato state, invisible in this repo. If it is missing, nothing stops an 80MB upload.
