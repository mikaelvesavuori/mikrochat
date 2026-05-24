#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const securityDir = path.join(rootDir, "security");
const outputFile = path.join(securityDir, "sbom.spdx.json");
const lockFile = path.join(rootDir, "package-lock.json");

const lock = JSON.parse(await readFile(lockFile, "utf8"));

if (!lock.packages) {
  throw new Error("Production SBOM generation requires package-lock v2 or newer.");
}

const packages = lock.packages;
const keep = new Set([""]);

function dependencyNames(packageInfo = {}) {
  return Object.keys({
    ...(packageInfo.dependencies || {}),
    ...(packageInfo.optionalDependencies || {}),
  });
}

function parentBase(packageKey) {
  const marker = "/node_modules/";
  const index = packageKey.lastIndexOf(marker);
  return index === -1 ? "" : packageKey.slice(0, index);
}

function resolvePackageKey(fromKey, dependencyName) {
  let base = fromKey;

  while (true) {
    const candidate = base
      ? `${base}/node_modules/${dependencyName}`
      : `node_modules/${dependencyName}`;

    if (packages[candidate]) return candidate;

    const nextBase = parentBase(base);
    if (nextBase === base) return undefined;
    base = nextBase;
  }
}

const rootPackage = packages[""] || {};
const queue = dependencyNames(rootPackage)
  .map((dependencyName) => resolvePackageKey("", dependencyName))
  .filter(Boolean);

for (const packageKey of queue) {
  if (keep.has(packageKey)) continue;

  keep.add(packageKey);

  for (const dependencyName of dependencyNames(packages[packageKey])) {
    const resolved = resolvePackageKey(packageKey, dependencyName);
    if (resolved && !keep.has(resolved)) queue.push(resolved);
  }
}

const productionPackages = {};

for (const packageKey of [...keep].sort()) {
  productionPackages[packageKey] = { ...packages[packageKey] };
}

delete productionPackages[""].devDependencies;
delete productionPackages[""].workspaces;

const productionLock = {
  ...lock,
  packages: productionPackages,
};

delete productionLock.dependencies;

await mkdir(securityDir, { recursive: true });

const tempDir = await mkdtemp(path.join(tmpdir(), "mikro-prod-sbom-"));
const tempLockFile = path.join(tempDir, "package-lock.json");

try {
  await writeFile(tempLockFile, `${JSON.stringify(productionLock, null, 2)}\n`, "utf8");

  const result = spawnSync("syft", [tempLockFile, "--output", `spdx-json=${outputFile}`], {
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(tempDir, { force: true, recursive: true });
}
