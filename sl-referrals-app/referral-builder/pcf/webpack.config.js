/**
 * Fluent UI v9 pulls in @griffel/react, whose `module` entry points at untranspiled
 * ESM source (`./src/index.js`). Webpack 5 treats that as fully-specified ESM, so its
 * extensionless `import ... from "react/jsx-runtime"` fails to resolve even though
 * React 16.14 ships that entry point.
 *
 * Relaxing `fullySpecified` for .js/.mjs inside node_modules lets those bare specifiers
 * resolve normally. This only affects module resolution, not emitted code.
 */
module.exports = {
    module: {
        rules: [
            {
                test: /\.m?js$/,
                include: /node_modules/,
                resolve: { fullySpecified: false },
            },
        ],
    },
};
