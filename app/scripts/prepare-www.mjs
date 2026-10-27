// Builds www/ (the folder Capacitor bundles) from the web app in ../docs:
//   - index.html with the data base pointed at the published site, so the phone
//     app reads the same nightly feeds as the web and ships no data of its own
//   - native.js, the Capacitor runtime + plugins bundled by esbuild
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dst = join(root, "www");
if (existsSync(dst)) rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
let html = readFileSync(join(root, "..", "docs", "index.html"), "utf8");
html = html.replace("<script>", '<script>window.CIVIC_DATA = "https://johnhubert.llc/neighbors/data/";</script>\n<script src="./native.js"></script>\n<script>');
writeFileSync(join(dst, "index.html"), html);
execSync(`npx esbuild "${join(root, "native/plugins.mjs")}" --bundle --minify --format=iife --target=ios15 --outfile="${join(dst, "native.js")}"`, { stdio: "inherit", cwd: root });
console.log("www ready");
