# Codex Orbit

A quota icon inserted into the Codex desktop navigation rail, immediately above the help/profile footer. The icon occupies normal layout space and restores itself after rail rerenders.

- Outer arc: remaining five-hour quota, or weekly quota when the account has no five-hour window. Four dots always show weekly quota.
- Four bottom dots: weekly quota. One dot turns gray for every fully consumed 25%.
- Center number: the account's available reset count. Hidden at zero or when unknown; clicking only displays details.
- Account data refreshes about once per minute. Unknown values stay unknown; stale data is dimmed.

Adapts MIT code from [jaykinhoo9/codex-usage-badge](https://github.com/jaykinhoo9/codex-usage-badge), pinned to the commit in `third_party/codex-usage-badge/SOURCE.json`. See `THIRD_PARTY_NOTICES.md` for the reused modules and modifications. The upstream updater and Windows installation/startup logic are adapted. Project colors and token statistics are excluded.

This is third-party runtime DOM integration, not an official extension. It does not patch the application's files or signature. Changes to Codex's navigation markup may break placement; the badge hides when it cannot find the rail or detects the upstream badge.

## Install on macOS

Requires macOS 14+, Intel or Apple Silicon, a signed-in Codex desktop app with its bundled CLI, and Node.js 24+. The launcher prefers the app's bundled Node runtime.

1. Extract `CodexOrbit-macOS-0.3.0.zip` and open `安装.command` (Install).
2. Save your work, fully quit Codex using Command-Q, then reopen it normally. Wait 5–10 seconds.
3. Look above the help/profile area in the left navigation rail.

The startup helper only attempts a normal relaunch of a newly launched, frontmost app before input. It leaves existing sessions alone. If the initial launch is skipped, fully quit Codex and use `打开 Codex.command` (Open Codex).

The local debug port is `127.0.0.1:39222`. Other local programs that can access it may control the client; do not expose or forward it. Quit and reopen Codex normally after stopping the helper to close the port. Account data uses the existing CLI login; the tool does not parse credentials or collect chat contents. The startup helper observes app launch/frontmost/input timing, not input contents. Automatic updates check this project’s GitHub Releases every six hours.

`诊断.command` reports installation/service/port status. `停止.command` stops the services. `卸载.command` moves this tool and its launch agents to Trash; quit and reopen Codex afterwards. Files live in `~/Library/Application Support/CodexOrbit`; logs in `~/Library/Logs/CodexOrbit`. Optional environment overrides: `CODEX_ORBIT_APP`, `CODEX_ORBIT_NODE`, and `CODEX_HOME` at installation.

## Build and test

Requires Node 24, Python 3.9+, and Xcode Command Line Tools; no npm dependencies.

```sh
python3 scripts/build.py --native
node --test tests/*.test.js tests/*.test.cjs
python3 -m unittest discover -s tests -p 'test_*.py'
python3 scripts/build_release.py
```

The startup bridge is a universal arm64/x86_64 binary with an ad-hoc signature; the package is not Apple-notarized. For an isolated layout preview, run `python3 -m orbit.server --port 8765` and open `http://127.0.0.1:8765/`. This preview uses the actual injected icon code in a mock rail and does not control Codex.

34 automated tests, the read-only account API, mock-rail placement/rerender recovery and the universal package have been verified. **Final placement in a live Codex window remains unverified:** the automation tool prohibits operating the Codex client. Users must install and reopen the client themselves. See `VERIFICATION.md`.

## Publish

MIT licensed, with upstream attribution retained. Push this source repository to GitHub and attach the generated macOS ZIP and `dist/SHA256SUMS.txt` to a Release. Source and platform downloads are published at https://github.com/y2675632584-hub/codex-orbit. Release packaging uses an explicit allowlist and excludes personal settings, logs, quota snapshots and reference images.

## Updates and Windows

macOS updates require a newer matching Release with a GitHub SHA-256 asset digest. The archive, every file, platform, version and paths are validated before staging. The installer verifies the new background processes and restores the previous directory and service configuration on failure; successful upgrades retain an old-version backup. Existing Codex sessions are not restarted by updates. SHA-256 verifies integrity, not an independent publisher signature.

Windows 10/11 users can extract `CodexOrbit-Windows-0.3.0.zip` and run `Install.cmd`. The package adapts upstream Store discovery, guarded native relaunch, owned-directory installation, update checks and rollback. Use `Launch.cmd`, `Status.cmd`, `Update.cmd`, and `Uninstall.cmd` for management. Windows uses Node 24 and Windows PowerShell 5.1+. Its native installation and live client placement still require Windows validation; Windows CI has passed script parsing, native helper compilation and archive validation; live Codex compatibility still requires user verification.

The configured repository is `y2675632584-hub/codex-orbit`. Publish tags `vVERSION-macos` and `vVERSION-windows`, with the corresponding ZIP and `SHA256SUMS.txt`. Platform-tag workflows build, test and publish downloads.
