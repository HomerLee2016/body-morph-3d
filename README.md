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
| Add / remove a joint from the selection | `Shift`+click (or `Ctrl`/`⌘`+click) a joint marker |
| Move selected joints | `W` `S` = Z axis, `A` `D` = X axis (world axes, fixed whatever the camera angle); all selected joints move together |
| Move up / down | `↑` / `↓` (Y axis) |
| Move faster | Hold `Shift` |
| Deselect all | `Esc` |
| Reshape a body part | Sliders in the right-hand panel (double-click a label to reset one) |
| Reset | **Reset pose** / **Reset shape** buttons |
| Save / load a config | **Export config** / **Import config** (JSON file with shape and pose) |

Each joint moves on its own; the body parts between joints stretch to follow it.

## Scripts

`npm run dev` · `npm run build` · `npm run typecheck` · `npm test`

## Deploy

Static site: `npm run build` writes `dist/`. `.github/workflows/deploy.yaml` publishes it to GitHub Pages on every push to `main` (merges included), after running the tests.

One-time setup: repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## CI

- `unit_test.yaml`: `npm test` on every pull request and every push to `main`.
- `ci.yml`: typecheck + production build on every pull request and every push to `main`.

## The cat model

The v1 cat is a **procedural rigged cat** (joints + ellipsoid/cone parts + shape sliders) defined in [`src/models/cat.ts`](src/models/cat.ts). It is not based on a downloaded asset yet – see issue #1 for why and the follow-up plan to import a CC0/CC-BY rigged `.glb`.

See [`CLAUDE.md`](CLAUDE.md) for architecture and contribution workflow.

## License

See [LICENSE](LICENSE).
