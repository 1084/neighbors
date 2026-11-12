// A small iCalendar reader: enough for library and parks calendars (VEVENT with DTSTART/DTEND in
// DATE, local TZID, or UTC form; folded lines; escaped text). Returns plain objects; no recurrence
// expansion (the feeds we read expand their own series).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FIXTURES, USER_AGENT, sleep } from "./util.mjs";

export async function fetchText(url, fixture, { retries = 2 } = {}) {
  if (process.env.FIXTURES) return readFileSync(resolve(FIXTURES, fixture), "utf8");
  for (let i = 0; i <= retries; i++) {
    try { const r = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "text/calendar, text/html, */*" } }); if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`); return await r.text(); }
    catch (e) { if (i === retries) throw e; await sleep(1500 * (i + 1)); }
  }
}

const unescape = s => String(s || "").replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");

// 20260901 | 20260901T130000 (local, with TZID) | 20260901T170000Z
export function icalDate(value, params = {}) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(value || "").trim());
  if (!m) return { iso: null, allDay: false };
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h) return { iso: `${y}-${mo}-${d}T12:00:00Z`, allDay: true };
  if (z) return { iso: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0))).toISOString(), allDay: false };
  // local time in the given zone: convert properly for America/New_York (our sources), else assume UTC
  const tz = params.TZID || "America/New_York";
  const local = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0)));
  const offset = tzOffsetMinutes(tz, local);
  return { iso: new Date(local.getTime() - offset * 60000).toISOString(), allDay: false };
}
// minutes east of UTC for `tz` at roughly `date`, via Intl (DST-correct)
function tzOffsetMinutes(tz, date) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(date);
    const get = t => +parts.find(p => p.type === t).value;
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    return (asUtc - date.getTime()) / 60000;
  } catch { return 0; }
}

export function parseIcal(text) {
  const lines = []; // unfold
  for (const raw of String(text).split(/\r?\n/)) { if ((raw.startsWith(" ") || raw.startsWith("\t")) && lines.length) lines[lines.length - 1] += raw.slice(1); else lines.push(raw); }
  const events = []; let cur = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const head = line.slice(0, i), value = line.slice(i + 1);
    const [name, ...ps] = head.split(";"); const params = {}; for (const p of ps) { const [k, v] = p.split("="); params[k] = v; }
    const key = name.toUpperCase();
    if (key === "DTSTART" || key === "DTEND") cur[key] = icalDate(value, params);
    else if (key === "GEO") { const [la, lo] = value.split(";").map(Number); if (Number.isFinite(la) && Number.isFinite(lo)) cur.GEO = [la, lo]; }
    else if (key === "CATEGORIES") cur.CATEGORIES = unescape(value).split(",").map(s => s.trim()).filter(Boolean);
    else if (!(key in cur)) cur[key] = unescape(value);
  }
  return events;
}
