/**
 * Rewrites the "Create" group's subarea to point at the web-resource build of
 * the Referral Builder instead of the custom page.
 *
 * Why: a custom page is a canvas app in a nested iframe and Microsoft documents
 * that it requires third-party cookies. Those are blocked by default in current
 * Chrome/Edge and unconditionally in incognito, so the page could not reliably
 * authenticate. An HTML web resource is served from the Dataverse origin, so the
 * Web API calls are same-origin and use the session already established.
 *
 *   node webresource/patch-sitemap.js <sitemap.xml> <out.json>
 *
 * Reads the current sitemap XML, applies the edit, and writes the PATCH body.
 * Fails loudly if the subarea is not shaped as expected rather than writing a
 * sitemap that silently lost a nav entry.
 */

const fs = require("fs");

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
    console.error("usage: node patch-sitemap.js <sitemap.xml> <out.json>");
    process.exit(1);
}

let xml = fs.readFileSync(inPath, "utf8");

const SUBAREA_ID = 'Id="subarea_cb307cad"';
const FROM_PAGE = 'Page="slcrm_referralbuilder_2936c"';
const TO_URL = 'Url="$webresource:slcrm_referralbuilder.html"';
const VECTOR_ICON = 'VectorIcon="$webresource:slcrm_icon_newreferral"';

function must(condition, message) {
    if (!condition) {
        console.error(`refusing to write: ${message}`);
        process.exit(1);
    }
}

must(xml.includes(SUBAREA_ID), "the Create-group subarea was not found");
must(xml.includes(FROM_PAGE), "the subarea does not point at the custom page any more");

// 1. Custom page -> web resource.
xml = xml.replace(FROM_PAGE, TO_URL);

// 2. Give it its own icon; the other subareas all carry a VectorIcon.
if (!xml.includes(VECTOR_ICON)) {
    xml = xml.replace(SUBAREA_ID, `${SUBAREA_ID} ${VECTOR_ICON}`);
}

// 3. Name it for what the user does, not for the component behind it.
xml = xml.replace('Title="Referral Builder"', 'Title="New Referral"');

must(xml.includes(TO_URL), "the web-resource URL was not applied");
must(!xml.includes(FROM_PAGE), "the custom page reference survived the edit");

fs.writeFileSync(outPath, JSON.stringify({ sitemapxml: xml }));

const subarea = /<SubArea[^>]*subarea_cb307cad[^>]*>/.exec(xml);
console.log("patched subarea:\n" + (subarea ? subarea[0] : "(not found)"));
console.log(`\nwrote ${outPath} (${xml.length} chars of sitemap xml)`);
