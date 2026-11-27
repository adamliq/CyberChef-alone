/**
 * Updates the CyberChef Splunk app from the repo's current standalone build
 * and repackages it as a .spl file.
 *
 * Run from the repository root after `npm run build-standalone` (or let
 * `npm run build-splunk-app` do both). Copies the freshly-built
 * standalone HTML into the app, keeps app.conf's version in sync with
 * package.json so it can't silently drift, and tars/gzips the result.
 *
 * @author n1474335 [n1474335@gmail.com]
 * @copyright Crown Copyright 2026
 * @license Apache-2.0
 */

import fs from "fs";
import path from "path";
import process from "process";
import { execFileSync } from "child_process";

const rootDir = process.cwd();
const splunkAppDir = path.join(rootDir, "splunk-app");
const appDir = path.join(splunkAppDir, "cyberchef");

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
const version = pkg.version;

const standaloneSrc = path.join(rootDir, "index.html");
if (!fs.existsSync(standaloneSrc)) {
    console.error("index.html not found - run `npm run build-standalone` first."); // eslint-disable-line no-console
    process.exit(1);
}

console.log(`Syncing Splunk app to CyberChef v${version}...`); // eslint-disable-line no-console

// Copy in the current standalone build
const staticDest = path.join(appDir, "appserver", "static", "CyberChef_standalone.html");
fs.copyFileSync(standaloneSrc, staticDest);

// Keep app.conf's version in sync with package.json, so it can't silently
// go stale on the next CyberChef release.
const appConfPath = path.join(appDir, "default", "app.conf");
let appConf = fs.readFileSync(appConfPath, "utf8");
appConf = appConf.replace(/^version = .*$/gm, `version = ${version}`);
fs.writeFileSync(appConfPath, appConf);

// Package as a .spl (a plain tar.gz with the app directory at its root)
const splFile = path.join(splunkAppDir, "cyberchef.spl");
execFileSync("tar", ["-czf", splFile, "cyberchef"], { cwd: splunkAppDir });

const sizeMb = (fs.statSync(splFile).size / (1024 * 1024)).toFixed(1);
console.log(`Written ${splFile} (${sizeMb} MiB)`); // eslint-disable-line no-console
