---
status: accepted
---

# The Model Viewer is sealed; three.js is never public API

dastro-3d ships a **Model Viewer** as a product, not a three.js toolkit. Its `scene`, `renderer`, and `camera` are never exposed, and no `on('ready')`-style escape hatch is provided. **Bespoke 3D** (art-directed work like nussli-website's `ThreeSlider`) is out of scope and does not consume this package — so the only user an escape hatch would serve does not exist.

## Considered options

An escape hatch exposing `scene`/`renderer`/`camera` was the initial preference, on the intuition that a sale might one day need "5% more". Rejected: that 5% is historically a material override, a hotspot, or a scroll trigger — all of which are **props and features**, added from inside where we keep control. Escape hatches don't deliver features; they deliver support tickets.

## Consequences

The decisive consequence is dependency shape:

- **Sealed** → `three` is a plain `dependency`, bundled and invisible. We upgrade three whenever we want. No consumer notices.
- **Exposed** → `three` must become a `peerDependency`. Consumers install their own copy; two copies in one bundle break `instanceof` and silently fail `scene.add(theirMesh)`. Consumers pin a three version, so **every three upgrade becomes our breaking change**. Internals can never be refactored, because someone's handler depends on our scene graph shape.

Adding a hatch later is easy and non-breaking. Removing one is impossible. Ship it only when a paying customer needs it and their use case is known — not before.
