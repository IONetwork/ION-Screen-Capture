# Architecture

How ION Screen Capture is put together. Pair this with the file map in [README.md](README.md).

## Process model

`main.rs` is a thin entry: it applies the Linux dmabuf workaround (see [build-and-release.md](build-and-release.md)) and calls `ion_lib::run()` in `lib.rs`. `run()` builds the Tauri app:

- Registers plugins: `store`, `fs`, `dialog`, `clipboard-manager`, `opener`, and (desktop only) `global-shortcut`.
- Manages `AppState` (`state.rs`).
- A `setup` hook re-arms the global hotkey if it was enabled in a previous session (reads `settings.json`).
- Registers the command handlers via `tauri::generate_handler![…]`.

The Svelte frontend runs in the webview and talks to Rust two ways:

- **Commands** (request/response): frontend calls `invoke("name", args)`; Rust `#[tauri::command] async fn` returns `AppResult<T>`. All wrapped with types in `lib/ipc.ts`.
- **Events** (backend push): Rust `app.emit(EVENT, payload)`; frontend subscribes via listeners in `lib/ipc.ts`. Used for streaming discovery results, connection changes, and hotkey-triggered captures.

## Backend

### State (`state.rs`)
`AppState` holds the single live `Connection` (behind an async `Mutex<Option<Connection>>`), the retained last-capture bytes (for copy/save-last), and the discovery cancellation handle. `Connection` bundles the open `Transport`, the boxed `ScreenCapture` driver, and the detected identity (`vendor`, `class`, `idn`, `addr`). Only one instrument is connected at a time; connecting again switches (drops the old connection on success).

### Transport (`transport/`)
`Transport` is a raw `tokio` TCP socket with connect/IO timeouts. The `ScpiIo` trait is what drivers use (write a line, query a line, read an IEEE block); `block.rs` parses the `#<ndigits><length><payload>` definite-length block that most screenshot queries return. Fully cross-platform. Authoritative method list: read `transport/mod.rs`.

### Instrument drivers (`instrument/`)
The heart of capture. `ScreenCapture` (trait in `instrument/mod.rs`):

```rust
trait ScreenCapture: Send + Sync {
    fn supported_formats(&self) -> &'static [ImageFormat];
    fn supports_color(&self) -> bool { false }
    fn supports_invert(&self) -> bool { false }
    async fn on_connect(&self, io) -> AppResult<()> { Ok(()) }        // one-time setup
    async fn go_local(&self, io) -> AppResult<()> { Ok(()) }          // raw-socket return-to-local (best effort)
    fn wants_vxi11_local(&self) -> bool { false }                     // needs the VXI-11 device_local RPC instead
    async fn capture(&self, io, opts: &CaptureOptions) -> AppResult<RawCapture>;
}
```

Each driver owns its **entire** wire conversation inside `capture` (e.g. Tektronix does save-to-file / `*OPC?` / read-file / delete). `make_screen(vendor, class, model)` dispatches by `Class`: `Oscilloscope -> scope::make_scope(vendor)`, `Dmm -> dmm::make_dmm(vendor, model)`, `Other -> Unsupported`. `idn.rs` does `*IDN?` parsing and `detect_vendor` (manufacturer substring) + `detect_class` (DMM model allowlist first, then scope model-prefix shapes). Shared byte-fixups live in `instrument/mod.rs`: `truncate_bmp` (strip Siglent trailing junk), `truncate_at_png_iend` (Tektronix streamed PNG), `MAX_IMAGE_BYTES`.

`ImageFormat` (Png/Bmp24/Bmp8/Jpeg/Tiff) carries `mime()` and `ext()`. Note browsers cannot render TIFF in `<img>`, so TIFF is a valid capture format but not directly previewable.

### Discovery (`discovery/`)
Three producers run concurrently and feed one `mpsc` channel consumed by a single task that owns the dedup set (keyed by IP, with a rank score so a capturable/identified entry supersedes a VXI-11-only stub). The consumer is the sole event emitter, so results stream in order and duplicate-free without shared locks.

- `mdns.rs` - mDNS/DNS-SD browse (IPv4 only; port normalized).
- `sweep.rs` + `probe.rs` - parallel subnet sweep of candidate SCPI ports, with a lightweight probe/`*IDN?`.
- `vxi11.rs` - VXI-11 broadcast (portmap). Also exposes `device_local(ip)` (unicast portmap GETPORT -> Core channel -> `create_link`/`device_local`/`destroy_link`) used by the capture path for DMMs that have no raw return-to-local command.

The orchestrator (`discovery/mod.rs`) seeds the currently-connected instrument, applies a grace period after the sweep finishes so the progress bar lines up with completion, and emits `discovery:*` events.

### Commands (`commands/` + `hotkey.rs`)
Registered in `lib.rs`:

| Command | File | Purpose |
|---|---|---|
| `connect` / `disconnect` / `connection_status` | `connection.rs` | Open/close/report the connection. `connect` switches instruments; both run best-effort go-to-local on disconnect when "unlock after capture" is on. |
| `capture` / `copy_last_capture` / `save_last_capture` | `capture.rs` | Capture the screen; copy/save the retained last capture. |
| `start_discovery` / `cancel_discovery` / `list_interfaces` | `discovery.rs` | Drive discovery. |
| `set_hotkey` / `set_shortcut` | `hotkey.rs` | Enable/disable and rebind the global capture hotkey. |

The `capture` command: calls `driver.capture` over the connection's transport, decodes for width/height, optionally returns the instrument to local (`go_local`, and `vxi11::device_local` if `wants_vxi11_local`), and does the save/clipboard side effects. Returns a `CaptureResponse` with a base64 `dataUrl` for the preview. The hotkey path (`hotkey.rs`) reuses the same capture routine and emits a `capture:done`/`capture:error` event since there is no direct return value to await.

### Events (`events.rs`)
Names + payloads for `discovery:started|device|progress|source-done|error|complete`, `connection:changed`, and the capture events. Read `events.rs` for the exact constants and shapes; mirror them in `lib/ipc.ts`.

## Frontend

`App.svelte` is the shell (grid: titlebar / workspace / status bar). `onMount` initializes the stores. Theme is a `$derived` of `settings.theme ?? OS preference`, applied via `data-theme` on `<html>`.

### Stores (`lib/stores/*.svelte.ts`)
Runes-based singleton classes.

- `connection` - `info`, `lastCapture`, `busy`, `capturing`, `error`, `flash`; methods `connect`/`disconnect`/`capture`/`copyImage`/`saveImageAs`. Subscribes to `connection:changed` and the capture events in `init()`.
- `discovery` - `devices`, `scanning`, `progress`, `lastError`; `start`/`stop`. Subscribes to the `discovery:*` events.
- `settings` - persisted via the store plugin (`settings.json`, shared with the backend). Fields: `saveDir`, `saveToDisk`, `copyToClipboard`, `format`, `color`, `invert`, `unlockAfterCapture`, `checkUpdates`, `hotkeyEnabled`, `hotkeyShortcut`, `theme`. Each has a `setX` that writes through.
- `update` - reads the running version via `getVersion()` (always) and checks GitHub for a newer release (gated by `settings.checkUpdates`). Exposes `current`, `latest`, `url`, `available`.

### Components and primitives
`DeviceRail` (discovered list + manual IP/port connect + a disconnect control on the connected card), `CapturePanel` (format/color/invert toolbar, `Preview`, and a contextual idle placeholder when connected-but-not-captured), `Preview` (the image with a custom right-click copy/save menu), `StatusBar` (connection status + found count + app version), `SettingsDialog`, `UpdateBanner`, `ShortcutRecorder`, `DevicePicker`. Reusable primitives live in `lib/ui/` - reuse them (`Button`, `Icon`, `Switch`, `Field`, `TextField`, `IpField`, `SegmentedControl`, `Dialog`, `WindowControls`) rather than hand-rolling controls.

### IPC contract (`lib/ipc.ts`)
The single source of truth for command wrappers, event listeners, and shared types (`ConnectionInfo`, `CaptureResponse`, `CaptureRequest`, `DiscoveredDevice`, `Idn`, `ImageFormat`, `ShortcutSpec`, …). When you add or change a command/event, update this file so the types and the backend stay in lockstep.

## End-to-end flows

- **Discover**: `DeviceRail` -> `discovery.start()` -> `start_discovery` -> `spawn_discovery` (3 producers -> consumer) -> `discovery:device/progress/complete` -> `discovery` store -> rail list.
- **Connect**: card/manual -> `connection.connect(ip, port)` -> `connect` command (resolve addr, TCP connect, `*IDN?`, detect vendor/class, `make_screen`, `on_connect`) -> `Connection` stored -> `connection:changed` -> `connection` store -> `CapturePanel`.
- **Capture**: `CapturePanel` Capture button -> `connection.capture(opts)` -> `capture` command -> `driver.capture` over transport -> `RawCapture` -> optional unlock + save/clipboard -> `CaptureResponse` (dataUrl) -> `Preview`.
- **Hotkey capture**: OS global shortcut -> `hotkey.rs` -> same capture routine -> `capture:done` event -> `connection` store -> `Preview`.
