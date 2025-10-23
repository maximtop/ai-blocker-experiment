import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import swc from '@rollup/plugin-swc';
import copy from 'rollup-plugin-copy';

const swcOptions = {
    swc: {
        jsc: {
            parser: {
                syntax: 'typescript',
                tsx: false,
                decorators: false,
                dynamicImport: true,
            },
            target: 'es2022',
            loose: false,
            externalHelpers: true,
            keepClassNames: true,
        },
        module: {
            type: 'es6',
            strict: false,
            strictMode: true,
        },
        minify: false,
        isModule: true,
        sourceMaps: false,
    },
    // Process both .ts and .js files
    include: /\.(ts|js)$/,
    exclude: /node_modules/,
};

const resolveOptions = {
    extensions: ['.ts', '.js', '.json'],
};

export default [
    // Background script
    {
        input: 'src/background/entry.ts',
        output: {
            file: 'dist/background.js',
            format: 'iife',
            name: 'Background',
        },
        plugins: [swc(swcOptions), resolve(resolveOptions), commonjs()],
    },

    // Content scripts bundle
    {
        input: 'src/content/entry.ts',
        output: {
            file: 'dist/content/content.js',
            format: 'iife',
            name: 'ContentScript',
        },
        plugins: [swc(swcOptions), resolve(resolveOptions), commonjs()],
    },

    // Popup script
    {
        input: 'src/popup/entry.ts',
        output: {
            file: 'dist/popup/popup.js',
            format: 'iife',
            name: 'Popup',
        },
        plugins: [swc(swcOptions), resolve(resolveOptions), commonjs()],
    },

    // Options script
    {
        input: 'src/options/entry.ts',
        output: {
            file: 'dist/options/entry.js',
            format: 'iife',
            name: 'Options',
        },
        plugins: [swc(swcOptions), resolve(resolveOptions), commonjs()],
    },

    // Offscreen script
    {
        input: 'src/offscreen/entry.ts',
        output: {
            file: 'dist/offscreen/offscreen.js',
            format: 'iife',
            name: 'OffscreenDocument',
        },
        plugins: [
            swc(swcOptions),
            resolve(resolveOptions),
            commonjs(),
            // Copy static assets only once (on the last bundle)
            copy({
                targets: [
                    // Copy HTML files
                    { src: 'src/popup/popup.html', dest: 'dist/popup' },
                    { src: 'src/options/options.html', dest: 'dist/options' },
                    {
                        src: 'src/offscreen/offscreen.html',
                        dest: 'dist/offscreen',
                    },

                    // Copy manifest and locales
                    { src: 'manifest.json', dest: 'dist' },
                    { src: 'src/_locales', dest: 'dist' },

                    // Copy icons
                    { src: 'src/icons', dest: 'dist' },
                ],
            }),
        ],
    },
];
