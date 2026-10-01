// Bundles the dialog into dist/slcrm_referraldecision.js and copies the HTML next to it.
//   npm run build
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const out = path.join(__dirname, "dist");
fs.mkdirSync(out, { recursive: true });

esbuild
    .build({
        entryPoints: [path.join(__dirname, "src", "index.tsx")],
        bundle: true,
        minify: true,
        format: "iife",
        target: ["es2017"],
        outfile: path.join(out, "slcrm_referraldecision.js"),
        define: { "process.env.NODE_ENV": '"production"' },
        logLevel: "info",
    })
    .then(() => {
        fs.copyFileSync(path.join(__dirname, "decision-dialog.html"), path.join(out, "slcrm_referraldecision.html"));
        console.log("Built dist/slcrm_referraldecision.js and .html");
    })
    .catch(() => process.exit(1));
