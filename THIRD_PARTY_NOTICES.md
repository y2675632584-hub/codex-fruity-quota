# Third-party notices

Codex 果味额度条 includes and adapts code from
[jaykinhoo9/codex-usage-badge](https://github.com/jaykinhoo9/codex-usage-badge),
commit `d014efcd7735a4349576c6b424cac23b614f9115` (MIT).

Copyright (c) 2026 Codex Usage Badge contributors.
The full upstream license is retained at `third_party/codex-usage-badge/LICENSE`.
The pinned source files and SHA-256 hashes are recorded in `third_party/codex-usage-badge/SOURCE.json`.

Reused parts:

- `src/app-server.js`: official App Server RPC transport and lifecycle.
- `src/rate-limits.js`: quota snapshots and incremental notification merging.
- `src/resolve.js`: desktop-bundled CLI discovery.
- `src/cdp.js`: loopback renderer connection and reconnect handling.
- `macos/startup/controller.cjs`, `watch.cjs`, `bridge.m`: app launch detection and guarded normal reopening.
- `src/injected-ui.js` placement logic is adapted into Orbit's own `src/injected-orbit.js`: a sibling is inserted before the navigation rail's help/profile footer and restored after rerenders.

The vendored files are kept unchanged. `scripts/build.py` checks their recorded hashes and applies these reviewed adaptations to the generated runtime:

1. Inject only Orbit's quota component; omit project colors, file sizes, and chat token features.
2. Rename the renderer namespace from `__codexUsageBadge` to `__codexOrbit`.
3. Identify the App Server client as `codex_orbit` / `Codex 果味额度条`.

Orbit's icon and reset-count handling are original additions. The macOS installer uses its own service names and installation directory. Update validation is adapted for this project’s own GitHub Releases; no installation package is fetched from the upstream repository.

The original source screenshot, upstream promotional image, user reference screenshots, personal usage snapshots, and Codex application binaries are not redistributed.

## 0.3.0 additional adaptations

The same pinned MIT commit supplies updater/core.cjs, windows/manage-windows.ps1, windows/update.cjs, windows/update-windows.ps1, windows/bridge.cjs and the startup Windows controller/PowerShell/C# bridge. scripts/adapt.py preserves the originals under third_party and generates project-specific names, repository metadata, file allowlists and checksums. macOS updater network/archive validation is reused; its installer is this project’s transaction code. Windows ownership checks, Store discovery, native startup guards and rollback are retained, while quota rendering uses Orbit. License files are included in both platform distributions.

No project color or token modules are injected.
