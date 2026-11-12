// Social Security field offices: SSA's open-data CSV of every office with address and hours
// (https://www.ssa.gov/open/data/FO-RS-Address-Open-Close-Time-App-Devs.html; updated quarterly;
// no coordinates, so each office is placed at its ZIP centroid, which is within a mile or two).
import { item, log } from "../lib/util.mjs";
import { fetchCached, parseCsv, titleCase } from "../lib/files.mjs";
import { zipPoint } from "../lib/geo.mjs";

const URL = "https://www.ssa.gov/data/FO-Address-Open-Close-Times.csv";
const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

export default async function ssa() {
  const rows = parseCsv(await fetchCached(URL, "ssa-field-offices.csv", { fixture: "ssa-field-offices.csv" }));
  const items = []; let placed = 0;
  for (const r of rows) {
    const t = k => String(r[k] || "").trim();
    const zip = t("ZIP CODE").slice(0, 5); const pt = zipPoint(zip); if (!pt) continue;
    const [lat, lon] = pt;
    const addr = [t("ADDRESS LINE 2"), t("ADDRESS LINE 3")].filter(x => x && !/^SOCIAL SECURITY$/i.test(x)).map(titleCase).join(", ") || titleCase(t("ADDRESS LINE 1"));
    // hours: collapse "9:00 AM–4:00 PM Mon–Fri" when every weekday matches
    const spans = DAYS.map(d => `${t(d + " OPEN TIME")}–${t(d + " CLOSE TIME")}`);
    const hours = spans.every(s => s === spans[0]) ? (spans[0] === "–" ? "" : `${spans[0]} Mon–Fri`) : spans.map((s, i) => `${titleCase(DAYS[i].slice(0, 3))} ${s}`).join(", ");
    items.push(item({
      id: `ssa:${t("OFFICE CODE")}`, feedId: "ssa", category: "public-services",
      title: `Social Security office, ${titleCase(t("OFFICE NAME"))}`,
      summary: [addr, [titleCase(t("CITY")), t("STATE"), zip].filter(Boolean).join(" "), t("PHONE"), hours, "Many services are online at ssa.gov; appointments are recommended"].filter(Boolean).join(" · "),
      starts: null, ends: null, lat, lon,
      place: [titleCase(t("CITY")), t("STATE")].filter(Boolean).join(", "), state: t("STATE"),
      sourceUrl: "https://www.ssa.gov/locator/", sourceName: "Social Security Administration",
    })); placed++;
  }
  log(`ssa: ${rows.length} offices → ${placed} placed`);
  return items;
}
