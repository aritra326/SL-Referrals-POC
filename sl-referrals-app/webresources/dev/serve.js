/*
 * DEVELOPMENT ONLY - serves the web resources on http://localhost:5600 with a fake Xrm so you can click through the
 * pages without a Dataverse environment.   Run:  node sl-referrals-app/webresources/dev/serve.js
 *
 *   /                the list of test links
 *   /wr/<file>       a web resource from the folder above (the fake Xrm script is added to .html files)
 *   /__data/<file>   the exported data from data-export/data
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 5600;
const WEB_RESOURCES = path.join(__dirname, "..");
const DATA = path.join(__dirname, "..", "..", "..", "data-export", "data");

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json" };

function readJson(name) {
    return JSON.parse(fs.readFileSync(path.join(DATA, name), "utf8"));
}

/** The home page: links to each page with real ids from the exported data. */
function indexPage() {
    const items = readJson("slcrm_referralitem.json").records;
    const requests = readJson("slcrm_referralrequest.json").records;
    const opportunities = readJson("opportunity.json").records;
    const policies = readJson("slcrm_policy.json").records;
    const withPolicy = opportunities.find(function (o) { return o.lookups.some(function (l) { return l.attr === "slcrm_policy"; }); }) || opportunities[0];

    const dialog = function (target, id, action) {
        const data = encodeURIComponent("recordId=" + id + "&entityName=" + target + "&actionName=" + action);
        return "/wr/slcrm_referraldecision.html?data=" + data;
    };
    const links = [
        ["Decision dialog - Authorise (item)", dialog("slcrm_referralitem", items[0].id, "Authorise")],
        ["Decision dialog - Reject (comment required)", dialog("slcrm_referralitem", items[0].id, "Reject")],
        ["Decision dialog - Onward (pick an authority)", dialog("slcrm_referralitem", items[0].id, "Onward")],
        ["Decision dialog - Cancel referral", dialog("slcrm_referralrequest", requests[0].id, "Cancel")],
        ["Decision dialog - opened with no parameters (error page)", "/wr/slcrm_referraldecision.html"],
        ["Copy Rationale (opportunity with a policy)", "/wr/slcrm_copyrationale.html?data=" + encodeURIComponent("recordId=" + withPolicy.id + "&entityName=opportunity")],
        ["Referral Builder (blank)", "/wr/slcrm_referralbuilder.html"],
        ["Referral Builder (opened from an opportunity)", "/wr/slcrm_referralbuilder.html?data=" + encodeURIComponent("recordId=" + withPolicy.id + "&entityName=opportunity")]
    ];
    return "<!DOCTYPE html><meta charset=utf-8><title>Web resource test harness</title>" +
        "<body style='font:14px Segoe UI,sans-serif;max-width:720px;margin:32px auto'><h1>Web resource test harness</h1>" +
        "<p>Fake Xrm, data from data-export. " + policies.length + " policies, " + items.length + " items.</p><ul>" +
        links.map(function (l) { return "<li style='margin:6px 0'><a href=\"" + l[1] + "\">" + l[0] + "</a></li>"; }).join("") +
        "</ul><p><a href='/__log'>View recorded Xrm calls</a> (open after using a page; per page load, see the console: window.__xrmLog)</p></body>";
}

http.createServer(function (req, res) {
    const url = new URL(req.url, "http://localhost");
    try {
        if (url.pathname === "/") {
            const page = indexPage(); // build first, so an error becomes a 500 instead of a half-sent response
            res.writeHead(200, { "Content-Type": TYPES[".html"] });
            return res.end(page);
        }
        const isData = url.pathname.startsWith("/__data/");
        const isFake = url.pathname === "/__fake-xrm.js";
        const isResource = url.pathname.startsWith("/wr/");
        if (!isData && !isFake && !isResource) {
            res.writeHead(404);
            return res.end("Not found");
        }

        const file = isFake
            ? path.join(__dirname, "fake-xrm.js")
            : path.join(isData ? DATA : WEB_RESOURCES, path.basename(url.pathname));
        let body = fs.readFileSync(file);
        if (path.extname(file) === ".html") {
            // Put the fake Xrm in front of the page's own scripts.
            body = Buffer.from(body.toString("utf8").replace("<script", '<script src="/__fake-xrm.js"></script>\n    <script'));
        }
        res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
        res.end(body);
    } catch (error) {
        res.writeHead(500);
        res.end(String(error));
    }
}).listen(PORT, function () {
    console.log("Test harness on http://localhost:" + PORT);
});
