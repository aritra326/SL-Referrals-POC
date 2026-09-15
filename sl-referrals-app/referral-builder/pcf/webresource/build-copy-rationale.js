/**
 * Bundles the web-resource build of Copy Rationale. Mirrors build.js exactly
 * (same webpack config, same @griffel/react fix) for a different entry point —
 * see that file for why each option is set.
 *
 *   node webresource/build-copy-rationale.js
 *
 * Output: webresource/dist/slcrm_copyrationale.js
 */

const path = require("path");
const webpack = require("webpack");

const here = __dirname;

webpack(
    {
        mode: "production",
        devtool: false,
        entry: path.join(here, "copy-rationale-index.tsx"),
        output: {
            path: path.join(here, "dist"),
            filename: "slcrm_copyrationale.js",
            publicPath: "",
        },
        resolve: {
            extensions: [".ts", ".tsx", ".js", ".jsx"],
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    exclude: /node_modules/,
                    use: {
                        loader: "ts-loader",
                        options: {
                            configFile: path.join(here, "tsconfig.json"),
                            transpileOnly: true,
                            compilerOptions: { noEmit: false },
                        },
                    },
                },
                {
                    test: /\.m?js$/,
                    include: /node_modules/,
                    resolve: { fullySpecified: false },
                },
            ],
        },
        performance: { hints: false },
        stats: "errors-warnings",
    },
    (err, stats) => {
        if (err) {
            console.error(err.stack || err);
            process.exit(1);
        }
        console.log(stats.toString({ colors: false, errorsWarnings: true }));
        if (stats.hasErrors()) process.exit(1);

        const asset = stats.toJson({ assets: true }).assets.find((a) => a.name.endsWith(".js"));
        if (asset) {
            console.log(`\nbundle: ${(asset.size / 1024).toFixed(0)} KB`);
        }
    }
);
