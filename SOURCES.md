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
| usajobs | data.usajobs.gov Search API | Phase 2 (work) | USAJOBS_API_KEY + USAJOBS_USER_AGENT (the email the key was issued to) | 2026-10-27 | Public employers only; one nightly walk, 500/page; positions placed by their own lat/long; postings with >8 duty stations or no coordinates dropped |
| schools | NCES EDGE geocoded public school file | Phase 2 (education) | none | 2026-10-30 | Annual zip (~29 MB); every public school by address geocode; links to the CCD school page |
| libraries | IMLS Public Libraries Survey outlet file | Phase 2 (education) | none | 2026-10-30 | Annual zip; central/branch/bookmobile outlets with coordinates and hours; IMLS_ZIP_URL points at the current FY |
| healthcenters | HRSA Health Center sites CSV | Phase 2 (health) | none | 2026-10-30 | Refreshed daily by HRSA; active sites only; coordinates in the file |
| hospitals | CMS Hospital General Information (Provider Data Catalog API) | Phase 2 (health) | none | 2026-10-30 | No coordinates in the data: placed at ZIP centroid; links to Care Compare |
| airnow | AirNow | Day one (live, Worker) | AIRNOW_API_KEY | | Hourly, not nightly |
| ipaws | FEMA IPAWS All-Hazards | Later | MOA | | Applied: |
