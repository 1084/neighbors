// Virginia Department of Elections: the "Upcoming Elections" calendar, scraped from the HTML page
// (there is no feed). One state only, by design: the Civic Information API is empty off-season, and
// Virginia is where the first testers are. A second state is a copy of this file with its own parser.
//
// What it emits, all in the elections category and the VA state tile:
//   - one item per election day, with the contests the page lists as the summary
//   - that election's registration deadline, early-voting window and mail-ballot deadline, each dated,
//     each linking to the Citizen Portal or the registrar lookup, so the link is there when the date is
//   - one standing item, never dated, "Register to vote or update your registration": Virginia has
//     same-day registration, so the link belongs in the feed every day of the year
//
// Page: https://www.elections.virginia.gov/casting-a-ballot/calendars-schedules/upcoming-elections.html
// Structure the parser relies on: an <h2> per election, "Month D, YYYY - Title"; under it a short run of
// lines naming the contests (or a locality for a special), then "Deadlines:" bullets in M/D/YYYY:
//   Register to Vote/Update Registration: 10/23/2026
//   Early in-person voting: 9/18/2026 through 10/31/2026
//   Apply for ballot to be mailed to you: through 10/23/2026
// Anything the parser can't read is skipped, never guessed; the log says what it found.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { item, log, FIXTURES, USER_AGENT, sleep } from "../lib/util.mjs";

const PAGE = "https://www.elections.virginia.gov/casting-a-ballot/calendars-schedules/upcoming-elections.html";
const REGISTER = "https://vote.elections.virginia.gov/VoterInformation";
const REGISTRAR = "https://vote.elections.virginia.gov/VoterInformation/PublicContactLookup";
const EARLY = "https://www.elections.virginia.gov/casting-a-ballot/early-voting-office-locations/";
const SOURCE = "Virginia Department of Elections";

async function fetchText(url, fixture) {
  if (process.env.FIXTURES) return readFileSync(resolve(FIXTURES, fixture), "utf8");
  for (let i = 0; i <= 2; i++) {
    try { const r = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "text/html" } }); if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`); return await r.text(); }
    catch (e) { if (i === 2) throw e; await sleep(1500 * (i + 1)); }
  }
}

// HTML → lines of text. Block elements end a line; entities decoded; headings marked so the parser can find them.
function toLines(html) {
  const main = (/<main[\s\S]*?<\/main>/i.exec(html) || [html])[0];
  return main
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
    .replace(/<h2[^>]*>/gi, "\n@@H2 ").replace(/<\/h2>/gi, "\n")
    .replace(/<(?:br|\/p|\/li|\/div|\/tr|\/h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|’/g, "'").replace(/&quot;/g, '"').replace(/&[a-z]+;/g, " ")
    .split("\n").map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}

const MONTHS = "january february march april may june july august september october november december".split(" ");
const longDate = s => { const m = /([A-Za-z]+) (\d{1,2}), (\d{4})/.exec(s); if (!m) return null; const mo = MONTHS.indexOf(m[1].toLowerCase()); return mo < 0 ? null : `${m[3]}-${String(mo + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`; };
const shortDate = s => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s); return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null; };
const noon = d => (d ? `${d}T12:00:00Z` : null);
const endOfDay = d => (d ? `${d}T22:00:00Z` : null); // 5 p.m. Eastern, give or take DST; the page's own deadlines are 5:00 p.m.
const pretty = d => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function parse(html) {
  const lines = toLines(html);
  const elections = [];
  let cur = null;
  for (const line of lines) {
    if (line.startsWith("@@H2 ")) {
      const h = line.slice(5); const day = longDate(h);
      if (!day) { cur = null; continue; }
      cur = { day, title: h.replace(/^[A-Za-z]+ \d{1,2}, \d{4}\s*[-–—:]?\s*/, "").trim() || "Election", contests: [], reg: null, earlyFrom: null, earlyTo: null, mail: null, locality: null };
      elections.push(cur); continue;
    }
    if (!cur) continue;
    let m;
    if ((m = /^Register to Vote\/?Update Registration:?\s*(.+)$/i.exec(line))) { cur.reg = shortDate(m[1]); continue; }
    if ((m = /^Early in-person voting:?\s*(.+)$/i.exec(line))) { const ds = m[1].match(/\d{1,2}\/\d{1,2}\/\d{4}/g) || []; cur.earlyFrom = shortDate(ds[0] || ""); cur.earlyTo = shortDate(ds[1] || ""); continue; }
    if ((m = /^Apply for (?:a )?ballot to be mailed to you:?\s*(.+)$/i.exec(line))) { cur.mail = shortDate(m[1]); continue; }
    if (/^(Deadlines|More information|Early, in-person voting period|Apply for a ballot)/i.test(line)) continue;
    // the lines between the heading and "Deadlines:" name the contests (or, for a special, the locality)
    if (cur.reg === null && cur.contests.length < 8 && line.length < 140 && !/\d{1,2}\/\d{1,2}\/\d{4}/.test(line) && !/^\*+/.test(line)) {
      cur.contests.push(line.replace(/\*+$/, "").trim());
      if (!cur.locality && /^([A-Z][A-Za-z.' ]+ (?:County|City))\b/.test(line)) cur.locality = RegExp.$1;
    }
  }
  return elections;
}

export default async function vaElections() {
  const html = await fetchText(PAGE, "va-upcoming-elections.html");
  const elections = parse(html);
  const today = new Date().toISOString().slice(0, 10);
  const items = [];
  const base = { feedId: "va-elections", category: "elections", lat: null, lon: null, state: "VA", sourceName: SOURCE };
  // the standing registration link: Virginia registers voters year round (same-day registration since 2022)
  items.push(item({ ...base, id: "va-elections:register", title: "Register to vote or update your registration (Virginia)",
    summary: "Online through the Citizen Portal with a Virginia DMV ID, or on paper at your general registrar's office. After a registration deadline, you can still register and vote a provisional ballot in person through Election Day.",
    starts: null, ends: null, place: "Virginia", sourceUrl: REGISTER }));
  for (const e of elections) {
    if (e.day < today) continue;
    const when = pretty(e.day); const place = e.locality || "Virginia";
    const contests = e.contests.join(" · ");
    items.push(item({ ...base, id: `va-elections:${e.day}`, title: `${e.title}, ${when}`, summary: contests || `Election day in ${place}.`, starts: noon(e.day), ends: null, place, sourceUrl: PAGE }));
    if (e.reg && e.reg >= today) items.push(item({ ...base, id: `va-elections:${e.day}:register`, title: `Register by ${pretty(e.reg)} for the ${when} election`,
      summary: `Last day to register or update your registration online or by mail for the ${e.title.toLowerCase()} on ${when}. After that, same-day registration with a provisional ballot runs through Election Day.`,
      starts: endOfDay(e.reg), ends: endOfDay(e.reg), place, sourceUrl: REGISTER }));
    if (e.earlyFrom && e.earlyTo && e.earlyTo >= today) items.push(item({ ...base, id: `va-elections:${e.day}:early`, title: `Early in-person voting, ${pretty(e.earlyFrom)} to ${pretty(e.earlyTo)}`,
      summary: `Vote early at your general registrar's office or a satellite location for the ${when} election. Open through 5:00 p.m. on the last day.`,
      starts: noon(e.earlyFrom), ends: endOfDay(e.earlyTo), place, sourceUrl: EARLY }));
    if (e.mail && e.mail >= today) items.push(item({ ...base, id: `va-elections:${e.day}:mail`, title: `Apply by ${pretty(e.mail)} for a mailed ballot, ${when} election`,
      summary: "Your request must reach your general registrar's office by 5:00 p.m. Apply online through the Citizen Portal.",
      starts: endOfDay(e.mail), ends: endOfDay(e.mail), place, sourceUrl: REGISTER }));
  }
  log(`va-elections: ${elections.length} elections on the page, ${items.length} items`);
  return items;
}
