# Response format

- Start every answer with a 1–2 sentence summary that directly answers the question.
- Put details, steps, and explanations after it.

# About this project

- Body Morph 3D: a browser app to pose and reshape a 3D character live. First model: a cat.
- Mouse: drag to orbit, scroll to zoom.
- Click a joint to select it; Shift/Ctrl/Cmd+click adds or removes one. Move the selection with W/A/S/D (camera-relative, ground plane) and ↑/↓ (vertical). Shift = faster, Esc = deselect all. Children follow.
- Right-hand panel: one slider per body-part dimension (head, ears, neck, leg width, tail, ...).
- Stack: TypeScript (strict) + Vite + three.js + Vitest. Plain DOM panel, no UI framework. Keep dependencies minimal.
- Everything is bundled via npm. No CDN scripts.
- Static site: `npm run build` outputs `dist/`. Deployed to GitHub Pages by `.github/workflows/deploy.yaml`.
- Run: `npm install`, `npm run dev`.

# Checks (run before reporting done)

- Typecheck: `npm run typecheck`
- Unit tests: `npm test`
- Production build: `npm run build`
- For UI changes, also drive the app in a browser (Playwright/Chromium) and look at a screenshot.
- Headless Chromium needs software GL: `--use-angle=swiftshader --use-gl=angle --enable-unsafe-swiftshader`.
- Report each result; show the failures if any check fails.
- CI: `unit_test.yaml` runs the tests on every PR and every push to main (merges included). `ci.yml` runs typecheck + build.

# Architecture

- `src/core/`: pure TypeScript, **no three.js, no DOM**, so it is unit-testable in node.
  - `types.ts`: `ModelDef`, `JointDef`, parts, sliders.
  - `vec.ts`: vector maths.
  - `rig.ts`: `solveJoints` (shape + pose → joint positions), grounding, validation.
  - `parts.ts`: `partTransform` (segment/blob → position, axes, scale).
  - `skin.ts`: smooth union of the parts ("muscles") → one mesh (surface nets).
  - `fur.ts`: hairs scattered on the parts, rooted on the skin.
- `src/models/`: one file per character, declarative data (`cat.ts`). Adding a character = adding a file here.
- `src/viewer/Viewer.ts`: three.js scene, OrbitControls, joint picking, keyboard posing. Model-agnostic.
  - `SkinMesh.ts`, `FurMesh.ts`: skin mesh and instanced hairs.
- `src/ui/panel.ts`: right-hand slider panel (plain DOM). Model-agnostic.
- `src/main.ts`: wires model, viewer, panel and HUD.
- `tests/`: Vitest tests for `src/core` and `src/models`. New logic there needs a test.

# Model rules

- Shape and pose are separate state: `ShapeParams` (slider id → multiplier, 1 = default) and `Pose` (joint id → offset in model space). Changing one never resets the other.
- Sliders are multipliers (step 0.01, default 1). Joint `scale()` sets lengths, part `radii()` sets thickness. Left/right share one slider.
- `solveJoints` lifts the model so `groundJoints` rest on y = 0 for the shape only. Pose is applied after and never re-grounds.
- Units: metres, +Y up, +Z forward, ground at y = 0.
- The viewer scales the body by `sizeParam`. Divide world-space input by that scale before storing it in the pose.
- Joint markers draw on top and are picked by distance to the pointer ray. A press selects only if the pointer moved < 5 px.
- Skin (`ModelDef.skin`) and fur (`ModelDef.fur`) are slider-driven too (smoothness, thickness; density, length, strand thickness, messiness).
- Parts with `skin: false` (eyes, nose) stay separate meshes and bare; keep them proud of the head surface.
- Skin/fur rebuild coarse while changing, full detail after ~160 ms idle. Keep `src/core` fast (no per-frame allocations in hot loops).
- Arrow keys must keep moving the joint after a slider was used (sliders blur on pointer-up and on key press).

# Assets and licensing

- Third-party models/textures must be CC0 or CC-BY (redistributable). Put them in `public/models/`.
- Credit each in `public/models/CREDITS.md`: source URL, author, license. Never commit one with an unknown license.
- The v1 cat is procedural. Replacing it with a rigged `.glb` is follow-up work: map glTF bones onto `JointDef`s, don't fork the viewer.

# Working on a big story or epic

When a story/epic has several sub-issues:

1. Create a feature branch for the epic (see "Branch naming").
2. Make at least one commit per sub-issue.
3. Test the work and check the code.
4. QA carefully and fix the bugs found.
5. Create a PR for the user to review.

# Merge conflicts

- Before pushing or QA-ing a PR, check it against the latest main: `git fetch origin main`, then `git merge-tree --write-tree origin/main HEAD`.
- If it conflicts (or is behind main), rebase onto main: `git rebase origin/main`, resolve, then `git push --force-with-lease`.
- Re-run the checks after the rebase.

# Branch naming

- Use a type prefix: `feature/`, `bug/`, `refactor/`.
- Then the issue number (if any) and a short kebab-case description, e.g. `feature/1-cat-pose-and-shape-editor`.
- Never use auto-generated names like `claude/modest-fayman-ahuz4`.

# Pull requests

- Every change starts from a GitHub issue.
- PR targets `main` and links the ticket with `Closes #<n>`.
- PR body: summary, how it was verified, known limitations.
- Never commit `node_modules/`, `dist/`, or secrets.

# Code structure

- If understanding or changing something means digging through many layers of files, treat it as a sign the code needs refactoring.
- Point it out and suggest a refactor (e.g. a `refactor/` branch) rather than adding another layer on top.

# Writing this file

- Keep CLAUDE.md short, simple, and concise.
- Use point form; no long paragraphs.
