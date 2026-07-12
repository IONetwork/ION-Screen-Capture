import { defineConfig, type UserConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";

// @tauri-apps/cli sets TAURI_DEV_HOST when running on a physical device.
const host = process.env.TAURI_DEV_HOST;

// https://v2.tauri.app/start/frontend/#configuration
export default defineConfig((): UserConfig => ({
  plugins: [svelte()],

  resolve: {
    alias: {
      $lib: path.resolve(import.meta.dirname, "src/lib"),
    },
  },

  // Prevent Vite from obscuring Rust errors.
  clearScreen: false,
  server: {
    // Tauri expects a fixed port; fail if it is not available.
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      // Rust sources are watched by the Tauri CLI, not Vite.
      ignored: ["**/src-tauri/**"],
    },
  },

  // Env vars starting with these prefixes are exposed to the client.
  envPrefix: ["VITE_", "TAURI_ENV_*"],

  build: {
    // Target the webview engine per platform (Tauri sets TAURI_ENV_PLATFORM).
    // safari16 (not the usual safari13) is the floor: Svelte 5's runtime uses
    // syntax esbuild's compat table won't emit below Safari 16. Any webview new
    // enough to run Svelte 5 clears this bar.
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari16",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
}));
