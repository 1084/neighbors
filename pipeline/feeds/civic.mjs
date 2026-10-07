// Google Civic Information API, electionQuery only: upcoming elections by state (no address, no voter lookup).
// Docs: https://developers.google.com/civic-information/docs/v2 — cache no more than 24 h (we rebuild nightly).
import { item, fetchJson, log } from "../lib/util.mjs";

export default async function civic() {
  const key = process.env.GOOGLE_CIVIC_KEY;
  if (!key && !process.env.FIXTURES) { log("civic: GOOGLE_CIVIC_KEY not set, skipping"); return []; }
  const data = await fetchJson(`https://www.googleapis.com/civicinfo/v2/elections?key=${key}`, { fixture: "civic-elections.json" });
  const items = [];
  for (const e of data?.elections || []) {
    const m = /state:([a-z]{2})/.exec(e.ocdDivisionId || "");
    const state = m ? m[1].toUpperCase() : null;
    if (!state && e.ocdDivisionId !== "ocd-division/country:us") continue;
    items.push(item({
      id: `civic:${e.id}`, feedId: "civic", category: "elections",
      title: e.name, summary: state ? `Election day in ${state}. Check registration and early-voting dates with your state election office.` : "Federal election day.",
      starts: e.electionDay ? `${e.electionDay}T12:00:00Z` : null, ends: null,
      lat: null, lon: null, place: state || "United States", state,
      sourceUrl: "https://www.vote.gov/", sourceName: "Voting Information Project via Civic Information API",
    }));
  }
  return items;
}
