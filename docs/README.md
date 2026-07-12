# ION Screen Capture - developer/agent guide

Documentation for anyone (human or AI agent) picking this project up to fix, adjust, or extend it. Start here, then jump to the focused docs:

- [architecture.md](architecture.md) - how the app is put together (backend, frontend, IPC, data flows).
- [extending.md](extending.md) - step-by-step recipes for common changes (new instrument, setting, command, event, UI).
- [build-and-release.md](build-and-release.md) - dev/build/verify commands, CI, cross-platform packaging, and the Windows/Linux gotchas.

## What the app is

A cross-platform desktop app (Tauri v2 + Svelte 5) that discovers SCPI/LXI test instruments on the local network and captures their **screens**. It auto-detects the instrument from `*IDN?`, picks the matching per-vendor screenshot dialect, and saves/copies the image.

- Frontend: Svelte 5 (runes) rendered in the platform webview (WebView2 on Windows, WebKitGTK on Linux).
- Backend: Rust (Tauri v2), talking to instruments over raw TCP sockets (SCPI) plus a small VXI-11/ONC-RPC path.

## The one hard invariant

**Screen capture is the only feature. Never add live measurement, data readout, or waveform/number parsing.** The product is deliberately a screenshot utility. If a request sounds like "also read the measured value / stream the waveform / show the reading," it is out of scope - confirm intent before building anything that ingests instrument *data* rather than its *screen image*. (Also recorded in agent memory as `ion-screenshot-only-scope`.)

## Repo layout (non-standard - read this)

The entire npm + Tauri project lives under `src/`, not at the repo root:

```
/                     repo root
  docs/               <- this guide
  ui/                 screenshots used by README (ui_rigol.png, ui_keysight.png)
  README.md
  .github/workflows/release.yml
  src/                <- npm project root (package.json, node_modules, package-lock.json live HERE)
    package.json
    svelte/           frontend (Vite root; App.svelte, lib/…)
    src-tauri/        Tauri crate (Cargo.toml, src/…, tauri.conf.json, icons/, capabilities/)
    dist/  -> actually emitted to repo-root /dist (see below)
```

Why it is like this and what it constrains:

- `npm` commands run from `src/` (that is where `package.json` is). CI sets `working-directory: src`.
- Tauri v2 hardcodes the crate directory name `src-tauri` and cannot relocate it (upstream issue tauri#12779). `src/src-tauri` works **only** because the Tauri CLI is invoked from `src/`, so it finds `src-tauri` relative to there.
- Vite `root` is the `svelte/` dir; `outDir` is the repo-root `dist/`; `tauri.conf.json` `frontendDist` is `"../../dist"` (relative to `src-tauri/`).
- So: run everything from `src/` (`cd src && npm run …`). Do not try to move `src-tauri`.

This is also captured in agent memory as `repo-layout-src-consolidated`.

## File map

Backend - `src/src-tauri/src/`:

| Path | Role |
|---|---|
| `main.rs` | Process entry. Sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` on Linux, then calls `ion_lib::run()`. |
| `lib.rs` | Composition root: registers plugins, `AppState`, the `setup` hook (arms the saved hotkey), and the `invoke_handler` command list. |
| `state.rs` | `AppState` (the live `Connection`, last capture bytes, discovery handle) and `Connection` (transport + driver + identity). |
| `error.rs` | `AppError`/`AppResult`, serialized to the frontend. |
| `events.rs` | Event name constants + payload structs emitted to the frontend. |
| `transport/mod.rs` | `Transport` (raw TCP) and the `ScpiIo` trait (`write_line`, `query`, block reads) drivers use. |
| `transport/block.rs` | IEEE 488.2 definite-length block reader (`#<n><len><payload>`). |
| `instrument/mod.rs` | `ScreenCapture` trait, `make_screen()` factory, `ImageFormat`, and byte-fixup helpers. |
| `instrument/idn.rs` | `*IDN?` parsing, `Vendor`/`Class` enums, `detect_vendor`/`detect_class`. |
| `instrument/scope/{mod,rigol,keysight,siglent,tektronix}.rs` | Oscilloscope drivers + `make_scope()`. |
| `instrument/dmm/mod.rs` | DMM drivers (Truevolt dump, Rigol disp-data, Siglent SCDP) + `make_dmm()`. |
| `discovery/{mod,mdns,sweep,probe,vxi11}.rs` | Three discovery producers feeding one deduplicating consumer; `vxi11.rs` also has the `device_local` go-to-local RPC. |
| `commands/{connection,capture,discovery}.rs` | Tauri command handlers (`mod.rs` re-exports). |
| `hotkey.rs` | Global-shortcut registration + hotkey-triggered capture, and its commands. |

Frontend - `src/svelte/`:

| Path | Role |
|---|---|
| `main.ts` | Mounts `App.svelte` into `#app`. |
| `App.svelte` | Shell: titlebar, rail, capture panel, status bar; theme; `onMount` store init. |
| `app.css` | Global styles, CSS variables, light/dark themes. |
| `lib/ipc.ts` | Typed wrappers over `invoke` + event listeners, and all shared TS types. The single source of the IPC contract. |
| `lib/dev/mock.ts` | IPC mock so the UI runs in a plain browser (no Tauri). |
| `lib/stores/{connection,discovery,settings,update}.svelte.ts` | Runes-based state stores. |
| `lib/components/*.svelte` | App components: `DeviceRail`, `CapturePanel`, `Preview`, `StatusBar`, `SettingsDialog`, `UpdateBanner`, `ShortcutRecorder`, `DevicePicker`. |
| `lib/ui/*.svelte` | Reusable primitives: `Button`, `TextField`, `IpField`, `Icon`, `Switch`, `Dialog`, `Field`, `SegmentedControl`, `WindowControls`. |

## Quick commands (run from `src/`)

```sh
cd src
npm ci
npm run tauri dev      # dev app with HMR
npm run check          # svelte-check + tsc (expect 0 errors / 0 warnings)
npm run tauri build    # release build + per-OS bundles
```

Backend-only check (from `src/src-tauri/`): `cargo check`. On some shells the Rust toolchain is not on PATH; prepend `$env:USERPROFILE\.cargo\bin` (PowerShell).

## Conventions and gotchas (do not skip)

- **Screenshot-only** - the invariant above. It overrides feature requests that would read instrument data.
- **No em-dashes.** The maintainer dislikes the `—` character in UI copy and prose. Use periods, commas, colons, parentheses, or a plain hyphen. (Agent memory: `no-em-dashes`.)
- **Svelte 5 runes** everywhere: `$state`, `$derived`, `$props`, `$bindable`, `$effect`. Custom component props that use `bind:` must be declared `$bindable()`. Note `TextField` with `type="number"` yields a number/`null` at runtime despite its `string` prop type - parse defensively, do not call string methods on it.
- **Rust edition 2024** (needs Rust >= 1.85). `std::env::set_var` is `unsafe`; only call it single-threaded at the top of `main` (see `main.rs`).
- **Version bumps must stay in sync** across `src/src-tauri/tauri.conf.json`, `src/src-tauri/Cargo.toml`, and `src/package.json`. The release tag is derived from `tauri.conf.json`.
- **Verify before claiming done.** Run `npm run check` for frontend changes and `cargo check` for backend changes. HMR reflects frontend edits into a running `npm run tauri dev` live.
- **Line endings**: `core.autocrlf=true` and there is no `.gitattributes`, so merges can hit spurious CRLF conflicts. Use `git -c merge.renormalize=true merge …`. A `.gitattributes` with `* text=auto` would fix it permanently (not yet added).
