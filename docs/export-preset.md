# Export preset for 3D models

For whoever prepares a model before uploading it to DatoCMS.

**A raw Blender export is not a web model.** 80 MB is a normal export and a dead phone. Target **under 8 MB** — DatoCMS rejects anything larger, because it does no optimization of its own: unlike images (imgix) and video (Mux), a glb is served byte-for-byte exactly as uploaded.

Smaller is better. 2–3 MB is a good model. 8 MB is the ceiling, not the goal.

## One command

```bash
npx @gltf-transform/cli optimize input.glb output.glb \
  --compress meshopt \
  --texture-compress webp
```

That usually takes a 40–80 MB export to 2–5 MB. Check the result before uploading:

```bash
npx @gltf-transform/cli inspect output.glb
```

## Rules

- **meshopt, not Draco.** The viewer only decodes meshopt. A Draco-compressed glb will fail to load (see ADR-0002).
- **Textures dominate.** A 4096×4096 texture is ~64× the pixels of 512×512. Resize before you compress: `--texture-size 2048`. Most product models don't need more.
- **Delete what isn't seen.** Interior geometry, backfaces, unused UV maps and materials all ship if you leave them in.
- **Apply modifiers and limit polygons.** Subdivision surfaces explode file size. Decimate before export.
- **Y-up, metres, centred at origin.** The viewer frames the model automatically from its bounding box, so a model 500 units off-origin still works — but scale sanity keeps lighting predictable.

## Poster

Every model needs a poster image. It's what visitors see before the model loads, what visitors without WebGL see instead, and what they see if the model fails.

Render it from the same angle the viewer opens at: front-on, slightly above. A poster that doesn't match the model is worse than none.

## Checklist

- [ ] Under 8 MB, ideally under 3
- [ ] meshopt-compressed, webp textures
- [ ] Textures no larger than 2048px
- [ ] Opens correctly in [gltf-viewer.donmccurdy.com](https://gltf-viewer.donmccurdy.com/)
- [ ] Poster rendered, uploaded, with alt text
