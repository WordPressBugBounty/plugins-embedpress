import { defineConfig } from 'vite';
import { defaultExclude } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// WordPress externals - these are provided by WordPress
const wordpressExternals = {
    '@wordpress/blocks': 'wp.blocks',
    '@wordpress/i18n': 'wp.i18n',
    '@wordpress/element': 'wp.element',
    '@wordpress/components': 'wp.components',
    '@wordpress/block-editor': 'wp.blockEditor',
    '@wordpress/data': 'wp.data',
    '@wordpress/core-data': 'wp.coreData',
    '@wordpress/compose': 'wp.compose',
    '@wordpress/hooks': 'wp.hooks',
    '@wordpress/url': 'wp.url',
    '@wordpress/api-fetch': 'wp.apiFetch',
    '@wordpress/notices': 'wp.notices',
    '@wordpress/editor': 'wp.editor',
    '@wordpress/edit-post': 'wp.editPost',
    '@wordpress/plugins': 'wp.plugins',
    '@wordpress/rich-text': 'wp.richText',
    '@wordpress/server-side-render': 'wp.serverSideRender',
    '@wordpress/viewport': 'wp.viewport',
    '@wordpress/keycodes': 'wp.keycodes',
    '@wordpress/html-entities': 'wp.htmlEntities',
    '@wordpress/primitives': 'wp.primitives',
    'react': 'React',
    'react-dom': 'ReactDOM',
    'jquery': 'jQuery'
};

// Copy static files and vendor files
function copyStaticFiles() {
    return {
        name: 'copy-static-files',
        generateBundle() {
            const staticDir = path.resolve(__dirname, 'static');
            const assetsDir = path.resolve(__dirname, 'assets');

            if (!fs.existsSync(staticDir)) {
                console.warn('Static directory not found:', staticDir);
                return;
            }

            // Ensure assets directory exists
            if (!fs.existsSync(assetsDir)) {
                fs.mkdirSync(assetsDir, { recursive: true });
            }

            // Copy static files
            copyDirectory(staticDir, assetsDir);
            
            // Copy block.json files
            copyBlockJsonFiles();
        }
    };
}

function copyBlockJsonFiles() {
    const srcBlocksDir = path.resolve(__dirname, 'src/Blocks');
    const assetsBlocksDir = path.resolve(__dirname, 'assets/blocks');

    if (!fs.existsSync(srcBlocksDir)) {
        console.warn('Source blocks directory not found:', srcBlocksDir);
        return;
    }

    // Ensure assets/blocks directory exists
    if (!fs.existsSync(assetsBlocksDir)) {
        fs.mkdirSync(assetsBlocksDir, { recursive: true });
    }

    // Find and copy all block.json files
    copyBlockJsonRecursive(srcBlocksDir, assetsBlocksDir);
}

function copyBlockJsonRecursive(srcDir, destDir) {
    const items = fs.readdirSync(srcDir);

    items.forEach(item => {
        const srcPath = path.join(srcDir, item);
        const stat = fs.statSync(srcPath);

        if (stat.isDirectory()) {
            const destPath = path.join(destDir, item);
            if (!fs.existsSync(destPath)) {
                fs.mkdirSync(destPath, { recursive: true });
            }
            copyBlockJsonRecursive(srcPath, destPath);
        } else if (item === 'block.json') {
            const destPath = path.join(destDir, item);
            syncBlockJson(srcPath, destPath);
        }
    });
}

/**
 * Copy a block.json to the build output, and — when the block keeps its
 * attributes in a sibling `src/attributes.js` (the EmbedPress convention) —
 * inject those attributes into the copied block.json.
 *
 * Why: the PHP server side (block-renderer REST validation in the dist zip)
 * reads attributes from block.json, but `src/` is stripped from the zip, so it
 * can't read attributes.js. Generating block.json's `attributes` from
 * attributes.js at build time keeps ONE editable source and guarantees the JS
 * editor and PHP server never drift.
 */
function syncBlockJson(srcPath, destPath) {
    const attrsFile = path.join(path.dirname(srcPath), 'src', 'attributes.js');
    let json;
    try {
        json = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
    } catch (e) {
        // Not valid JSON — fall back to a plain copy.
        fs.copyFileSync(srcPath, destPath);
        console.log(`Copied block.json: ${srcPath} → ${destPath}`);
        return;
    }

    const attrs = fs.existsSync(attrsFile) ? readAttributesModule(attrsFile) : null;
    if (attrs && Object.keys(attrs).length) {
        json.attributes = attrs;
        // Mirror back into the source block.json too, so the committed file
        // matches and dev mode (which reads src block.json) stays in sync.
        fs.writeFileSync(srcPath, JSON.stringify(json, null, 2) + '\n');
        fs.writeFileSync(destPath, JSON.stringify(json, null, 2) + '\n');
        console.log(`Synced block.json from attributes.js: ${attrsFile} → ${destPath} (${Object.keys(attrs).length} attrs)`);
    } else {
        fs.copyFileSync(srcPath, destPath);
        console.log(`Copied block.json: ${srcPath} → ${destPath}`);
    }
}

/**
 * Statically evaluate a simple `const attributes = {…}; export default attributes;`
 * module and return the object. Stubs the runtime global the block defaults may
 * reference so the module evaluates without a browser.
 */
function readAttributesModule(file) {
    try {
        const src = fs.readFileSync(file, 'utf8')
            .replace(/export\s+default\s+attributes;?/, 'return attributes;')
            .replace(/^\s*const\s+attributes\s*=/m, 'var attributes =');
        // eslint-disable-next-line no-new-func
        const fn = new Function('embedpressGutenbergData', `${src}`);
        const out = fn({});
        return (out && typeof out === 'object') ? out : null;
    } catch (e) {
        console.warn(`Could not read attributes from ${file}: ${e.message}`);
        return null;
    }
}

function copyDirectory(src, dest) {
    if (!fs.existsSync(src)) {
        return;
    }

    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    const items = fs.readdirSync(src);

    items.forEach(item => {
        const srcPath = path.join(src, item);
        const destPath = path.join(dest, item);
        const stat = fs.statSync(srcPath);

        if (stat.isDirectory()) {
            console.log(`Copied directory: ${srcPath} → ${destPath}`);
            copyDirectory(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
            console.log(`Copied: ${srcPath} → ${destPath}`);
        }
    });
}

// Entry points for the build - all files needed
const allEntryPoints = {
    // Blocks file (IIFE with externals)
    'blocks': 'src/Blocks/index.js',
    // Other files (ES modules without externals)
    'admin': 'src/AdminUI/index.js',
    'onboarding': 'src/AdminUI/onboarding-entry.js',
    'custom-player': 'src/AdminUI/custom-player-entry.js',
    'google-reviews': 'src/AdminUI/google-reviews-entry.jsx',
    'analytics': 'src/Analytics/index.js',
    'frontend': 'src/Frontend/index.js'
};

// Rewrite imports of WordPress packages to use the runtime globals (window.wp.*)
// exposed by WordPress, instead of bundling our own copies. Critical for i18n:
// without this, every entry ships its own `@wordpress/i18n` instance whose
// locale data is separate from WordPress's wp.i18n, so wp_set_script_translations
// never reaches the bundle's __() calls.
function wordpressGlobalsPlugin(map) {
    const VIRTUAL = '\0wp-global:';
    return {
        name: 'wordpress-globals',
        enforce: 'pre',
        resolveId(id) {
            if (Object.prototype.hasOwnProperty.call(map, id)) {
                return VIRTUAL + id;
            }
        },
        load(id) {
            if (!id.startsWith(VIRTUAL)) return;
            const orig = id.slice(VIRTUAL.length);
            const global = map[orig];
            // Re-export the named exports of the wp.* runtime. Listing the
            // common surface lets named imports tree-shake; default export
            // covers `import x from 'pkg'`.
            return `const __mod = ${global};
export default __mod;
export const __ = __mod.__;
export const _x = __mod._x;
export const _n = __mod._n;
export const _nx = __mod._nx;
export const sprintf = __mod.sprintf;
export const setLocaleData = __mod.setLocaleData;
export const isRTL = __mod.isRTL;
export const hasTranslation = __mod.hasTranslation;
export const createElement = __mod.createElement;
export const useState = __mod.useState;
export const useEffect = __mod.useEffect;
export const useMemo = __mod.useMemo;
export const useRef = __mod.useRef;
export const useCallback = __mod.useCallback;`;
        }
    };
}

// Use WordPress's own React instead of bundling a private copy (WP.org
// Guideline 13 — "use the libraries WordPress already ships"). Every import of
// react / react-dom / react-dom/client / react/jsx-runtime — from our sources
// AND from node_modules deps (react-select, react-query, react-router, …) —
// resolves to a tiny virtual ES module that re-exports the globals WordPress
// registers via the `react`, `react-dom` and `react-jsx-runtime` script
// handles. The PHP side must list those handles as dependencies of every
// *.build.js (see AssetManager::with_react_deps()).
//
// Rollup `external` + `globals` can't be used: our output is ES modules, where
// externals are emitted as bare `import 'react'` statements browsers can't
// resolve.
//
function wordpressReactPlugin() {
    const VIRTUAL = '\0wp-react:';
    // `syntheticNamedExports` lets Rollup turn each named import into a
    // property read on the global at the use site, so unused React APIs are
    // never referenced in the output.
    const fromGlobal = (global) => ({
        code: `export default ${global};`,
        syntheticNamedExports: 'default',
        moduleSideEffects: false,
    });

    // WordPress registers `react-jsx-runtime` (window.ReactJSXRuntime) since
    // 6.6. On older cores fall back to a createElement-based shim with the
    // same (type, props, key) contract.
    const jsxRuntime = `const __R = window.React;
const __rt = window.ReactJSXRuntime;
function __jsx(type, props, key) {
    if (key !== undefined) { props = Object.assign({}, props, { key: key }); }
    return __R.createElement(type, props);
}
export const jsx = __rt ? __rt.jsx : __jsx;
export const jsxs = __rt ? __rt.jsxs : __jsx;
export const jsxDEV = jsx;
export const Fragment = __R.Fragment;`;

    const modules = {
        'react': () => fromGlobal('window.React'),
        'react-dom': () => fromGlobal('window.ReactDOM'),
        // WP's `react-dom` handle (React 18, WP 6.2+) exposes createRoot /
        // hydrateRoot on the ReactDOM global; its UMD build has the
        // "import from react-dom/client" dev warning compiled out.
        'react-dom/client': () => fromGlobal('window.ReactDOM'),
        'react/jsx-runtime': () => ({ code: jsxRuntime, moduleSideEffects: false }),
        'react/jsx-dev-runtime': () => ({ code: jsxRuntime, moduleSideEffects: false }),
    };

    return {
        name: 'wordpress-react',
        enforce: 'pre',
        resolveId(id) {
            if (Object.prototype.hasOwnProperty.call(modules, id)) {
                return VIRTUAL + id;
            }
        },
        load(id) {
            if (!id.startsWith(VIRTUAL)) return;
            return modules[id.slice(VIRTUAL.length)]();
        },
    };
}

export default defineConfig(({ mode }) => {
    const isDev = mode === 'development';

    return {
        plugins: [
            wordpressGlobalsPlugin({
                '@wordpress/i18n': 'window.wp.i18n',
            }),
            wordpressReactPlugin(),
            // Custom plugin to handle JSX in .js files
            {
                name: 'treat-js-files-as-jsx',
                async transform(code, id) {
                    if (!id.endsWith('.js')) return null;
                    if (id.includes('node_modules')) return null;

                    // Check if the file contains JSX syntax
                    if (code.includes('<') && code.includes('>')) {
                        // Transform using esbuild
                        const esbuild = await import('esbuild');
                        const result = await esbuild.transform(code, {
                            loader: 'jsx',
                            jsx: 'automatic',
                            jsxImportSource: 'react'
                        });
                        return result.code;
                    }
                    return null;
                }
            },
            react({
                include: ['**/*.jsx'], // Only process .jsx files with React plugin
                jsxRuntime: 'automatic'
            }),
            copyStaticFiles()
        ],
        css: {
            preprocessorOptions: {
                scss: {
                    additionalData: `@import "${path.resolve(__dirname, 'src/Shared/styles/variables.scss')}";`
                }
            }
        },
        build: {
            outDir: 'assets',
            // Only wipe assets/ in a full source checkout. The shipped plugin has no
            // static/ folder, so `npm run build` there rebuilds the bundles in place
            // without deleting the copied static files.
            emptyOutDir: fs.existsSync(path.resolve(__dirname, 'static')),
            sourcemap: isDev,
            minify: !isDev,
            rollupOptions: {
                input: Object.fromEntries(
                    Object.entries(allEntryPoints).map(([key, value]) => [
                        key, 
                        path.resolve(__dirname, value)
                    ])
                ),
                output: {
                    format: 'es',
                    entryFileNames: (chunkInfo) => {
                        return `js/${chunkInfo.name}.build.js`;
                    },
                    assetFileNames: (assetInfo) => {
                        const ext = path.extname(assetInfo.names?.[0] || '');
                        if (ext === '.css') {
                            return 'css/[name].build.css';
                        }
                        if (['.png', '.jpg', '.jpeg', '.gif', '.svg'].includes(ext)) {
                            return 'img/[name][extname]';
                        }
                        if (['.woff', '.woff2', '.ttf', '.eot'].includes(ext)) {
                            return 'fonts/[name][extname]';
                        }
                        return 'assets/[name][extname]';
                    },
                    chunkFileNames: 'js/chunks/[name]-[hash].js'
                }
            }
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, 'src'),
                '@shared': path.resolve(__dirname, 'src/Shared'),
                '@utils': path.resolve(__dirname, 'src/utils'),
                '@components': path.resolve(__dirname, 'src/components')
            }
        },
        define: {
            'process.env.NODE_ENV': JSON.stringify(mode)
        },
        test: {
            exclude: [...defaultExclude, 'tests/e2e/**'],
        },
    };
});
