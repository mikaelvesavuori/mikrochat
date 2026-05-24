#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const releaseDir = path.join(rootDir, "release");
const stagingDir = path.join(releaseDir, "_staging");
const config = {
  "name": "mikrochat",
  "bundles": [
    {
      "kind": "app",
      "title": "MikroChat App",
      "entries": [
        {
          "from": "dist",
          "into": "."
        }
      ]
    },
    {
      "kind": "api",
      "title": "MikroChat API",
      "entries": [
        {
          "from": "lib",
          "into": "lib"
        },
        {
          "from": "mikrochat.config.example.json",
          "into": "mikrochat.config.example.json",
          "optional": true
        }
      ]
    }
  ]
};

function normalizeVersion(input) {
  return String(input || "").trim().replace(/^v/, "");
}

async function readPackageVersion() {
  const packageJson = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));
  return normalizeVersion(packageJson.version);
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyEntry(entry, targetDir) {
  const source = path.join(rootDir, entry.from);
  if (!(await exists(source))) {
    if (entry.optional) return;
    throw new Error(`Missing release input: ${entry.from}`);
  }

  const target = path.join(targetDir, entry.into || path.basename(entry.from));
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true });
}

async function copyIfExists(sourceName, targetDir) {
  const source = path.join(rootDir, sourceName);
  if (!(await exists(source))) return;
  await cp(source, path.join(targetDir, path.basename(sourceName)), { recursive: true });
}

async function copySecurityReports(targetDir) {
  const securityDir = path.join(targetDir, "security");
  for (const file of ["sbom.spdx.json", "grype-report.json", "grant-report.txt"]) {
    const source = path.join(rootDir, "security", file);
    if (await exists(source)) {
      await mkdir(securityDir, { recursive: true });
      await cp(source, path.join(securityDir, file));
    }
  }
}

async function sha256(filePath) {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

async function createZip(artifactName, sourceName) {
  await execFileAsync("zip", ["-qr", path.join(releaseDir, artifactName), sourceName], {
    cwd: stagingDir,
  });
}

async function main() {
  const version = normalizeVersion(process.argv[2]) || (await readPackageVersion());
  if (!version) throw new Error("Could not resolve release version.");

  await rm(releaseDir, { force: true, recursive: true });
  await mkdir(stagingDir, { recursive: true });

  const artifacts = [];

  for (const bundle of config.bundles) {
    const artifactStem = [config.name, bundle.kind].filter(Boolean).join("_");
    const bundleDirName = `${artifactStem}_${version}`;
    const bundleDir = path.join(stagingDir, bundleDirName);
    await mkdir(bundleDir, { recursive: true });

    for (const entry of bundle.entries) {
      await copyEntry(entry, bundleDir);
    }

    await copyIfExists("README.md", bundleDir);
    await copyIfExists("LICENSE", bundleDir);
    await copySecurityReports(bundleDir);

    const versionedZip = `${artifactStem}_${version}.zip`;
    const latestZip = `${artifactStem}_latest.zip`;
    await createZip(versionedZip, bundleDirName);
    await createZip(latestZip, bundleDirName);
    artifacts.push(versionedZip, latestZip);
  }

  const sums = [];
  for (const artifact of artifacts) {
    sums.push(`${await sha256(path.join(releaseDir, artifact))}  ${artifact}`);
  }
  await writeFile(path.join(releaseDir, "SHA256SUMS.txt"), `${sums.join("\n")}\n`, "utf8");
  await rm(stagingDir, { force: true, recursive: true });

  process.stdout.write(`Created release assets in ${path.relative(rootDir, releaseDir)}\n`);
  for (const artifact of artifacts) {
    process.stdout.write(`- ${artifact}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
