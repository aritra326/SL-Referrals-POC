/**
 * Writes the Web API request bodies for the two web resources.
 *
 * Kept separate from the deploy step so the base64 payloads are produced once,
 * inspectable on disk, and identical between a create and a later update.
 *
 *   node webresource/make-bodies.js
 */

const fs = require("fs");
const path = require("path");

const here = __dirname;
const out = path.join(here, "payload");
fs.mkdirSync(out, { recursive: true });

const b64 = (p) => fs.readFileSync(p).toString("base64");

const resources = [
    {
        file: "js.json",
        body: {
            name: "slcrm_referralbuilder.js",
            displayname: "Referral Builder (script)",
            description:
                "Bundled React application for the Referral Builder page. Loaded by slcrm_referralbuilder.html.",
            // 3 = Script (JScript)
            webresourcetype: 3,
            content: b64(path.join(here, "dist", "slcrm_referralbuilder.js")),
        },
    },
    {
        file: "html.json",
        body: {
            name: "slcrm_referralbuilder.html",
            displayname: "Referral Builder",
            description:
                "Create a referral request with one or more referral items. Hosted as a web resource rather " +
                "than a custom page so it runs same-origin and does not depend on third-party cookies.",
            // 1 = Webpage (HTML)
            webresourcetype: 1,
            content: b64(path.join(here, "index.html")),
        },
    },
];

for (const r of resources) {
    const target = path.join(out, r.file);
    fs.writeFileSync(target, JSON.stringify(r.body));
    console.log(`${r.file}: ${r.body.name} (${(r.body.content.length / 1024).toFixed(0)} KB base64)`);
}
