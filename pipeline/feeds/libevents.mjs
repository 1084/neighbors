// Library event calendars: dated programs at branches, the richest kids-and-family source there is.
// Each system's public calendar has a JSON endpoint that its own web page uses (no key, no HTML):
//   libcal    (Springshare)  GET /ajax/calendar/list?c={cal}&date=YYYY-MM-DD&perpage=100  — one day per call
//   communico (Attend)       GET /eeventcaldata?event_type=0&req={"date":…,"days":30}     — one call
// (LibCal's iCal subscribe feed is capped at its 500 oldest events, so it never reaches today.)
// Each event is placed at its branch: IMLS outlet coordinates from data/feeds/libraries.json, matched
// by normalised name within the system's radius. Audience decides the category:
//   babies/kids/teens/family → kids-and-family;  everything else → education (a public program at a library)
// Online-only events and closures are dropped. Add a system: one row in SYSTEMS.
import { resolve } from "node:path";
import { item, log, DATA, readJson, fetchJson } from "../lib/util.mjs";
import { icalDate } from "../lib/ical.mjs";

const SYSTEMS = [
  { id: "fcpl", name: "Fairfax County Public Library", state: "VA", kind: "libcal", cal: 6524,
    base: "https://librarycalendar.fairfaxcounty.gov", web: "https://librarycalendar.fairfaxcounty.gov/calendar?cid=6524",
    center: [38.85, -77.30], radiusKm: 35, fixture: "libcal-fcpl.json" },
  { id: "alexlib", name: "Alexandria Library", state: "VA", kind: "communico",
    base: "https://alexlibraryva.org", web: "https://alexlibraryva.org/events",
    center: [38.81, -77.08], radiusKm: 8, fixture: "communico-alexandria.json" },
];
const DAYS = 30;
const KIDS = /\b(babies|baby|toddlers?|preschool(ers)?|children|child|kids?|family|families|teens?|tweens?|storytime|story time|youth|homeschool)\b/i;
const SKIP = /\b(closed|closure|holiday hours)\b/i;
const ONLINE = /^(virtual|online|zoom)\b/i;

// "2026-11-16 10:00:00" (library local time) → ISO
const local = s => { const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s || ""); return m ? icalDate(`${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}${m[6] || "00"}`, { TZID: "America/New_York" }).iso : null; };
const core = s => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\b(the|library|libraries|branch|regional|community|central|jr|public)\b/g, " ").replace(/\s+/g, " ").trim();
const km = (a, b) => { const R = 6371, d = Math.PI / 180, x = (b[1] - a[1]) * d * Math.cos((a[0] + b[0]) / 2 * d), y = (b[0] - a[0]) * d; return R * Math.hypot(x, y); };
const ymd = t => new Date(t).toISOString().slice(0, 10);

async function libcal(sys) {
  const out = []; const seen = new Set(); const start = Date.now();
  for (let d = 0; d < DAYS; d++) {
    const date = ymd(start + d * 864e5);
    let data; try { data = await fetchJson(`${sys.base}/ajax/calendar/list?c=${sys.cal}&date=${date}&perpage=100&page=1&audience=&cats=&camps=&inc=0`, { fixture: sys.fixture }); }
    catch (e) { log(`libevents ${sys.id} ${date}: ${e.message}`); continue; }
    for (const e of data?.results || []) {
      if (seen.has(e.id)) continue; seen.add(e.id);
      out.push({ id: e.id, title: e.title, text: e.shortdesc || "", loc: e.campus || e.location || "", online: !!e.online_event, tags: [...(e.audiences || []).map(a => a.name), ...(e.categories_arr || []).map(c => c.name)],
        starts: local(e.startdt), ends: local(e.enddt), url: e.url });
    }
    if (process.env.FIXTURES) break;
  }
  return out;
}
async function communico(sys) {
  const req = encodeURIComponent(JSON.stringify({ private: false, date: ymd(Date.now()), days: DAYS, locations: [], ages: [], types: [] }));
  const data = await fetchJson(`${sys.base}/eeventcaldata?event_type=0&req=${req}`, { fixture: sys.fixture });
  return (Array.isArray(data) ? data : []).map(e => ({ id: e.id, title: e.title, text: [e.sub_title, e.description].filter(Boolean).join(" · "), loc: e.location || e.library || "", online: e.event_type === "VIRTUAL",
    tags: [...(e.agesArray || []), ...(e.tagsArray || [])].filter(Boolean), starts: local(e.raw_start_time || e.event_start), ends: local(e.raw_end_time || e.event_end), url: e.url }));
}

export default async function libevents() {
  const outlets = (readJson(resolve(DATA, "feeds", "libraries.json"), { items: [] }).items || []);
  const items = []; const today = Date.now() - 864e5, horizon = Date.now() + (DAYS + 1) * 864e5;
  for (const sys of SYSTEMS) {
    const branches = outlets.filter(o => o.state === sys.state && Number.isFinite(o.lat) && km([o.lat, o.lon], sys.center) <= sys.radiusKm).map(o => ({ ...o, core: core(o.title) }));
    const placeOf = loc => { const c = core(loc); if (!c || ONLINE.test(loc)) return null; return branches.find(b => b.core === c) || branches.find(b => c.includes(b.core) || b.core.includes(c)) || null; };
    let events = [];
    try { events = sys.kind === "libcal" ? await libcal(sys) : await communico(sys); }
    catch (e) { log(`libevents ${sys.id}: ${e.message}`); continue; }
    const skipped = { nodate: 0, closed: 0, window: 0, online: 0, noplace: 0 }; let n = 0;
    for (const e of events) {
      if (!e.starts || !e.title) { skipped.nodate++; continue; }
      if (SKIP.test(e.title)) { skipped.closed++; continue; }
      const t = new Date(e.starts).getTime(); if (!process.env.FIXTURES && (t < today || t > horizon)) { skipped.window++; continue; }
      if (e.online) { skipped.online++; continue; }
      const b = placeOf(e.loc); if (!b) { skipped.noplace++; continue; }
      const kids = KIDS.test(`${e.title} ${e.tags.join(" ")}`);
      items.push(item({
        id: `libevents:${sys.id}:${e.id}`, feedId: "libevents", category: kids ? "kids-and-family" : "education",
        title: e.title, summary: [e.tags.join(", "), e.text.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/https?:\S+/g, "").replace(/\s+/g, " ").trim().slice(0, 400)].filter(Boolean).join(" · "),
        starts: e.starts, ends: e.ends || null, lat: b.lat, lon: b.lon,
        place: b.title, state: sys.state, sourceUrl: e.url || sys.web, sourceName: sys.name,
      })); n++;
    }
    log(`libevents ${sys.id}: ${events.length} events, ${branches.length} branches known → ${n} placed; skipped ${JSON.stringify(skipped)}`);
  }
  return items;
}
