# CyberChef Splunk app (Phase 0 spike)

A minimal Splunk app that adds one navigation entry opening CyberChef's
standalone, fully self-contained build. No search-time (SPL) integration -
this is a UI tool only, and no data an analyst pastes into it ever leaves
their browser.

```
cyberchef/
├── default/
│   ├── app.conf                  # app id, version, label, description
│   └── data/ui/nav/default.xml   # single nav entry -> the static HTML file
├── metadata/
│   └── default.meta              # read access for all roles, incl. Cloud's sc_admin
├── appserver/static/
│   └── CyberChef_standalone.html # copy of the repo's root index.html
└── static/
    ├── appIcon.png / appIcon_2x.png        # 36x36 / 72x72, app list icon
    └── appIconAlt.png / appIconAlt_2x.png  # same, for the Splunk bar app menu
```

## Building / updating the package

The app ships a *copy* of the repo's standalone build, since the two have
different jobs. Regenerate it after any `npm run build-standalone`:

```bash
cp index.html splunk-app/cyberchef/appserver/static/CyberChef_standalone.html
cd splunk-app && tar -czf cyberchef.spl cyberchef
```

## AppInspect results (Splunk Cloud vetting)

Verified with `splunk-appinspect inspect splunk-app/cyberchef.spl --mode precert
--included-tags cloud --included-tags private_victoria` (also checked against
`private_classic`), using `splunk-appinspect` 4.4.0 on 2026-11-27:

```
error: 0  failure: 0  future_failure: 0  skipped: 1  warning: 2  success: 85
```

**Zero errors or failures.** The two remaining warnings are both known false
positives worth having an explanation ready for, in case a human reviewer
flags them during Cloud vetting:

1. `check_hostnames_and_ips` - its "public IP" pattern matches on dotted
   sequences like `2.5.4.3`, which are X.509 distinguished-name OIDs
   (commonName, etc.) inside the bundled certificate-parsing code, not real
   IP addresses.
2. `check_for_existence_of_python_code_block_in_mako_template` - triggers on
   `${...}` JavaScript template-literal syntax that appears throughout the
   ~44 MB of embedded application code; there is no actual Mako template
   anywhere in this app.

Contrary to what I'd assumed before actually running the tool: there is no
AppInspect check that flags `eval()`/`Function()` usage in bundled JS (I
checked `splunk-appinspect list checks` directly). The app's existing
lazy-module-loading mechanism, which does use `eval()`, did not need to be
reworked for this.

## Docker test (Splunk Enterprise)

Verified end-to-end against the official `splunk/splunk:latest` Docker image
(mounted this app directly at `/opt/splunk/etc/apps/cyberchef`, logged in via
a real headless-browser session, Chromium/Playwright):

- **The nav entry renders and resolves correctly.** Splunk rewrote our
  `<a href="/static/app/cyberchef/CyberChef_standalone.html" target="_blank">`
  into its cache-busted form (`/static/@<hash>/app/cyberchef/...`) and it
  opened the file in a new tab, confirming the community-sourced nav syntax
  is in fact correct and current.
- **The page fully executes when served through Splunk**, not just from
  `file://`: 551 operations rendered, and baking `MD5()` over `hello`
  produced the correct hash - exercising the lazy-module-loader (`eval`)
  and Blob-based Web Worker machinery end-to-end, not just a static render.
- **No `Content-Security-Policy` header was present at all** on any
  response (checked both raw HTTP headers and the browser's own CSP
  violation reporting) - zero CSP violations.
- A handful of unrelated 404s appeared (`structured_data_service`,
  `dmc-conf/settings`, `federated_analytics`) - these are Splunk's own
  backend calls for optional platform features not configured on this
  bare test instance, unrelated to this app.

**Caveat:** this is a generic Splunk Enterprise Docker image, not an actual
Splunk Cloud tenant. Splunk Cloud sometimes adds a hosting-layer CSP in
front of splunkd that a self-hosted image can't reproduce, so this result
substantially de-risks the CSP concern without being 100%
Cloud-specific proof. Worth a quick re-check (reload the page, open
DevTools console, confirm no CSP errors) the first time this is actually
installed on a Cloud org - but at this point that's a confirmation step,
not an open design question.

## Not yet done

- Confirming the private-app install path/process for your specific Splunk
  Cloud org (self-service app install vs. a support ticket) - this is an
  account/org-specific question, not a code question.
- Deciding whether to commit the built `cyberchef.spl` package here or treat
  it as a release artifact built on demand (parallel to the `dist/index.html`
  discussion for the main repo).
