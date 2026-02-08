import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

// This file builds the API (backend) part of MikroChat

const format = (process.argv[2] || 'all').replace('--', '');
const outputFileName = 'mikrochat';

const getPackageVersion = () =>
  JSON.parse(readFileSync('./package.json', 'utf-8')).version;
const packageVersion = getPackageVersion();

console.log(
  `Building MikroChat API (${packageVersion}) for format "${format}"...`
);

const getConfig = () => {
  return {
    entryPoints: ['src/index.ts'],
    bundle: true,
    minify: true,
    treeShaking: true,
    platform: 'node',
    target: 'node24',
    mainFields: ['module', 'main'],
    banner: {
      js: '// MikroChat - See LICENSE file for copyright and license details.'
    }
  };
};

const common = getConfig();

build({
  ...common,
  format: 'esm',
  outfile: `lib/${outputFileName}.mjs`
}).catch(() => process.exit(1));
