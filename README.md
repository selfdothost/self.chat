# self.chat

**The self.ai chat client — a SvelteKit web app (native Android → iOS → Qt to
follow) that talks to the self.ai API server.**

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

---

self.chat is the client half of the `selfshipyard/selfai` web/API tier. It was
split out of the old self.ai monolith so the UI can ship on its own cadence and,
later, be reused by native clients against the same API.

- **self.chat** (this repo) — the client. SvelteKit, built static, served by
  nginx. Web first; Android, iOS, and Qt clients are net-new and come later.
- **[self.ai](https://github.com/selfdothost/self.ai)** — the FastAPI **API
  server** plus the docker files for the whole stack. The primary deploy repo.

## How it reaches the API

The app calls the API with **same-origin relative URLs** (`/api`, `/ws`,
`/ollama`, `/openai`, …; see `src/lib/constants.ts`, `WEBUI_BASE_URL=''`). A
single VIP is path-routed by the deploy's ingress: `/` to this container, the
API paths to the self.ai pod. No API host is baked into the build, and the
web client needs no CORS or cross-origin token handling. Native clients
(which are not same-origin) will set an explicit API base URL — a later,
post-web change.

## Fork posture (read before touching anything)

self.chat carries the frontend of a **hard fork of Open-WebUI v0.5.4** — the last
MIT-licensed release. **No code from post-v0.5.4 Open-WebUI may ever be merged,
cherry-picked, or copied in.** We are the upstream. The full firewall and license
record lives in **[self.ai/DIVERGENCE.md](https://github.com/selfdothost/self.ai/blob/public-alpha/DIVERGENCE.md)**. The MIT
baseline is retained in `NOTICE`; the combined work and our additions are
GPL-3.0. self.chat is **not affiliated with or endorsed by Open-WebUI** — it was
forked from Open-WebUI's MIT v0.5.4 for its multi-user focus.

## Develop

```bash
npm ci
npm run dev      # vite dev server (expects the self.ai API reachable)
npm run build    # static build -> ./build (adapter-static)
npm run preview  # serve the production build locally
```

Node `>=18 <=22`. The build is self-contained — no backend in this repo.

## Container

`Dockerfile` builds the static bundle and serves it with nginx on `:8080`
(`nginx.conf` does the SPA fallback). The image is frontend-only — it does not
bundle or proxy the API; the deploy's ingress handles that.

## License

GPL-3.0 (see `LICENSE`). The Open-WebUI v0.5.4 MIT baseline is retained in
`NOTICE`.
