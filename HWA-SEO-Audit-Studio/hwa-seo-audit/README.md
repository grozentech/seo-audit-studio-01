# HWA SEO Audit Studio

A free, local-first, dependency-free **Node.js 20+** web app with:

- 1 primary domain + up to 2 comparison domains.
- Controlled crawl of 1–20 public HTML pages per website, seeded by internal links and basic sitemap URLs.
- On-page checks: title, description, H1, missing image `alt`, low HTML text, duplicate titles/descriptions.
- Technical checks: HTTP errors, fetch failures, HTTPS, canonical URL, noindex, viewport, language tag, sitemap discovery, large HTML, server fetch time.
- Per-page results, site comparison, categorized issue filters, CSV and JSON exports.
- Public-domain-only URLs, DNS validation and IP pinning, robots.txt checks, page/time limits and rate limiting.
- No API keys, Python, database or paid dependencies required.

## Run on Windows 11

1. Extract ZIP to a folder on your **D:** drive (e.g. `D:\HWA-SEO-Audit`).
2. Install Node.js 20 or newer, if not installed. Open PowerShell in the project folder.
3. Run `node --version` to verify.
4. Run `npm start` (no `npm install` necessary because there are no dependencies).
5. Open **http://127.0.0.1:4173** in the browser. To stop the app, press `Ctrl+C` in PowerShell.
6. Input a URL, optionally toggle competitor analysis and enter two other domains, then click **Analyze websites**.

Run the unit tests: `npm test`.

## Optional password for a server deployment

Locally, no password is required and the server binds to `127.0.0.1` by default.

If deploying behind an **HTTPS-enabled, private, authenticated reverse proxy**, configure `AUDIT_PASSWORD` to a long unique secret, `HOST=0.0.0.0`, and set `PORT` to your hosting provider's assigned port. Set these via secure hosting environment variables, not in source code.

This basic app does **not** manage accounts or persistent audit history. Do not expose it openly on the internet merely by changing the host setting. Add strong authentication and network protections before a public deployment. Do not store your password in the exported reports.

## Scope and accuracy notes

- This is a **server-side HTML-source crawler**. It does **not** render JavaScript, so dynamic websites may show incomplete content or false flags. For JS-heavy sites, consider a future Playwright-powered version.
- The 0–100 value is an **internal illustrative diagnostic heuristic**, not a Google SEO score or ranking prediction. A 100 score does not guarantee traffic, rankings or indexing.
- `robots.txt` may not exist; that alone is not an error. The tool skips disallowed paths, and stops a crawl when the policy is inaccessible.
- Fetch duration here is **not** Lighthouse, PageSpeed Insights, or Core Web Vitals.
- Does not measure backlinks, search traffic, keyword ranking, actual index status or off-page SEO.
- If a host has no public IPv4, the first version skips it. Some sites deny bots, and anti-bot/JavaScript challenges will prevent complete crawling.
- Crawler defaults to eight pages per website, up to twenty, one request at a time. Do not use it to overload third-party servers. Respect website terms and rate limits.
- No live site was published or made public during project creation. Run it on your laptop unless you intentionally configure secure private hosting.
