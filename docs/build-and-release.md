# Build, release, and platforms

Everything runs from `src/` (see the layout note in [README.md](README.md)).

## Prerequisites

- Node.js (CI uses 20).
- Rust toolchain, recent stable. Edition 2024 requires Rust >= 1.85.
- Windows: MSVC build tools; the app uses WebView2 (present on Win 11, installed by the NSIS/MSI otherwise).
- Linux: WebKitGTK 4.1 dev stack (see the apt list below).

## Dev and verify

```sh
cd src
npm ci
npm run tauri dev      # HMR dev app
npm run check          # svelte-check + tsc; expect 0 errors / 0 warnings
```

Backend-only: `cd src/src-tauri && cargo check`. If the Rust toolchain is not on PATH in your shell, prepend it (PowerShell: `$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"`).

Verification expectations after a change:
- Frontend: `npm run check` clean, and it HMRs into a running `npm run tauri dev`.
- Backend: `cargo check` clean. A cfg-gated Linux block (e.g. in `main.rs`) is only compiled on Linux, so Windows `cargo check` will not fully type-check it; the CI Linux leg does.

## Build

```sh
npm run tauri build
```

`tauri.conf.json` uses `"bundle": { "targets": "all" }`, so each OS produces its own bundles: Windows -> NSIS `*-setup.exe` + `*.msi` (plus the raw `ion-screen-capture.exe`); Linux -> `.deb` + `.rpm` + `.AppImage`. Output under `src/src-tauri/target/release/bundle/`.

## Versioning

Keep the version identical in all three files, because the release tag is derived from `tauri.conf.json`:
- `src/src-tauri/tauri.conf.json` (`version`) - the source of the CI tag.
- `src/src-tauri/Cargo.toml` (`version`).
- `src/package.json` (`version`).

Tag/publish flow: bump the three, commit, then push a tag `vX.Y.Z` (or run the workflow manually).

## CI release workflow (`.github/workflows/release.yml`)

Triggers: push a tag matching `v*`, or `workflow_dispatch`. Structure:

- **`create-release`** (runs once, `ubuntu-latest`): reads the version from `tauri.conf.json`, computes `tag = v<version>`, and creates a **draft** GitHub release named just `<tag>` if it does not already exist. Running once avoids a race between the matrix legs.
- **`build`** (matrix: `windows-latest` + `ubuntu-22.04`, `fail-fast: false`): installs Node + Rust, caches the Rust build, `npm ci`, `npm run tauri build`, then uploads that OS's assets to the draft with `--clobber`.
  - Job env sets `APPIMAGE_EXTRACT_AND_RUN=1` (lets AppImage tooling self-extract instead of needing FUSE on the runner; ignored on Windows).
  - Linux-only step installs the apt deps.
  - Linux-only repack step (see below) fixes the AppImage before upload.

Result: one draft release with 6 assets (Windows setup.exe / msi / portable exe; Linux deb / rpm / AppImage). Review, then publish manually.

Pin `ubuntu-22.04` (not `ubuntu-latest`): AppImages built on a newer glibc will not start on older distros; 22.04 is the oldest supported and gives the widest compatibility.

Ubuntu apt dependencies (Tauri v2 + AppImage): `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf`. (`libgtk-3-dev` and other webkit deps come transitively.)

## Platform notes

### Windows
- `main.rs` has `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` so release builds do not open a console. Do not remove it.
- Ships NSIS installer, MSI, and a portable exe (the release binary, renamed in the publish step). Unsigned, so SmartScreen shows a one-time prompt.

### Linux (three fixes, all shipped)
WebKitGTK has no Chromium-style GPU blocklist, and Tauri's AppImage over-bundles some host libs, so three issues were fixed:

| Symptom | Cause | Fix | Where |
|---|---|---|---|
| Hard crash at startup, `EGL_BAD_PARAMETER`, blank | AppImage bundles an old `libwayland-client.so.0` (no `wl_fixes_interface`) that shadows the host; modern Mesa `libEGL` then aborts | Strip the 4 bundled `libwayland-*` libs so the host's load | CI repack step (`release.yml`) |
| App launches but the window is blank (in VMs) | WebKit's DMABUF zero-copy renderer cannot share buffers on virtual GPUs (`vmwgfx`/`vboxvideo`/`qxl`) | Set `WEBKIT_DISABLE_DMABUF_RENDERER=1` on Linux (keeps hardware GL, drops only the broken buffer-sharing) | `main.rs`, top of `main`, `#[cfg(target_os = "linux")]`, respects a user-set value |
| Double-click does nothing on modern distros | The default AppImage runtime dynamically needs `libfuse.so.2`, but fuse3-only distros (e.g. CachyOS) lack it | Repack with the static type2 runtime (`appimagetool --runtime-file runtime-x86_64`), which statically links FUSE | CI repack step |

The CI repack step (Linux only, after `tauri build`, before upload): extracts the AppImage, removes the 4 wayland libs, downloads `appimagetool` (AppImageKit) and the static `runtime-x86_64` (AppImage/type2-runtime), and repackages with `--runtime-file`. If a future distro also trips on `libGL`/`libEGL`/`libdrm`, extend the same removal list.

`WEBKIT_DISABLE_DMABUF_RENDERER` is a runtime env var, so it applies to every Linux package (AppImage/deb/rpm) and to `tauri dev` on Linux - no per-bundle work. Runtime caveats (behavioral, not build): the global hotkey is reliable under X11 but restricted under Wayland.

## Git line endings (CRLF/LF)

`core.autocrlf=true` on the dev machine and there is no `.gitattributes`, so Git can report spurious "local changes" on files like `Cargo.toml` during a merge (line-ending normalization). Work around it per-merge with `git -c merge.renormalize=true merge …`; if a checkout re-dirties the tree, `git checkout -- .` clears the phantom. A permanent fix (not yet applied) is to add `.gitattributes` with `* text=auto` and renormalize the repo once.
