import { readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { minify } from 'html-minifier-terser';
import { transform } from 'lightningcss';

////////
// JS //
////////

const getPackageVersion = () =>
  JSON.parse(readFileSync('./package.json', 'utf-8')).version;

async function bundle(isMinified = false) {
  const packageVersion = getPackageVersion();
  const fileName = isMinified ? 'mikrochat.min.js' : 'mikrochat.js';
  const message = isMinified
    ? `Bundling version ${packageVersion} (minified) of MikroChat to "${fileName}"...`
    : `Bundling version ${packageVersion} of MikroChat to "${fileName}"...`;
  console.log(message);

  await build({
    entryPoints: ['./app/scripts/main.mjs'],
    outfile: `dist/${fileName}`,
    target: ['chrome139', 'safari18', 'edge143'],
    format: 'iife',
    minify: isMinified,
    treeShaking: true,
    bundle: true,
    sourcemap: false,
    banner: {
      js: `/*\n * MikroChat version ${packageVersion}\n * Bundle generated on ${new Date().toISOString()}\n */`
    }
  }).catch(() => process.exit(1));

  console.log(`Successfully created ${fileName}`);
}

await bundle();
await bundle(true);

/////////
// CSS //
/////////

const cssInput = readFileSync('./app/styles.css');

const { code } = transform({
  filename: './app/styles.css',
  code: cssInput,
  minify: true,
  sourceMap: false
});

writeFileSync('./dist/styles.css', code);

console.log('CSS processed and written to dist/styles.css');

//////////
// HTML //
//////////

const html = readFileSync('./app/index.html', 'utf8');
const minified = await minify(html, {
  collapseWhitespace: true,
  removeComments: true,
  minifyCSS: true,
  minifyJS: true
});

writeFileSync('./dist/index.html', minified);
