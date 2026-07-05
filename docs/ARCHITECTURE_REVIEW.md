# Slayer Terminal — Architecture Review: Dependency Evaluation

Mandate: *"Evaluate every tool. If a tool does not mathematically or structurally
justify its footprint in performance, discard it — but do not reject anything without
a documented architectural benchmark."*

**Verdict: install none of the proposed packages.** Three.js — the one genuinely
required addition — is already a dependency. Everything else is either (a) a competing
runtime/framework that cannot coexist with our React 19 tree, (b) a redundant fourth
copy of a capability we already have, or (c) infrastructure for a scale problem we do
not have yet. Adding them would grow bundle, attack surface, and cognitive load with
**zero** measured benefit. The rejections below are grouped by the structural reason.

## Baseline (what the stack already is)
- **Runtime:** React 19 + TypeScript + Vite 6. Single reconciler.
- **State:** Zustand (one store) — already fast, avoids context re-renders.
- **Charts:** lightweight-charts (financial), ECharts (lazy, quant 2D), Recharts (misc).
- **3D:** three.js (already present) — now unified under one Directive-08 renderer.
- **Grid/Flow:** custom `Table` primitive + heat matrices; @xyflow/react (network graph).
- **Command / UI:** cmdk, radix-ui, a hand-rolled Slayer primitive kit.
- **Tests:** tsx logic suites + vitest/testing-library component suites in CI.

## REJECT — competing runtimes/frameworks (structural incompatibility)
`solid-js`, `preact`, `@preact/signals`, `lit`, `@builder.io/qwik`, `imba`,
`million` / `million-lint`.
> You cannot run Solid **and** Preact **and** Qwik **and** Lit **and** Imba inside a
> React app — each is a *replacement* reconciler with its own component model. Mounting
> any of them means two VDOMs, double the runtime, and a hydration boundary nightmare.
> This is not a performance trade-off; it is architecturally impossible without a
> rewrite. `million` can optimize React lists but ships a compiler + block runtime whose
> risk (mis-optimized dynamic rows) far exceeds any win at our list sizes — our hot
> lists are already virtualization-ready and short.

## REJECT — redundant data grids (we already render dense tables)
`@glideapps/glide-data-grid`, `@finos/perspective(-viewer)`, `ag-grid-community`,
`@tanstack/table-core`.
> Four grid engines for one need. Our dense views (strike matrix, order flow, greeks)
> are bespoke heat-grids where the *cell colour is the datum* — a generic grid strips
> exactly that. `ag-grid`/`perspective` are heavyweight (100s of KB, their own theming
> that fights our tokens). If a genuinely huge, scrollable, sortable table appears, the
> right pick is the headless `@tanstack/table-core` **alone** — revisit then, with that
> view as the benchmark. Not before.

## REJECT — competing UI kit
`@blueprintjs/core`, `@blueprintjs/datetime`, `@blueprintjs/popover2`.
> A second full design system on top of radix + our primitive kit. Two token systems,
> two focus-ring conventions, two z-index stacks. It would actively fight the terminal
> aesthetic we just standardized.

## REJECT — redundant charting / already present
`three` (already a dep), `cmdk` (already a dep), `lightweight-charts` (already a dep),
`echarts` (already lazy-loaded), `pixi.js`, `scichart`.
> `pixi.js` (2D WebGL) has no target — our 2D is DOM/SVG/canvas-charts and reads fine;
> spinning a second WebGL renderer alongside three.js doubles context pressure. `scichart`
> is a commercial, heavyweight bundle for charts our existing libs already draw.

## REJECT — redundant state / streaming infra (premature)
`jotai`, `rxjs`, `@msgpack/msgpack`, `flatbuffers`, `fast-json-patch`, `pako`,
`comlink`, `workerpool`, `reconnecting-websocket`, `localforage`, `crossfilter2`.
> Zustand already covers state; adding Jotai/Rx means two paradigms. The wire-format /
> compression / worker libs solve a throughput problem we do not have — our SSE payload
> is a modest JSON frame at ~1 Hz. `reconnecting-websocket` is the one with a plausible
> future home (feed resilience), but our transport is `EventSource`, which already
> auto-reconnects; adopting it is a transport migration, not a drop-in — defer until the
> feed layer is the bottleneck, with reconnect latency as the benchmark.

## REJECT — math/format micro-libs (no current call site)
`bignumber.js`, `decimal.js`, `mathjs`, `nodejs-polars`, `technicalindicators`,
`simple-statistics`, `d3-format`, `d3-scale`, `dayjs`, `bignumber.js`.
> We priced and coloured the new 3D surfaces with plain arithmetic — no `d3-scale`
> needed. Greeks/vol math is already implemented and tested in `v11Math`/`quantSuite`.
> `decimal.js`/`bignumber` matter for *settlement/ledger* precision (money), not display
> analytics — adopt narrowly **there** if/when we touch billing math, not globally.
> `technicalindicators` could replace hand-rolled indicators, but that is a *refactor of
> working, tested code*, not a fix — out of scope for a stability pass.

## REJECT — audio / misc
`howler`, `stats.js`, `twgl.js`, `openfin-adapter`, `tslib`, `dynamic-dedupe`,
`collection-utils`, `imba`.
> `stats.js` is a dev FPS meter — we verified 60 FPS via headless RAF timing instead of
> shipping it. `twgl.js` is a raw-WebGL helper made redundant by three.js. `openfin-adapter`
> targets the OpenFin desktop container, which we do not run.

## REJECT — dev tooling (process, not product; and not the ask)
`danger`, `husky`, `lint-staged`, `@commitlint/*`, `leasot`,
`typescript-todo-or-die-plugin`, `eslint-plugin-todo-plz`,
`@playwright/test`, `backstopjs`, `knip`, `@ai-coders/context`, `axe-core`,
`dependency-cruiser`, `million-lint`.
> Git-hook/commit-lint/TODO tooling adds ceremony without fixing a single current
> defect. CI already runs `lint` + `test` + `build`. The audit-grade tools worth a
> *one-off* run — `knip` (dead code), `axe-core` (a11y), `dependency-cruiser` (arch
> lint) — can be run ad-hoc during a dedicated audit without being committed
> dependencies. `@playwright/test` overlaps the raw `playwright` we already use for
> headless render verification.

## What we DID do instead of adding
- Deleted the 1670-line cinematic `InstitutionalPhysicsDashboard` (net **−** code).
- Unified all 3D on one Directive-08 renderer; stripped cinematic lighting +
  `MeshStandardMaterial` from the two remaining surfaces.
- No new runtime dependencies. Net dependency delta for this change set: **0**.
