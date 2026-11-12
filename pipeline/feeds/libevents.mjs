// Library event calendars: dated programs at branches, the richest kids-and-family source there is.
// Each library system publishes an iCal feed (Springshare LibCal) or per-event ICS (Communico); this
// adapter reads a list of systems and places each event at its branch. Branch coordinates come from
// the IMLS outlet file already in data/feeds/libraries.json, matched by name, with a per-system
// override table for names that differ. Audience decides the category:
//   children/teens/family   → kids-and-family
//   everything else         → education (a public program at a library)
// Add a system: one row in SYSTEMS (name, feed, state, match hints). No key, no scraping of HTML.
import { resolve } from "node:path";
import { item, log, DATA, readJson } from "../lib/util.mjs";
import { fetchText, parseIcal } from "../lib/ical.mjs";

const SYSTEMS = [
  { id: "fcpl", name: "Fairfax County Public Library", state: "VA", kind: "libcal",
    feed: "https://librarycalendar.fairfaxcounty.gov/ical_subscribe.php?src=p&cid=6524", fixture: "libcal-fcpl.ics",
    web: "https://librarycalendar.fairfaxcounty.gov/calendar", imlsName: /fairfax county public library/i,
    // LOCATION in the feed is the branch's short name; IMLS has the full outlet name
    alias: { "ALL": null, "Virtual": null, "Online": null } },
  { id: "alexlib", name: "Alexandria Library", state: "VA", kind: "communico",
    feed: "https://alexlibraryva.org/events?r=thismonth", fixture: "communico-alexandria.html",
    web: "https://alexlibraryva.org/events", imlsName: /alexandria (public )?library/i, alias: {} }
];
const KIDS = /\b(babies|toddler|preschool|children|child|kids?|family|families|teen|tween|storytime|story time|junior|youth|lego|homeschool)\b/i;
const SKIP = /\b(closed|holiday|branches? will be closed)\b/i;

export default async function libevents() {
  const outlets = (readJson(resolve(DATA, "feeds", "libraries.json"), { items: [] }).items || []);
  const items = []; const today = Date.now() - 864e5, horizon = Date.now() + 60 * 864e5;
  for (const sys of SYSTEMS) {
    const branches = outlets.filter(o => o.state === sys.state && (o.summary || "").toLowerCase().includes("library"));
    const placeOf = (loc) => {
      if (!loc) return null; const a = sys.alias[loc]; if (a === null) return null; const name = (a || loc).toLowerCase().replace(/\s+(branch|regional|community)?\s*library$/i, "").trim();
      return branches.find(b => b.title.toLowerCase().includes(name)) || branches.find(b => name.includes(b.title.toLowerCase().replace(/\s+(branch|regional|community)?\s*library$/i, "").trim()) && name.length > 4) || null;
    };
    let events = [];
    try {
      if (sys.kind === "libcal") {
        const ics = await fetchText(sys.feed, sys.fixture);
        events = parseIcal(ics).map(e => ({ id: e.UID || e.URL, title: e.SUMMARY, text: e.DESCRIPTION, loc: e.LOCATION, cats: e.CATEGORIES || [], starts: e.DTSTART?.iso, ends: e.DTEND?.iso, allDay: !!e.DTSTART?.allDay, url: e.URL, geo: e.GEO }));
      } else if (sys.kind === "communico") {
        // the events page is JS-rendered, but each event's ICS is public: harvest ids from the page, then read each ICS
        const html = await fetchText(sys.feed, sys.fixture);
        const ids = [...new Set([...html.matchAll(/\/event\/(\d{6,})/g)].map(m => m[1]))].slice(0, 150);
        for (const id of ids) {
          try { const e = parseIcal(await fetchText(`https://calendar-generator.communico.co/attend/${id}`, `communico-${id}.ics`))[0]; if (e) events.push({ id, title: e.SUMMARY, text: e.DESCRIPTION, loc: (e.LOCATION || "").split("\n")[0], cats: e.CATEGORIES || [], starts: e.DTSTART?.iso, ends: e.DTEND?.iso, allDay: !!e.DTSTART?.allDay, url: e.URL || `https://alexlibraryva.org/event/${id}`, geo: e.GEO }); } catch {}
        }
      }
    } catch (e) { log(`libevents ${sys.id}: ${e.message}`); continue; }
    let n = 0;
    for (const e of events) {
      if (!e.starts || !e.title || SKIP.test(e.title)) continue;
      const t = new Date(e.starts).getTime(); if (t < today || t > horizon) continue;
      const b = e.geo ? null : placeOf(e.loc); const lat = e.geo?.[0] ?? b?.lat, lon = e.geo?.[1] ?? b?.lon;
      if (lat == null || lon == null) continue; // an online or unplaceable event is not local
      const kids = KIDS.test(`${e.title} ${e.text || ""} ${e.cats.join(" ")}`);
      items.push(item({
        id: `libevents:${sys.id}:${e.id}`, feedId: "libevents", category: kids ? "kids-and-family" : "education",
        title: e.title, summary: [e.cats.join(", "), (e.text || "").replace(/https?:\S+/g, "").trim()].filter(Boolean).join(" · "),
        starts: e.starts, ends: e.ends || null, lat, lon,
        place: b?.title || e.loc || sys.name, state: sys.state,
        sourceUrl: e.url || sys.web, sourceName: sys.name,
      })); n++;
    }
    log(`libevents ${sys.id}: ${events.length} events → ${n} placed, upcoming`);
  }
  return items;
}
