const http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "dist");
const types = { ".html": "text/html", ".js": "application/javascript", ".map": "application/json" };
http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]);
    const file = path.join(root, rel === "/" ? "index.html" : rel);
    fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); return res.end("not found"); }
        res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
        res.end(buf);
    });
}).listen(5599, () => console.log("harness on http://localhost:5599"));
