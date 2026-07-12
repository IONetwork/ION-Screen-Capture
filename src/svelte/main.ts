import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";

// Desktop app — suppress the WebView's default right-click menu
// (Back / Refresh / Print / Inspect).
window.addEventListener("contextmenu", (e) => e.preventDefault());

// Dev-only: `?mock` seeds sample data so the full UI renders in a plain browser
// (for design review). Stripped from production builds via import.meta.env.DEV.
if (import.meta.env.DEV && location.search.includes("mock")) {
  const { seedMock } = await import("./lib/dev/mock");
  seedMock();
}

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
