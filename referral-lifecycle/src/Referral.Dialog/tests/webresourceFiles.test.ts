import * as fs from "fs";
import * as path from "path";

/**
 * A byte-order mark in front of <!DOCTYPE> or a script stops Dynamics from rendering the web resource ("No data available").
 * PowerShell 5.1 adds one when a file is saved with -Encoding utf8, so guard the files that are uploaded.
 */
const root = path.join(__dirname, "..");
const uploaded = ["decision-dialog.html", path.join("commands", "slcrm_ReferralCommands.js")];

describe("web resource source files", () => {
    test.each(uploaded)("%s has no byte-order mark", (file) => {
        const bytes = fs.readFileSync(path.join(root, file));
        expect([bytes[0], bytes[1], bytes[2]]).not.toEqual([0xef, 0xbb, 0xbf]);
    });

    test("the dialog page loads the script with a version query string, so a redeploy is not served stale", () => {
        const html = fs.readFileSync(path.join(root, "decision-dialog.html"), "utf8");
        expect(html).toMatch(/slcrm_referraldecision\.js\?v=\d+\.\d+\.\d+\.\d+/);
    });
});
