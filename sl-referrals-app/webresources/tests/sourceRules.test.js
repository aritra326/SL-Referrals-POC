/*
 * Rules every file in the web resources folder must follow. Run:  node --test "sl-referrals-app/webresources/tests/*.test.js"
 *
 * These exist because the earlier version of these pages was a minified bundle that nobody could read or fix.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const folder = path.join(__dirname, "..");
const files = fs.readdirSync(folder).filter(function (name) { return /\.(js|css|html)$/.test(name); });

/** Removes comments so a rule such as "no fetch()" does not trip over a sentence that mentions it. */
function withoutComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

test("the folder contains the files we expect", function () {
    ["slcrm_common.js", "slcrm_common.css", "slcrm_referraldecision.js", "slcrm_referraldecision.html",
        "slcrm_copyrationale.js", "slcrm_copyrationale.html", "slcrm_referralbuilder.js", "slcrm_referralbuilder.html",
        "slcrm_ReferralCommands.js", "slcrm_OpportunityCommands.js"].forEach(function (name) {
        assert.ok(files.includes(name), name + " is missing");
    });
});

files.forEach(function (name) {
    const bytes = fs.readFileSync(path.join(folder, name));
    const text = bytes.toString("utf8");

    test(name + ": no byte-order mark (Dynamics will not render a web resource that starts with one)", function () {
        assert.notDeepStrictEqual([bytes[0], bytes[1], bytes[2]], [0xef, 0xbb, 0xbf]);
    });

    test(name + ": ASCII characters only (write \\u2026 and \\u2014 instead of the symbols)", function () {
        const offender = text.split("\n").findIndex(function (line) { return /[^\x00-\x7f]/.test(line); });
        assert.strictEqual(offender, -1, "non-ASCII character on line " + (offender + 1));
    });

    test(name + ": readable (no line longer than 170 characters, so it is not minified)", function () {
        const offender = text.split("\n").findIndex(function (line) { return line.length > 170; });
        assert.strictEqual(offender, -1, "line " + (offender + 1) + " is too long");
    });

    if (name.endsWith(".js")) {
        test(name + ": no direct fetch() or XMLHttpRequest. Use Xrm.WebApi", function () {
            const code = withoutComments(text);
            assert.ok(!/\bfetch\s*\(/.test(code), "fetch() found");
            assert.ok(!/XMLHttpRequest/.test(code), "XMLHttpRequest found");
        });

        test(name + ": no Node-only or build-tool code (require, import, export)", function () {
            const code = withoutComments(text);
            assert.ok(!/\brequire\s*\(/.test(code) && !/^\s*(import|export)\s/m.test(code));
        });
    }
});

test("every page loads its scripts and styles with the same ?v=version, so a redeploy is not served from cache", function () {
    const versions = new Set();
    files.filter(function (name) { return name.endsWith(".html"); }).forEach(function (name) {
        const html = fs.readFileSync(path.join(folder, name), "utf8");
        const references = html.match(/(src|href)="slcrm_[^"]+"/g) || [];
        assert.ok(references.length >= 2, name + " should load slcrm_common.js and its own script");
        references.forEach(function (reference) {
            const match = /\?v=(\d+\.\d+\.\d+\.\d+)"/.exec(reference);
            assert.ok(match, name + ": " + reference + " has no ?v=version");
            versions.add(match[1]);
        });
    });
    assert.strictEqual(versions.size, 1, "pages use different versions: " + [...versions].join(", "));
});
