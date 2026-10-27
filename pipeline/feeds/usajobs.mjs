// USAJOBS: open federal positions, placed by each position's own coordinates.
// Docs: https://developer.usajobs.gov/api-reference/get-api-Search — key from https://developer.usajobs.gov/apirequest/
// Public employers only: this is the whole "work" category's fence. No private job boards, ever.
//
// Env: USAJOBS_API_KEY (required), USAJOBS_USER_AGENT (the email the key was issued to; falls back to support@).
// One nightly walk of every open posting (Fields=Full for the summary), 500 per page.
// A posting with many duty stations (remote / "anywhere in the U.S.") has no local meaning and is dropped.
import { item, fetchJson, log } from "../lib/util.mjs";

const BASE = "https://data.usajobs.gov/api/search";
const MAX_PAGES = 80;          // 80 × 500 = 40,000 positions; USAJOBS usually carries 10–20k
const MAX_LOCATIONS = 8;       // more than this = a national posting, not a local one

export const STATE_CODES = { "Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO","Connecticut":"CT","Delaware":"DE","District of Columbia":"DC","Florida":"FL","Georgia":"GA","Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS","Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD","Massachusetts":"MA","Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY","Puerto Rico":"PR","Guam":"GU","Virgin Islands":"VI","American Samoa":"AS","Northern Mariana Islands":"MP" };

export function stateOf(loc) {
  const sub = String(loc?.CountrySubDivisionCode || "").trim();
  if (STATE_CODES[sub]) return STATE_CODES[sub];
  if (/^[A-Z]{2}$/.test(sub)) return sub;
  const tail = String(loc?.LocationName || "").split(",").pop().trim();
  return STATE_CODES[tail] || null;
}

export function payLine(rem) {
  const r = Array.isArray(rem) ? rem[0] : null; if (!r) return "";
  const fmt = v => { const n = Number(String(v).replace(/[^0-9.]/g, "")); return Number.isFinite(n) && n > 0 ? "$" + Math.round(n).toLocaleString("en-US") : null; };
  const lo = fmt(r.MinimumRange), hi = fmt(r.MaximumRange); if (!lo && !hi) return "";
  const per = { PA: "per year", PH: "per hour", PD: "per day", PW: "per week", BW: "biweekly", PM: "per month" }[r.RateIntervalCode] || String(r.Description || "").toLowerCase();
  return `${lo && hi && lo !== hi ? `${lo}–${hi}` : (lo || hi)} ${per}`.trim();
}

export default async function usajobs() {
  const key = process.env.USAJOBS_API_KEY;
  if (!key && !process.env.FIXTURES) { log("usajobs: USAJOBS_API_KEY not set, skipping"); return []; }
  const headers = { Host: "data.usajobs.gov", "User-Agent": process.env.USAJOBS_USER_AGENT || "support@johnhubert.llc", "Authorization-Key": key || "fixture" };
  const items = []; let dropped = 0, seen = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await fetchJson(`${BASE}?ResultsPerPage=500&Page=${page}&Fields=Full&SortField=opendate&SortDirection=desc`, { headers, fixture: `usajobs-page${page === 1 ? "" : "-" + page}.json` });
    const rows = data?.SearchResult?.SearchResultItems || [];
    for (const row of rows) {
      const d = row.MatchedObjectDescriptor || {}; seen++;
      const locs = (d.PositionLocation || []).filter(l => l && Number.isFinite(+l.Latitude) && Number.isFinite(+l.Longitude) && +l.Latitude !== 0);
      if (!locs.length || locs.length > MAX_LOCATIONS) { dropped++; continue; }
      const pay = payLine(d.PositionRemuneration);
      const sched = (d.PositionSchedule || []).map(s => s.Name).filter(Boolean).join(", ");
      const summary = [d.UserArea?.Details?.JobSummary, [sched, pay].filter(Boolean).join(" · ")].filter(Boolean).join(" ");
      locs.forEach((l, i) => items.push(item({
        id: `usajobs:${row.MatchedObjectId || d.PositionID}:${i}`, feedId: "usajobs", category: "work",
        title: `${d.PositionTitle} — ${d.OrganizationName || d.DepartmentName || "U.S. Government"}`,
        summary, starts: d.PublicationStartDate, ends: d.ApplicationCloseDate,
        lat: +l.Latitude, lon: +l.Longitude, place: l.CityName ? `${l.CityName}${stateOf(l) ? ", " + stateOf(l) : ""}` : l.LocationName, state: stateOf(l),
        sourceUrl: d.PositionURI, sourceName: "USAJOBS", updatedAt: d.PublicationStartDate,
      })));
    }
    const total = +data?.SearchResult?.SearchResultCountAll || 0;
    if (rows.length < 500 || page * 500 >= total || process.env.FIXTURES) break;
  }
  log(`usajobs: ${seen} postings → ${items.length} placed items (${dropped} without a local duty station)`);
  return items;
}
