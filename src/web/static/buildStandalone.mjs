/**
 * Packages a production build of CyberChef (as produced by `grunt prod` in
 * build/prod/) into a single, self-contained HTML file with no external
 * dependencies. The result can be opened directly from disk or served from
 * anywhere with no other files alongside it.
 *
 * This works by inlining the main JS bundle, CSS, fonts, icons and images as
 * data URIs, and by embedding the source of CyberChef's lazily-loaded
 * operation modules (e.g. Ciphers, Crypto, Compression) directly in the page.
 * ChefWorker.js has been modified to request these embedded module sources
 * from the main thread over postMessage instead of fetching them over the
 * network when it detects it is running in a standalone build.
 *
 * Known limitation: the Optical Character Recognition operation depends on
 * Tesseract's own worker, WASM core and per-language trained data files
 * (around 16 MB), which are not embedded here due to their size and the
 * complexity of Tesseract's own nested asset-loading logic. That operation
 * will not work when the standalone file is used entirely on its own.
 *
 * @author n1474335 [n1474335@gmail.com]
 * @copyright Crown Copyright 2026
 * @license Apache-2.0
 */

import fs from "fs";
import path from "path";
import process from "process";

const rootDir = process.cwd();
const prodDir = path.join(rootDir, "build", "prod");
const assetsDir = path.join(prodDir, "assets");

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));

/**
 * Reads a file from within build/prod as a Buffer.
 *
 * @param {string} relPath
 * @returns {Buffer}
 */
function readProdFile(relPath) {
    return fs.readFileSync(path.join(prodDir, relPath));
}

/**
 * Converts a file within build/prod into a data URI.
 *
 * @param {string} relPath
 * @param {string} mimeType
 * @returns {string}
 */
function toDataUri(relPath, mimeType) {
    return `data:${mimeType};base64,${readProdFile(relPath).toString("base64")}`;
}

/**
 * JSON.stringify, but with any closing script tags in the output neutralised
 * so the result can be embedded inside an inline <script> element.
 *
 * @param {*} value
 * @returns {string}
 */
function stringifyForInlineScript(value) {
    return JSON.stringify(value).replace(/<\/(script)/gi, "<\\/$1");
}

if (!fs.existsSync(prodDir)) {
    console.error("build/prod not found. Run `grunt prod` first."); // eslint-disable-line no-console
    process.exit(1);
}

console.log("Reading production build..."); // eslint-disable-line no-console

let html = fs.readFileSync(path.join(prodDir, "index.html"), "utf8");
let css = readProdFile("assets/main.css").toString("utf8");
let js = readProdFile("assets/main.js").toString("utf8");

// Find the emitted favicon and font filenames dynamically, since they are
// content-hashed by Webpack and so change between builds.
const assetFiles = fs.readdirSync(assetsDir);
const faviconFile = assetFiles.find(f => f.endsWith(".ico"));
const fontFile = assetFiles.find(f => f.endsWith(".ttf"));

// Inline the favicon
if (faviconFile) {
    html = html.replaceAll(`assets/${faviconFile}`, toDataUri(`assets/${faviconFile}`, "image/x-icon"));
}

// Inline the font referenced from main.css
if (fontFile) {
    const fontDataUri = toDataUri(`assets/${fontFile}`, "font/ttf");
    css = css.replaceAll(`../assets/${fontFile}`, fontDataUri);
}

// Inline the first-party images referenced from index.html and main.js
const imagesDir = path.join(prodDir, "images");
if (fs.existsSync(imagesDir)) {
    for (const image of fs.readdirSync(imagesDir)) {
        const ext = path.extname(image).slice(1);
        const mime = ext === "jpg" ? "jpeg" : ext;
        const dataUri = toDataUri(`images/${image}`, `image/${mime}`);
        const ref = `images/${image}`;
        html = html.replaceAll(ref, dataUri);
        js = js.replaceAll(`"${ref}"`, `"${dataUri}"`);
    }
}

console.log("Embedding lazily-loaded operation modules..."); // eslint-disable-line no-console

// Embed the source of every lazily-loaded operation module (Ciphers.js,
// Crypto.js, Compression.js, etc.) so ChefWorker.js can request them from the
// main thread instead of fetching them over the network.
const modulesDir = path.join(prodDir, "modules");
const standaloneModules = {};
for (const file of fs.readdirSync(modulesDir)) {
    if (!file.endsWith(".js")) continue; // skips .LICENSE.txt, .br, .gz
    const name = file.replace(/\.js$/, "");
    standaloneModules[name] = readProdFile(path.join("modules", file)).toString("utf8");
}

// Embed node-forge's prime-finding worker script, used by Generate RSA Key
// Pair, since it also cannot be fetched over the network.
const forgePrimeWorkerSource = readProdFile("assets/forge/prime.worker.min.js").toString("utf8");

const standaloneAssetsScript = "<script>\n" +
    `window.CC_STANDALONE_MODULES = ${stringifyForInlineScript(standaloneModules)};\n` +
    `window.CC_STANDALONE_ASSETS = { forgePrimeWorker: ${stringifyForInlineScript(forgePrimeWorkerSource)} };\n` +
    "</script>\n";

console.log("Assembling single HTML file..."); // eslint-disable-line no-console

// Replace the external CSS link with an inline <style> block. The exact
// attribute quoting/ordering here depends on the installed html-minifier
// version, so match loosely rather than relying on an exact string.
const cssLinkPattern = /<link\b[^>]*href=["']?assets\/main\.css["']?[^>]*>/;
if (!cssLinkPattern.test(html)) {
    throw new Error("Could not find the main.css <link> tag in index.html - has the build output format changed?");
}
html = html.replace(
    cssLinkPattern,
    () => `<style>\n${css}\n</style>`
);

// Replace the external main.js script tag with the embedded modules/assets
// script followed by the inlined main.js source
const jsScriptPattern = /<script\b[^>]*src=["']?assets\/main\.js["']?[^>]*>\s*<\/script>/;
if (!jsScriptPattern.test(html)) {
    throw new Error("Could not find the main.js <script> tag in index.html - has the build output format changed?");
}
html = html.replace(
    jsScriptPattern,
    () => `${standaloneAssetsScript}<script defer>\n${js}\n</script>`
);

// The downloadable ZIP file isn't included in the standalone build, so
// replace the download link with a simple version notice, as is already done
// for the regular (non-single-file) standalone HTML build.
html = html.replace(
    /<a [^>]+>Download CyberChef.+?<\/a>/,
    `<span>Version ${pkg.version} (standalone)</span>`
);

const distDir = path.join(rootDir, "dist");
fs.mkdirSync(distDir, { recursive: true });

// Sanity check: the assembled page should be roughly as large as main.js,
// main.css and the embedded modules combined. A much smaller result almost
// always means one of the inlining steps above silently failed to match
// (e.g. after an html-minifier/Webpack upgrade changed attribute quoting).
const expectedMinBytes = Buffer.byteLength(js) + Buffer.byteLength(css);
if (Buffer.byteLength(html) < expectedMinBytes) {
    throw new Error(
        `Assembled HTML (${html.length} bytes) is smaller than main.js + main.css alone ` +
        `(${expectedMinBytes} bytes) - inlining likely failed silently.`
    );
}

const outFile = path.join(distDir, `CyberChef_v${pkg.version}_standalone.html`);
fs.writeFileSync(outFile, html);

const sizeMb = (fs.statSync(outFile).size / (1024 * 1024)).toFixed(1);
console.log(`Written ${outFile} (${sizeMb} MiB)`); // eslint-disable-line no-console

// Also drop a copy at the repository root as index.html, so the standalone
// build is immediately visible/servable (e.g. via GitHub Pages) without
// having to look in dist/.
const rootIndexFile = path.join(rootDir, "index.html");
fs.writeFileSync(rootIndexFile, html);
console.log(`Written ${rootIndexFile} (${sizeMb} MiB)`); // eslint-disable-line no-console
