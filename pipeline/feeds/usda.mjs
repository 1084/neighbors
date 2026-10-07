// USDA Local Food Portal: farmers markets, queried one state at a time, geocoded by ZIP.
// Docs: https://www.usdalocalfoodportal.com/fe/datasharing/ — key by registration form.
import { item, fetchJson, log } from "../lib/util.mjs";
import { zipPoint } from "../lib/geo.mjs";

export const STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR".split(" ");

export default async function usda() {
  const key = process.env.USDA_API_KEY;
  if (!key && !process.env.FIXTURES) { log("usda: USDA_API_KEY not set, skipping"); return []; }
  const items = [];
  const states = process.env.FIXTURES ? ["VA"] : STATES;
  for (const st of states) {
    const data = await fetchJson(`https://www.usdalocalfoodportal.com/api/farmersmarket/?apikey=${key}&state=${st.toLowerCase()}`, { fixture: `usda-${st}.json` }).catch(() => null);
    for (const m of (Array.isArray(data) ? data : data?.data || [])) {
      const zip = String(m.location_zipcode || "").slice(0, 5);
      const pt = (m.location_y && m.location_x) ? [+m.location_y, +m.location_x] : zipPoint(zip);
      if (!pt) continue;
      items.push(item({
        id: `usda:${m.listing_id || m.id || `${st}-${m.listing_name}`}`, feedId: "usda", category: "public-services",
        title: m.listing_name, summary: [m.location_address, m.operation_hours || m.listing_desc].filter(Boolean).join(" · "),
        starts: null, ends: null, lat: pt[0], lon: pt[1],
        place: [m.location_city, m.location_state].filter(Boolean).join(", "), state: st,
        sourceUrl: m.media_website || `https://www.usdalocalfoodportal.com/fe/fdirectory_farmersmarket/`,
        sourceName: "USDA Local Food Directories", updatedAt: m.update_time,
      }));
    }
  }
  return items;
}
