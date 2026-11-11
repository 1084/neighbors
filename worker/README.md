# Neighbors — contribution queue (Cloudflare Worker)

Receives what the app's plus button, Confirm and Flag send; holds it for a person to review; publishes the outcomes to What's new. It stores a three-digit ZIP prefix and a one-day hash of the client address for rate limiting, and nothing else about anyone. Same shape as `open-chambers/worker`.

## Setup (once, from this folder)

```sh
npm install
npx wrangler login                                  # opens the browser; the Cloudflare account that owns johnhubert.llc
npm run db:create                                   # prints a database_id → paste it into wrangler.toml
npm run db:init                                     # creates the tables
openssl rand -hex 32 | npx wrangler secret put ADMIN_KEY    # the review page's key; keep it in your password manager
npm run deploy
```

The custom domain `neighbors-api.johnhubert.llc` is created by the deploy (the zone is on the same account). Then:

- `https://neighbors-api.johnhubert.llc/v1/health` → `{ ok: true, waiting, total }`
- `https://neighbors-api.johnhubert.llc/review` → the review page; paste the key once per browser session

Point the app at it: in `docs/app/index.html`, `NEIGHBORS_CONTRIB` becomes `https://neighbors-api.johnhubert.llc/v1`. The app then sends live, falls back to the on-phone queue if the Worker is unreachable, and reads What's new from `/v1/whats-new`.

## Daily

Open `/review`. Flags are listed first. For a source or item: open the link, check it fits the charter's fence (an institution with public accountability, placeable by ZIP), Approve or Decline with a note. Approved rows appear on What's new as "A neighbor added …" with your note. Ideas get Done with a note that becomes the public outcome. With `GH_TOKEN` set, each approval of a source or item is committed to `data/contrib/approved.json` in the repo at once (one small commit, author "neighbors-queue"), and the nightly `contrib` feed turns that file into items placed at their ZIP. Without the token, "Export approved" downloads the same JSON for you to commit by hand.

### GH_TOKEN (once)

GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token. Name it `neighbors-queue`, expiration a year, repository access **Only select repositories → 1084/neighbors**, permissions **Contents: Read and write** and nothing else. Copy it, then from this folder:

```sh
npx wrangler secret put GH_TOKEN      # paste when prompted; it never goes in a file or a chat
```

`/v1/admin/decide` then returns `committed: { ok: true, count }` on each approval. If it returns `ok: false`, the token has expired or lost the repo; the approval is still saved in D1 and will appear in the next export.

## Endpoints

| Method | Path | Who | Body / query |
| --- | --- | --- | --- |
| POST | `/v1/contribute` | app | `{ kind, zip3, … }` — `source`/`item`: `link, cat, title, zip, when`; `idea`: `text`; `confirm`/`flag`: `id` (+ `why`) |
| GET | `/v1/signals?ids=a,b` | app | confirm and flag counts per item id |
| GET | `/v1/whats-new` | app, public | outcomes, newest first, cached 5 min |
| GET | `/v1/admin/queue?status=new` | review page | bearer `ADMIN_KEY` |
| POST | `/v1/admin/decide` | review page | `{ id, status, note?, public? }` |
| GET | `/v1/admin/export` | review page | approved sources and items |

Limits: 40 contributions per client per day; links must be on `.gov`, `.mil`, `.edu`, `.us` or `.org`; a `price` field is refused outright.
