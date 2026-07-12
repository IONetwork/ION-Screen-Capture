# Extending the app

Recipes for common changes. They assume the architecture in [architecture.md](architecture.md). Always finish with the verification in [build-and-release.md](build-and-release.md).

## Add support for a new instrument (vendor or model)

The capture pipeline is: `*IDN?` -> `detect_vendor` + `detect_class` -> `make_screen` -> a `ScreenCapture` driver. To add an instrument you touch identity detection, add a driver, and register it.

1. **Identity** (`src/src-tauri/src/instrument/idn.rs`):
   - New vendor: add a variant to `Vendor` and a branch in `detect_vendor` (manufacturer substring, case-insensitive).
   - Classify the model in `detect_class`: add it to the DMM allowlist, or extend the scope model-prefix set, so it maps to `Class::Dmm` or `Class::Oscilloscope`. Anything left as `Class::Other` is treated as unsupported.
   - Add a unit test in the `#[cfg(test)] mod tests` block (there are examples for each vendor).

2. **Driver**: implement `ScreenCapture` in a new file under `instrument/scope/` or `instrument/dmm/`. Minimum: `supported_formats()` and `capture()`. The whole SCPI conversation for one screenshot lives in `capture()`; use the `ScpiIo` methods (`write_line`, `query`, block read) and the shared helpers (`truncate_bmp`, `truncate_at_png_iend`, `MAX_IMAGE_BYTES`) from `instrument/mod.rs`. Copy the closest existing driver (`rigol.rs` for a simple `:DISP:DATA?` block; `tektronix.rs` for a save/read/delete sequence) as a starting point.
   - Override `supports_color`/`supports_invert` only if the instrument's screenshot command takes those knobs (the UI shows the toggles based on these).
   - Return-to-local: if the instrument locks its front panel when remote and has a raw command to release it, override `go_local` with a single `io.write_line("<cmd>").await` (best effort). If it has **no** raw command and only clears via VXI-11 (Keysight/Rigol Truevolt DMMs), override `wants_vxi11_local -> true` instead - the capture/disconnect path then fires `discovery::vxi11::device_local`.

3. **Register** in the factory: add the vendor arm to `make_scope` (`instrument/scope/mod.rs`) or the vendor/model arm to `make_dmm` (`instrument/dmm/mod.rs`).

No frontend change is needed - the UI reads `supportedFormats`/`supportsColor`/`supportsInvert` from `ConnectionInfo` and adapts.

## Add or change a capture image format

1. `instrument/mod.rs`: add the variant to `ImageFormat` and its `mime()`/`ext()` arms.
2. `lib/ipc.ts`: add it to the `ImageFormat` TS union.
3. `lib/stores/connection.svelte.ts`: extend `formatExt` (file extension for save).
4. Report it from the relevant driver's `supported_formats()`.

Reminder: TIFF is not renderable in a webview `<img>`; if you make a non-previewable format the default, the preview will be blank.

## Add a setting

1. `lib/stores/settings.svelte.ts`: add a `$state` field, load it in `init()` (`(await store.get<T>("key")) ?? default`), and add a `setKey` writer that also calls `#save`.
2. `lib/components/SettingsDialog.svelte`: add a `Field` + control (reuse `Switch`/`TextField`).
3. Consume it wherever needed. If the **backend** needs it (like the hotkey and "unlock after capture" do), read `settings.json` in Rust via the store plugin (`app.store("settings.json")`); the file is shared.

## Add a command (frontend calls backend)

1. Backend: add `#[tauri::command] pub async fn my_cmd(state, args…) -> AppResult<T>` in the right `commands/*.rs`.
2. Register it in the `tauri::generate_handler![…]` list in `lib.rs`.
3. `lib/ipc.ts`: add a typed wrapper `export function myCmd(args): Promise<T> { return invoke("my_cmd", { … }); }`.
4. Call it from a store, never directly from a component.

## Add an event (backend pushes to frontend)

1. `events.rs`: add a name constant and a payload struct (`Serialize`, `camelCase`).
2. Emit from the backend: `app.emit(events::MY_EVENT, payload)`.
3. `lib/ipc.ts`: add `export function onMyEvent(cb): Promise<UnlistenFn> { return listen("my:event", e => cb(e.payload)); }`.
4. Subscribe in a store's `init()` and update store state in the callback.

## Add a UI component

Put app-specific components in `lib/components/`, reusable primitives in `lib/ui/`. Use Svelte 5 runes; take props via `$props()`, make two-way props `$bindable()`. Reuse the existing primitives and the CSS variables from `app.css` (colors: `--ink`, `--ink-2`, `--ink-3`, `--accent`, `--accent-weak`, `--surface`, `--inset`, `--line`, `--line-2`, `--danger`, `--ok`; radius `--r-sm`). Support light and dark (styles read the variables, which flip via `data-theme`).

## Change discovery behavior

Discovery is `discovery/mod.rs` (orchestrator + dedup) plus three producers (`mdns`, `sweep`+`probe`, `vxi11`). To add a producer, spawn another task that sends `DiscoveryMsg::Device(…)` into the same channel; the consumer dedups by IP with a rank score (give better/capturable sources a higher rank so they supersede stubs). To change scanned ports or timeouts, see `DiscoveryOptions` (defaults in `discovery/mod.rs`).

## Return-to-local / front-panel unlock

Two-part mechanism on the `ScreenCapture` trait: `go_local` (raw-socket command, per driver) and `wants_vxi11_local` (use the VXI-11 `device_local` RPC instead). The command layer (`commands/capture.rs`, `commands/connection.rs`) invokes them best-effort, gated by the `unlockAfterCapture` setting, so they never fail a capture or disconnect. Add the right override to a new driver as described in the instrument recipe above.
