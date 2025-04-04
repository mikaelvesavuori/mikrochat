import { readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { minify } from 'html-minifier-terser';
import { transform } from 'lightningcss';

////////
// JS //
////////

const getPackageVersion = () =>
  JSON.parse(readFileSync('./package.json', 'utf-8')).version;

const getMjsFilesInDir = (dir) => {
  const files = [];
  try {
    readdirSync(dir, { withFileTypes: true }).forEach((dirent) => {
      const fullPath = join(dir, dirent.name);
      if (dirent.isDirectory()) {
        files.push(...getMjsFilesInDir(fullPath));
      } else if (dirent.name.endsWith('.mjs')) {
        files.push(fullPath);
      }
    });
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
  }
  return files;
};

const getConfig = (
  isMinified = false,
  entryPoints = './app/scripts/index.mjs'
) => {
  const packageVersion = getPackageVersion();
  const fileName = isMinified ? 'mikrochat.min.js' : 'mikrochat.js';
  const message = isMinified
    ? `Bundling version ${packageVersion} (minified) of MikroChat to "${fileName}"...`
    : `Bundling version ${packageVersion} of MikroChat to "${fileName}"...`;
  console.log(message);
  return {
    entryPoints: [entryPoints],
    outfile: `dist/${fileName}`,
    target: ['chrome133', 'safari18', 'edge132'],
    format: 'iife',
    minify: isMinified,
    treeShaking: true,
    bundle: true,
    sourcemap: false
  };
};

async function bundle(isMinified = false) {
  const packageVersion = getPackageVersion();
  const fileName = isMinified ? 'mikrochat.min.js' : 'mikrochat.js';

  const rootScripts = getMjsFilesInDir('./app/scripts');

  const orderedFiles = [...rootScripts];

  // Read and concatenate
  let result = `/*
 * MikroChat version ${packageVersion}
 * Bundle generated on ${new Date().toISOString()}
 */
(() => {\n`;

  orderedFiles.forEach((file) => {
    const content = readFileSync(file, 'utf8');
    result += `\n// ----- ${file} -----\n${content}\n`;
  });

  result += '\n})();';

  const tempFile = 'mikrochat.js';

  writeFileSync(tempFile, result);

  await build(getConfig(isMinified, tempFile)).catch(() => process.exit(1));

  try {
    unlinkSync(`${process.cwd()}/${tempFile}`);
  } catch (_error) {
    //
  }

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
