# Data shape

Every feed is normalized to one item shape, then bucketed into tiles. The app never sees a feed's native format.

## Item

```json
{
  "id": "nws:urn:oid:2.49.0.1.840.0.abc",
  "feedId": "nws",
  "category": "public-safety",
  "title": "Flood Watch",
  "summary": "…one or two sentences from the source, never written by us…",
  "starts": "2026-10-07T18:00:00Z",
  "ends": "2026-10-08T06:00:00Z",
  "lat": 38.80,
  "lon": -77.05,
  "place": "Fairfax County, VA",
  "state": "VA",
  "sourceUrl": "https://api.weather.gov/alerts/…",
  "sourceName": "National Weather Service",
  "updatedAt": "2026-10-07T17:40:00Z"
}
```

- `category` is one of the six in CHARTER.md.
- `lat`/`lon` may be `null` for a national item (a recall). Such items go to `tiles/national.json`.
- `state` is the two-letter code when known; items with a state and no point (an election) go to `tiles/state-VA.json`.
- There is no price field, by design.
- `starts`/`ends` are ISO 8601 UTC or `null` (a park has no start).

## Tiles

Tiles are 2° × 2° squares named by their south-west corner: `tiles/38_-78.json` covers lat 38–40, lon −78 to −76. A tile file is a JSON array of items. `tiles/index.json` lists every tile with its item count and the build time.

The app computes the user's ZCTA point from `data/zcta.json`, lists the tiles whose squares intersect the circle of the chosen radius, fetches them, then filters by haversine distance on the phone. At 100 miles that is at most 4 tiles in the lower 48; the ZIP never leaves the device.

## Feed outputs

Each adapter writes `data/feeds/{feedId}.json` (its items) and the build commits it. The regression guard compares a fresh run with the committed file: if a feed returns fewer than half its committed items, the committed file is kept and the feed is flagged in `tiles/index.json` under `stale`.
