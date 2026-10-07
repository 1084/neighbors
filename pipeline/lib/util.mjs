// Shared helpers for the Neighbors pipeline.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const DATA = resolve(ROOT, "data");
export const OUT = resolve(ROOT, "docs/data");
export const FIXTURES = resolve(ROOT, "pipeline/fixtures");
export const USER_AGENT = "neighbors-pipeline (johnhubert.llc; support@johnhubert.llc)";
export const STATES = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR GU VI AS MP".split(" "));
export const CATEGORIES = ["governance", "elections", "public-spaces", "public-services", "volunteering", "public-safety"];

export const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

export function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}
export function writeJson(path, value, pretty = false) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value));
}

/** Fetch JSON with retries. In FIXTURES mode, returns the named fixture instead of touching the network. */
export async function fetchJson(url, { headers = {}, retries = 2, fixture = null } = {}) {
  if (process.env.FIXTURES) {
    if (!fixture) throw new Error(`no fixture for ${url}`);
    return readJson(resolve(FIXTURES, fixture));
  }
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json, application/geo+json", ...headers } });
      if (r.status === 404) return null;
      if (r.status === 429) { await sleep(5000 * (i + 1)); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return await r.json();
    } catch (e) {
      if (i === retries) throw e;
      await sleep(1500 * (i + 1));
    }
  }
  return null;
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Build one normalized item; validates the few fields the app relies on. */
export function item(o) {
  if (!CATEGORIES.includes(o.category)) throw new Error(`bad category ${o.category} for ${o.id}`);
  if ("price" in o || "priceRanges" in o) throw new Error("price fields are not allowed");
  return {
    id: String(o.id),
    feedId: o.feedId,
    category: o.category,
    title: clip(o.title, 140),
    summary: clip(o.summary || "", 400),
    starts: iso(o.starts),
    ends: iso(o.ends),
    lat: num(o.lat), lon: num(o.lon),
    place: clip(o.place || "", 80),
    state: (o.state && STATES.has(String(o.state).trim().toUpperCase())) ? String(o.state).trim().toUpperCase() : null,
    sourceUrl: o.sourceUrl,
    sourceName: o.sourceName,
    updatedAt: iso(o.updatedAt) || new Date().toISOString(),
  };
}
const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const num = v => (v == null || v === "" || Number.isNaN(+v)) ? null : +v;
const iso = v => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };
