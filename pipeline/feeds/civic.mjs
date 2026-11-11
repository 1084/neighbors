// Google Civic Information API, electionQuery only: upcoming elections by state (no address, no voter lookup).
// Docs: https://developers.google.com/civic-information/docs/v2 — cache no more than 24 h (we rebuild nightly).
import { item, fetchJson, log } from "../lib/util.mjs";

export default async function civic() {
  const key = process.env.GOOGLE_CIVIC_KEY;
  if (!key && !process.env.FIXTURES) { log("civic: GOOGLE_CIVIC_KEY not set, skipping"); return []; }
  const data = await fetchJson(`https://www.googleapis.com/civicinfo/v2/elections?key=${key}`, { fixture: "civic-elections.json" });
  const items = [];
  const horizon = new Date(Date.now() + 400 * 86400000).toISOString().slice(0, 10);
  for (const e of data?.elections || []) {
    // Google's permanent test fixtures (ids 1001 and 2000, "Test Election", dated years out) are never real
    if (/test election/i.test(e.name || "") || String(e.id) === "1001" || String(e.id) === "2000" || (e.electionDay && e.electionDay > horizon)) continue;
    const m = /state:([a-z]{2})/.exec(e.ocdDivisionId || "");
    const state = m ? m[1].toUpperCase() : null;
    if (!state && e.ocdDivisionId !== "ocd-division/country:us") continue;
    items.push(item({
      id: `civic:${e.id}`, feedId: "civic", category: "elections",
      title: e.name, summary: state ? `Election day in ${state}. Check registration and early-voting dates with your state election office.` : "Federal election day.",
      starts: e.electionDay ? `${e.electionDay}T12:00:00Z` : null, ends: null,
      lat: null, lon: null, place: state || "United States", state,
      sourceUrl: state ? `https://www.vote.gov/register/${state.toLowerCase()}/` : "https://www.vote.gov/", sourceName: "Voting Information Project",
    }));
  }
  if (!items.length) { log("civic: no real elections listed (test fixtures filtered); empty is correct"); items.empty = true; }
  return items;
}
