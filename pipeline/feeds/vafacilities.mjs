// Department of Veterans Affairs facilities: medical centers, clinics, benefits offices, Vet Centers
// and cemeteries, from the VA Facilities API (Lighthouse). https://developer.va.gov/explore/api/va-facilities
// Key: VA_API_KEY (free; "apikey" header). One bulk call returns every facility with coordinates.
import { item, fetchJson, log } from "../lib/util.mjs";

const URL = "https://api.va.gov/services/va_facilities/v0/facilities/all";
const TYPE = { va_health_facility: "VA health care", va_benefits_facility: "VA benefits office", vet_center: "Vet Center", va_cemetery: "VA national cemetery" };

export default async function vafacilities() {
  const key = process.env.VA_API_KEY;
  if (!key && !process.env.FIXTURES) { log("vafacilities: VA_API_KEY not set, skipping"); return []; }
  const data = await fetchJson(URL, { headers: { apikey: key || "" }, fixture: "va-facilities.json" });
  const list = data?.data || data?.features || [];
  const items = [];
  for (const f of list) {
    const a = f.attributes || f.properties || {}; const g = f.geometry?.coordinates;
    const lat = +(a.lat ?? g?.[1]), lon = +(a.long ?? a.lon ?? g?.[0]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0) continue;
    if (a.operating_status?.code && /closed/i.test(a.operating_status.code)) continue;
    const ad = a.address?.physical || {};
    const type = TYPE[a.facility_type] || "VA facility";
    const hrs = a.hours && Object.entries(a.hours).filter(([, v]) => v && !/closed/i.test(v)).length ? `open ${(a.hours.monday || Object.values(a.hours).find(Boolean) || "").toLowerCase()} weekdays` : "";
    items.push(item({
      id: `va:${f.id || a.unique_id}`, feedId: "vafacilities", category: a.facility_type === "va_health_facility" ? "health" : "public-services",
      title: a.name, summary: [type, a.classification, [ad.address_1, ad.address_2].filter(Boolean).join(" "), [ad.city, ad.state, (ad.zip || "").slice(0, 5)].filter(Boolean).join(" "), a.phone?.main, hrs].filter(Boolean).join(" · "),
      starts: null, ends: null, lat, lon,
      place: [ad.city, ad.state].filter(Boolean).join(", "), state: ad.state,
      sourceUrl: a.website || `https://www.va.gov/find-locations/facility/${f.id || a.unique_id}`, sourceName: "U.S. Department of Veterans Affairs",
    }));
  }
  log(`vafacilities: ${list.length} facilities → ${items.length} placed`);
  return items;
}
