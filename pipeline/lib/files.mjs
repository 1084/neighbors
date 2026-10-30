// Bulk-file helpers for directory feeds: download a file (or read its fixture), open a zip
// archive by entry name, and parse CSV. Directory files are large and change yearly, so
// each feed caches the parsed rows under data/cache/ and re-downloads only when the
// server's ETag/Last-Modified changes.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { inflateRawSync } from "node:zlib";
import { DATA, FIXTURES, USER_AGENT, log } from "./util.mjs";

const CACHE = resolve(DATA, "cache");
const MAX_AGE_DAYS = 30; // re-check a directory at most monthly; they're annual files

/** Fetch bytes with a monthly cache. In FIXTURES mode returns the fixture file instead. */
export async function fetchCached(url, name, { fixture } = {}) {
  if (process.env.FIXTURES) return readFileSync(resolve(FIXTURES, fixture));
  mkdirSync(CACHE, { recursive: true });
  const path = resolve(CACHE, name);
  if (existsSync(path) && (Date.now() - statSync(path).mtimeMs) < MAX_AGE_DAYS * 864e5) { log(`${name}: using cached copy`); return readFileSync(path); }
  const r = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(path, buf);
  log(`${name}: downloaded ${(buf.length / 1e6).toFixed(1)} MB`);
  return buf;
}

/** List and extract entries from a zip buffer (stored or deflated; no zip64, which these files don't use). */
export function zipEntries(buf) {
  // Walk the central directory from the end-of-central-directory record.
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip (no EOCD)");
  const count = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central directory");
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    entries.push({ name, method, csize, usize, localOff });
    p += 46 + nameLen + extraLen + commentLen;
  }
  const read = (e) => {
    const nameLen = buf.readUInt16LE(e.localOff + 26), extraLen = buf.readUInt16LE(e.localOff + 28);
    const start = e.localOff + 30 + nameLen + extraLen;
    const data = buf.subarray(start, start + e.csize);
    return e.method === 0 ? data : inflateRawSync(data);
  };
  return { names: entries.map(e => e.name), read: (pattern) => { const e = entries.find(x => typeof pattern === "string" ? x.name === pattern : pattern.test(x.name)); if (!e) throw new Error(`zip entry not found: ${pattern}`); return read(e); } };
}

/** Parse CSV (RFC 4180 quoting, CRLF or LF) into objects keyed by header; header keys are trimmed and upper-cased. */
export function parseCsv(text, { upper = true } = {}) {
  if (Buffer.isBuffer(text)) text = text.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; continue; }
    if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); field = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map(h => upper ? h.trim().toUpperCase() : h.trim());
  return rows.map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

export const phone = v => { const d = String(v || "").replace(/\D/g, ""); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : ""; };
export const titleCase = s => String(s || "").toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase()).replace(/\b(Of|And|The|At|For|In|On)\b/g, m => m.toLowerCase()).replace(/^./, m => m.toUpperCase());

/** Parse a dBase III/IV .dbf (the attribute table of a shapefile) into objects keyed by upper-cased field name. */
export function parseDbf(buf) {
  const count = buf.readUInt32LE(4), headerLen = buf.readUInt16LE(8), recLen = buf.readUInt16LE(10);
  const fields = [];
  for (let p = 32; p < headerLen - 1 && buf[p] !== 0x0d; p += 32) {
    let name = buf.toString("latin1", p, p + 11); name = name.slice(0, name.indexOf("\0") >= 0 ? name.indexOf("\0") : 11).trim().toUpperCase();
    fields.push({ name, type: String.fromCharCode(buf[p + 11]), len: buf[p + 16] });
  }
  const rows = [];
  for (let i = 0, p = headerLen; i < count && p + recLen <= buf.length; i++, p += recLen) {
    if (buf[p] === 0x2a) continue; // deleted
    const row = {}; let q = p + 1;
    for (const f of fields) { row[f.name] = buf.toString("latin1", q, q + f.len).trim(); q += f.len; }
    rows.push(row);
  }
  return rows;
}
