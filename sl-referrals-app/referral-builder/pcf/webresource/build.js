/**
 * Bundles the web-resource build of the Referral Builder.
 *
 * Invoked through webpack's Node API rather than webpack-cli, which is not a
 * dependency of this project — pcf-scripts brings webpack and ts-loader in
 * transitively and those are all this build needs.
 *
 *   node webresource/build.js
 *
 * Output: webresource/dist/slcrm_referralbuilder.js
 */

const path = require("path");
const webpack = require("webpack");

const here = __dirname;

webpack(
    {
        mode: "production",
        // Dataverse serves this as a static file; source maps would be a second
        // web resource to keep in sync for no real benefit.
        devtool: false,
        entry: path.join(here, "index.tsx"),
        output: {
            path: path.join(here, "dist"),
            filename: "slcrm_referralbuilder.js",
            // Web resources are served from a shared folder; never assume a
            // public path for chunk loading. Everything is in one file anyway.
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
                            // Type errors are caught by the PCF build, which
                            // compiles the same sources; re-checking here only
                            // slows the bundle down.
                            transpileOnly: true,
                            compilerOptions: { noEmit: false },
                        },
                    },
                },
                {
                    // @griffel/react (pulled in by Fluent v9) points `module` at
                    // untranspiled ESM, which webpack 5 treats as fully
                    // specified — that breaks its extensionless
                    // "react/jsx-runtime" import. Same fix as the PCF build.
                    test: /\.m?js$/,
                    include: /node_modules/,
                    resolve: { fullySpecified: false },
                },
            ],
        },
        performance: {
            // Fluent v9 + React is legitimately ~500KB minified. The web
            // resource cap is far higher; warning here is just noise.
            hints: false,
        },
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
