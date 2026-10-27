// Bundled into www/native.js by scripts/prepare-www.mjs (esbuild). Exposes the Capacitor
// plugin proxies to the plain index.html, which has no module system of its own.
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { StatusBar, Style } from "@capacitor/status-bar";
window.CapPlugins = { Capacitor, Share, StatusBar, Style };
