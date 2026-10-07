# Sources

Policy: official or recognized-nonprofit source · free to use · national coverage · each item carries a location we can place on a map · nothing in it is for sale. Full inventory with terms: the "Neighbors — Feed Inventory" doc in the workshop.

| Feed id | Source | Verdict | Key | Terms read | Notes |
| --- | --- | --- | --- | --- | --- |
| nws | api.weather.gov alerts | Day one | none (User-Agent) | 2026-10-07 | Open data; retry after 5 s on 429 |
| recalls | openFDA enforcement + CPSC SaferProducts | Day one | FDA_API_KEY optional | 2026-10-07 | National, no location |
| nps | developer.nps.gov | Day one | NPS_API_KEY | | Hourly cap: confirm |
| ridb | ridb.recreation.gov | Day one | RIDB_API_KEY | | Public domain |
| usda | usdalocalfoodportal.com | Day one | USDA_API_KEY | | Queried per state; geocoded by ZIP |
| civic | Google Civic Information electionQuery | Day one | GOOGLE_CIVIC_KEY | 2026-10-07 | Cache ≤ 24 h |
| airnow | AirNow | Day one (live, Worker) | AIRNOW_API_KEY | | Hourly, not nightly |
| ipaws | FEMA IPAWS All-Hazards | Later | MOA | | Applied: |
