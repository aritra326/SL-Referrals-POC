const path = require("path");
const webpack = require("webpack");
const here = __dirname;
webpack({
    mode: "development",
    devtool: "source-map",
    entry: path.join(here, "harness.tsx"),
    output: { path: path.join(here, "dist"), filename: "harness.js", publicPath: "" },
    resolve: { extensions: [".ts", ".tsx", ".js", ".jsx"] },
    module: { rules: [
        { test: /\.tsx?$/, exclude: /node_modules/, use: { loader: "ts-loader", options: {
            configFile: path.join(here, "..", "tsconfig.json"), transpileOnly: true,
            compilerOptions: { noEmit: false } } } },
        { test: /\.m?js$/, include: /node_modules/, resolve: { fullySpecified: false } },
    ] },
    performance: { hints: false },
    stats: "errors-warnings",
}, (err, stats) => {
    if (err) { console.error(err.stack || err); process.exit(1); }
    console.log(stats.toString({ colors: false }));
    if (stats.hasErrors()) process.exit(1);
});
