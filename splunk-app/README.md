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

## Still unverified - needs a real Splunk Cloud instance

AppInspect only checks packaging/security *rules*; it doesn't render pages.
The one real open question is whether Splunk Cloud's platform-enforced CSP
(not customer-editable) allows this page - one huge inline `<script>`, no
external resources - to actually execute when served from
`appserver/static/` and opened via the nav link's
`/static/app/cyberchef/CyberChef_standalone.html` URL. This needs testing
on an actual Cloud trial/sandbox org; I have no way to verify it from here.

The nav-link syntax itself (`<a href="..." target="_blank" default="true">`)
is based on Splunk Community reports, not official docs (docs.splunk.com
blocks automated fetches) - also worth a quick manual check once a sandbox
is available.

## Not yet done

- Confirming the private-app install path/process for your specific Splunk
  Cloud org (self-service app install vs. a support ticket) - this is an
  account/org-specific question, not a code question.
- Deciding whether to commit the built `cyberchef.spl` package here or treat
  it as a release artifact built on demand (parallel to the `dist/index.html`
  discussion for the main repo).
