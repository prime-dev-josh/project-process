# Map UX audit and implemented changes

Reviewed `prime-dev-josh/project-process`, branch `dev-josh`, November 3, 2026, with the supplied graph (269 nodes, 314 links, eight groups, enlargement 4). Changes are local and supplied as a patch. No PR, push, deployment, SQL or Terraform changes.

## Ranked findings

Evidence below refers to the original branch source unless marked “updated.”

| Rank | Finding | Evidence and status |
|---|---|---|
| 1 | Idle canvas does not repaint ref-only lasso/drag changes. | Confirmed: `GraphCanvas.tsx:1223–1273` mutates points/engine nodes without waking paint; `:1357` enables auto-pause. Installed `force-graph` also confirms `resumeAnimation()` alone does not dirty an already-running render loop. |
| 2 | Collision radius ignores enlarged discs. | Confirmed: `GraphCanvas.tsx:120` scales visible radius with enlargement; `:619` collision uses only size and level. Supplied graph uses enlargement 4. |
| 3 | Reorg has no node-versus-edge clearance step. | Confirmed: `App.tsx:777–784` only rebuilds/reheats; `GraphCanvas.tsx:599–631` installs link, radial, collision and outsider exclusion forces. `viewSettings.ts:19` allows link distance zero. Disc collision cannot detect an unrelated link passing through a disc. |
| 4 | Slowly drawn lasso may never accumulate a stroke. | Confirmed: `GraphCanvas.tsx:1234–1241` replaces the last point whenever motion since that point is under four screen pixels; this can keep moving the sole starting point. |
| 5 | Dragging an idle graph invokes expensive precise hull construction. | Confirmed: `GraphCanvas.tsx:958` selects cheap hulls only while simulating, not while gesturing. Convex cheap hulls can visually swallow empty space; they are paint geometry, not the cause of physical overlaps. |
| 6 | Interrupted drag can leave temporary pins. | Suspected failure path: normal pointer-up releases `fx/fy` (`GraphCanvas.tsx:1028`, `:1304–1308`), but no pointer-cancel/lost-capture cleanup existed. The attached graph has **zero** pinned nodes, so pins do not explain its saved overlaps. |

Radial attraction is always enabled (`viewSettings.ts:48`, `GraphCanvas.tsx:611–613`), with link strength 0.28. It can compete with chains and group boundaries. At 320 ticks and decay 0.018, alpha is about 0.00299: simply running longer does not supply the missing edge-clearance objective. Link/link crossings are not guaranteed to disappear; arbitrary nonplanar graphs cannot be made crossing-free.

## Fix order and implementation

1. **Live interaction:** keep redraw active using the existing gesture state; resume animation on active pointer moves; preserve the lasso anchor during small movements; release temporary holds on cancellation/lost capture. No new React state on pointer-move, no pointer-coordinate effects, no remount, no photo-cache changes. Cheap hulls now cover gestures too.
2. **Reorg:** use enlargement-aware collision radii and endpoint radii plus a 24-unit air gap plus the selected link-distance spacing. All three link levels remain distinct. Reorg temporarily adds collision padding/iterations and clears stale drag holds. After the ordinary simulation stops, run a finite geometric node/node and node/nonincident-link clearance pass. Work yields every 256 comparisons with a target 4ms frame budget, at most 48 sweeps / 180 frames. Restore ordinary collision settings and persist once after cleanup. Starting a gesture cancels refinement and saves its current result before the gesture. Graph replacement/unmount cancels stale work. This is not an always-on force, and it adds no cohesion springs.
3. **Visual polish — deferred:** first measure large-graph drag/lasso frame times in an authenticated browser. Then tighten temporary hulls around local member regions, soften membrane fills, and review label/arrow legibility. Do not disguise overlap by enlarging membranes or adding perpetual group springs.

The refinement phase uses a boolean React state only at phase boundaries to control redraw. Simulation and per-frame positions remain in refs/live engine nodes. Force 1/2/3 retains the existing memo comparator and does not reheat; only Reorg and Physics-on request full reheating.

## Validation and limits

- TypeScript (`tsc --noEmit`): passed.
- Production client + server build: passed; existing-style >500kB chunk warning remains.
- Actual JSX pointer-handler regression tests with an idle-renderer mock: passed for slow lasso, drag, group move, pan, gesture redraw, idle pause, and no hover-state calls during active gestures.
- Geometry tests: passed for coincident nodes, a node exactly on an edge, pinned nodes, missing endpoints, empty graph, and enlargement.
- Supplied saved positions, cleanup alone: **47 → 0 node/node** and **49 → 6 node/link** overlaps.
- Final full d3 simulation configuration at the supplied middle force levels, including radial and group-exclusion forces, 320 ticks plus cleanup: **0 node/node and 3 node/link overlaps**. Before cleanup that run had 21 node/link overlaps. Alpha reached 0.00299; cleanup is finite.
- Counts use conservative world-space visible disc radii with 0.5-unit tolerance. They do not assess labels/cards or link/link crossings.
- The full numerical run took about 25 seconds on this host; cleanup alone took roughly 0.46 seconds total, split across frames in the UI. These are computational timings, **not a browser FPS benchmark**. Existing group-field work remains a performance concern.
- The deployed site redirected to Duo SSO. Continuous visible ink, cursor tracking, rotation, final hull paint, and **60fps are not browser-verified**. Polish is deferred accordingly.

## Apply and verify

From the target checkout, after reviewing the patch:

```sh
git apply --check project-process-map-fixes.patch
git apply project-process-map-fixes.patch
npm ci
npx tsc --noEmit
npm run build
node scripts/check-interaction.mjs
node scripts/check-layout.mjs '/path/to/project-process-graph (1).json'
node scripts/check-reorg.mjs '/path/to/project-process-graph (1).json'
```

Regression scripts use Node 24 native TypeScript stripping. The test fixture remains your separate attachment and is not embedded in the package. On an authenticated local/staging build, verify lasso and drag while Physics is off, cancellation, group movement, rotated views, one Reorg, and force-level clicks. Record frame times on the 269-node graph and a larger fixture before adding polish.
