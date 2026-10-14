# Body Morph 3D

Pose and reshape a 3D character in the browser. First model: a cat.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

Requires Node 20.19+ or 22.12+.

## Controls

| Action | Input |
| --- | --- |
| Rotate camera | Left-drag |
| Zoom | Scroll / pinch |
| Select a joint | Click a blue joint marker |
| Move selected joint | `W` `A` `S` `D` (relative to the camera) |
| Move up / down | `↑` / `↓` |
| Move faster | Hold `Shift` |
| Deselect | `Esc` |
| Reshape a body part | Sliders in the right-hand panel (double-click a label to reset one) |
| Reset | **Reset pose** / **Reset shape** buttons |

Moving a joint moves everything attached to it (children follow); the limbs stretch to stay connected.

## Scripts

`npm run dev` · `npm run build` · `npm run typecheck` · `npm test`

## The cat model

The v1 cat is a **procedural rigged cat** (joints + ellipsoid/cone parts + shape sliders) defined in [`src/models/cat.ts`](src/models/cat.ts). It is not based on a downloaded asset yet – see issue #1 for why and the follow-up plan to import a CC0/CC-BY rigged `.glb`.

See [`CLAUDE.md`](CLAUDE.md) for architecture and contribution workflow.

## License

See [LICENSE](LICENSE).
