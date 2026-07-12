// Prevents an extra console window on Windows in release. DO NOT REMOVE.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebKitGTK's DMABUF zero-copy renderer yields a blank window on virtual
    // GPUs (vmwgfx/vboxvideo/qxl) that can't share those buffers. Disabling it
    // fixes rendering in VMs while keeping hardware GL; the cost on real GPUs is
    // a single buffer copy (negligible here). Must run before any GTK/WebKit/GL
    // init, at the top of main while still single-threaded. An explicit
    // user-set value is respected.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        // SAFETY: no other threads exist yet (tokio/tauri start in run()).
        unsafe { std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1") };
    }

    ion_lib::run()
}
