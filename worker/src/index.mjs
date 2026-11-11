// Neighbors — contribution queue (Cloudflare Worker + D1)
//
// The app posts structured contributions here; a person reviews them; outcomes go to What's new.
//
//   POST /v1/contribute        { kind: "source"|"item"|"idea"|"confirm"|"flag", ... }  → { ok, id }
//   GET  /v1/signals?ids=a,b   → { "a": { confirms, flags }, ... }   (what the app shows beside Confirm)
//   GET  /v1/whats-new         → [ { when, status, title, note } ]    (public; no names, ever)
//   GET  /v1/health
//   admin (Authorization: Bearer ADMIN_KEY):
//   GET  /v1/admin/queue?status=new
//   POST /v1/admin/decide      { id, status: "approved"|"declined"|"done", note?, public? }
//   GET  /v1/admin/export      → the approved sources/items as JSON for data/contrib/ (until GH_TOKEN automates it)
//   GET  /review               the review page (asks for the key once, keeps it in sessionStorage)
//
// Rules carried from CHARTER.md: no price field; no comments shown to anyone; an item without an official link
// is not accepted; nothing identifying a person is stored (zip3 and a one-day IP hash for rate limiting only).

import { REVIEW_HTML } from "./review.mjs";

const KINDS = new Set(["source", "item", "idea", "confirm", "flag"]);
const CATS = new Set(["governance", "elections", "public-spaces", "public-services", "volunteering", "public-safety", "work", "education", "health", "kids-and-family"]);
const ALLOWED = /\.(gov|mil|edu|us|org)$|\.k12\.[a-z]{2}\.us$|\.lib\.[a-z]{2}\.us$/i;
const LIMIT_PER_DAY = 40;          // contributions per client per day; confirms count too
const UA = { "user-agent": "neighbors-queue (johnhubert.llc; support@johnhubert.llc)" };

const now = () => new Date().toISOString();
const clean = (v, n) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n) : "");
const ulid = () => Date.now().toString(36) + "-" + crypto.getRandomValues(new Uint8Array(6)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

function cors(req, env) {
  const origin = req.headers.get("origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || /^https:\/\/[a-z0-9-]+\.johnhubert\.llc$/.test(origin);
  return { "access-control-allow-origin": ok ? origin : "https://johnhubert.llc", "access-control-allow-headers": "content-type, authorization", "access-control-allow-methods": "GET,POST,OPTIONS", "vary": "origin" };
}
const json = (req, env, obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...cors(req, env) } });

function adminOk(req, env) {
  if (!env.ADMIN_KEY) return false;
  const given = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return given.length === env.ADMIN_KEY.length && given === env.ADMIN_KEY;
}

// Rate limit on a one-day hash of the client IP. The salt is the day itself plus the admin key, so the hash
// cannot be reversed to an address and changes every day.
async function rateKey(req, env) {
  const ip = req.headers.get("cf-connecting-ip") || "0";
  const day = now().slice(0, 10);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ip}|${day}|${env.ADMIN_KEY || "salt"}`));
  return { key: [...new Uint8Array(buf)].slice(0, 12).map(b => b.toString(16).padStart(2, "0")).join("") + ":" + day, day };
}
async function underLimit(req, env) {
  const { key, day } = await rateKey(req, env);
  const row = await env.DB.prepare("SELECT n FROM rate WHERE key = ?").bind(key).first();
  if ((row?.n || 0) >= LIMIT_PER_DAY) return false;
  await env.DB.prepare("INSERT INTO rate (key, n, day) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET n = n + 1").bind(key, day).run();
  return true;
}

// Does the link resolve on its own? A quick check at receipt; the review decides the rest.
async function linkResolves(url) {
  try { const r = await fetch(url, { method: "GET", headers: { ...UA, accept: "text/html" }, redirect: "follow", cf: { cacheTtl: 0 } }); return r.ok ? 1 : 0; } catch { return 0; }
}

async function contribute(req, env) {
  const b = await req.json().catch(() => null);
  if (!b || !KINDS.has(b.kind)) return json(req, env, { error: "kind must be source, item, idea, confirm or flag" }, 400);
  if (!(await underLimit(req, env))) return json(req, env, { error: "That's plenty for one day; thank you. Try again tomorrow." }, 429);
  const zip3 = /^\d{3}/.test(b.zip3 || "") ? String(b.zip3).slice(0, 3) : null;
  const rec = { id: ulid(), kind: b.kind, status: "new", zip3, received_at: now() };
  if (b.kind === "confirm" || b.kind === "flag") {
    const itemId = clean(b.id, 200); if (!itemId) return json(req, env, { error: "id required" }, 400);
    rec.item_id = itemId; if (b.kind === "flag") rec.text = clean(b.why, 200);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO contributions (id, kind, status, zip3, item_id, text, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(rec.id, rec.kind, rec.status, zip3, itemId, rec.text || null, rec.received_at),
      env.DB.prepare(`INSERT INTO item_signals (item_id, confirms, flags, last_at) VALUES (?, ?, ?, ?) ON CONFLICT(item_id) DO UPDATE SET ${b.kind === "confirm" ? "confirms = confirms + 1" : "flags = flags + 1"}, last_at = excluded.last_at`).bind(itemId, b.kind === "confirm" ? 1 : 0, b.kind === "flag" ? 1 : 0, rec.received_at)
    ]);
    return json(req, env, { ok: true, id: rec.id });
  }
  if (b.kind === "idea") {
    rec.text = clean(b.text, 600); if (!rec.text) return json(req, env, { error: "text required" }, 400);
    await env.DB.prepare("INSERT INTO contributions (id, kind, status, zip3, text, received_at) VALUES (?, ?, ?, ?, ?, ?)").bind(rec.id, rec.kind, rec.status, zip3, rec.text, rec.received_at).run();
    return json(req, env, { ok: true, id: rec.id });
  }
  // source or item: the link is the whole point
  const link = clean(b.link, 500); const domain = hostOf(link);
  if (!/^https?:\/\//i.test(link) || !domain) return json(req, env, { error: "A full link, please." }, 400);
  if (!ALLOWED.test(domain)) return json(req, env, { error: `${domain} isn't a domain we can verify (.gov, .edu, .org, .us).` }, 400);
  if ("price" in b) return json(req, env, { error: "Nothing here is for sale." }, 400);
  rec.link = link; rec.domain = domain; rec.category = CATS.has(b.cat) ? b.cat : null; rec.title = clean(b.title, 120);
  rec.zip = /^\d{5}$/.test(b.zip || "") ? b.zip : null; rec.starts = clean(b.when, 40) || null;
  rec.link_ok = await linkResolves(link);
  await env.DB.prepare("INSERT INTO contributions (id, kind, status, zip3, link, domain, category, title, zip, starts, link_ok, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(rec.id, rec.kind, rec.status, zip3, link, domain, rec.category, rec.title, rec.zip, rec.starts, rec.link_ok, rec.received_at).run();
  return json(req, env, { ok: true, id: rec.id, linkOk: !!rec.link_ok });
}

async function signals(req, env, url) {
  const ids = (url.searchParams.get("ids") || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 60);
  if (!ids.length) return json(req, env, {});
  const q = `SELECT item_id, confirms, flags FROM item_signals WHERE item_id IN (${ids.map(() => "?").join(",")})`;
  const { results } = await env.DB.prepare(q).bind(...ids).all();
  return json(req, env, Object.fromEntries(results.map(r => [r.item_id, { confirms: r.confirms, flags: r.flags }])));
}

// What's new: public outcomes only. "A neighbor added…" is the whole credit; no zip, no id, no text of an idea
// unless the reviewer chose to publish a note.
const dayLabel = iso => { const d = new Date(iso), t = new Date(); const dd = Math.floor((t - d) / 864e5); return dd === 0 ? "Today" : dd === 1 ? "Yesterday" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }); };
async function whatsNew(req, env) {
  const { results } = await env.DB.prepare("SELECT kind, status, title, domain, category, note, decided_at, received_at FROM contributions WHERE public = 1 ORDER BY COALESCE(decided_at, received_at) DESC LIMIT 40").all();
  const label = { approved: "Live", done: "Done", declined: "Not added", new: "Reviewing" };
  const rows = results.map(r => ({
    when: dayLabel(r.decided_at || r.received_at), status: label[r.status] || r.status,
    title: r.kind === "idea" ? `Idea: ${r.note || "a suggestion from a neighbor"}` : r.kind === "source" ? `A neighbor added ${r.title || r.domain}.` : `A neighbor submitted ${r.title ? `"${r.title}"` : "an item"} from ${r.domain}.`,
    note: r.kind === "idea" ? "" : (r.note || "")
  }));
  return new Response(JSON.stringify(rows), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300", ...cors(req, env) } });
}

async function adminQueue(req, env, url) {
  const status = url.searchParams.get("status") || "new";
  const { results } = await env.DB.prepare("SELECT * FROM contributions WHERE status = ? ORDER BY received_at DESC LIMIT 200").bind(status).all();
  const sig = await env.DB.prepare("SELECT item_id, confirms, flags FROM item_signals ORDER BY last_at DESC LIMIT 100").all();
  return json(req, env, { queue: results, signals: sig.results });
}
async function adminDecide(req, env) {
  const b = await req.json().catch(() => null);
  if (!b?.id || !["approved", "declined", "done", "new"].includes(b.status)) return json(req, env, { error: "id and status" }, 400);
  const pub = b.public === undefined ? (b.status === "approved" || b.status === "done" ? 1 : 0) : (b.public ? 1 : 0);
  await env.DB.prepare("UPDATE contributions SET status = ?, note = ?, public = ?, decided_at = ? WHERE id = ?").bind(b.status, clean(b.note, 200) || null, pub, b.status === "new" ? null : now(), b.id).run();
  let committed = null;
  if (b.status === "approved" && env.GH_TOKEN) { const row = await env.DB.prepare("SELECT id, kind, link, domain, category, title, zip, starts, note, decided_at FROM contributions WHERE id = ?").bind(b.id).first(); if (row && (row.kind === "source" || row.kind === "item")) committed = await commitApproved(env, row); }
  return json(req, env, { ok: true, committed });
}

// Approved sources and items go straight into the repo as data/contrib/approved.json, which the nightly
// pipeline reads as the "contrib" feed. One small commit per approval, through GitHub's contents API,
// with a fine-grained token scoped to this one repo (contents: write). The file is read, the row
// appended (or replaced, by id), and written back with its sha so two approvals can't clobber each other.
const GH_REPO = "1084/neighbors", GH_PATH = "data/contrib/approved.json";
async function commitApproved(env, row) {
  const h = { authorization: `Bearer ${env.GH_TOKEN}`, accept: "application/vnd.github+json", "user-agent": UA["user-agent"], "x-github-api-version": "2022-11-28" };
  const api = `https://api.github.com/repos/${GH_REPO}/contents/${GH_PATH}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    let sha = null, list = [];
    const r = await fetch(api, { headers: h });
    if (r.ok) { const j = await r.json(); sha = j.sha; try { list = JSON.parse(atob(j.content.replace(/\n/g, ""))); } catch { list = []; } }
    else if (r.status !== 404) return { ok: false, status: r.status };
    const rec = { id: row.id, kind: row.kind, link: row.link, domain: row.domain, category: row.category, title: row.title, zip: row.zip, starts: row.starts || null, note: row.note || null, approvedAt: row.decided_at || now() };
    list = [...list.filter(x => x.id !== row.id), rec];
    const body = { message: `contrib: ${row.kind} from ${row.domain}${row.title ? ` (${row.title})` : ""}`, content: btoa(unescape(encodeURIComponent(JSON.stringify(list, null, 2) + "\n"))), committer: { name: "neighbors-queue", email: "support@johnhubert.llc" }, ...(sha ? { sha } : {}) };
    const w = await fetch(api, { method: "PUT", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (w.ok) return { ok: true, count: list.length };
    if (w.status !== 409 && w.status !== 422) return { ok: false, status: w.status };
  }
  return { ok: false, status: 409 };
}
async function adminExport(req, env) {
  const { results } = await env.DB.prepare("SELECT id, kind, link, domain, category, title, zip, starts, decided_at FROM contributions WHERE status = 'approved' AND kind IN ('source','item') ORDER BY decided_at").all();
  return json(req, env, results);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors(req, env), "access-control-max-age": "86400" } });
    const p = url.pathname;
    try {
      if (p === "/v1/health") { const r = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM contributions WHERE status='new') AS waiting, (SELECT COUNT(*) FROM contributions) AS total").first(); return json(req, env, { ok: true, ...r }); }
      if (p === "/v1/contribute" && req.method === "POST") return contribute(req, env);
      if (p === "/v1/signals") return signals(req, env, url);
      if (p === "/v1/whats-new") return whatsNew(req, env);
      if (p === "/review") return new Response(REVIEW_HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
      if (p.startsWith("/v1/admin/")) {
        if (!adminOk(req, env)) return json(req, env, { error: "Unauthorized" }, 401);
        if (p === "/v1/admin/queue") return adminQueue(req, env, url);
        if (p === "/v1/admin/decide" && req.method === "POST") return adminDecide(req, env);
        if (p === "/v1/admin/export") return adminExport(req, env);
      }
      return json(req, env, { error: "Not found" }, 404);
    } catch (e) { return json(req, env, { error: "Server error", detail: String(e.message || e).slice(0, 200) }, 500); }
  },
  // daily sweep: yesterday's rate rows, and raw confirm/flag rows older than 90 days (the rollup keeps the counts)
  async scheduled(_ev, env) {
    const day = now().slice(0, 10);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM rate WHERE day < ?").bind(day),
      env.DB.prepare("DELETE FROM contributions WHERE kind IN ('confirm','flag') AND received_at < datetime('now', '-90 days')")
    ]);
  }
};
