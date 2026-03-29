#!/usr/bin/env node

// Syncs version across Cargo.toml and all npm package.json files
// Usage: node bump-version.js <version>

import { readFileSync, writeFileSync, statSync, readdirSync, existsSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const version = process.argv[2];
if (!version) {
  console.error("Usage: node bump-version.js <version>");
  process.exit(1);
}

const root = resolve(__dirname, "..");

// 1. Update Cargo.toml
const cargoPath = join(root, "Cargo.toml");
let cargo = readFileSync(cargoPath, "utf8");
cargo = cargo.replace(/^version\s*=\s*".*"/m, `version = "${version}"`);
writeFileSync(cargoPath, cargo);
console.log(`Updated ${cargoPath}`);

// 2. Update main package.json (including optionalDependencies versions)
const mainPkgPath = join(root, "npm", "clifcode", "package.json");
const mainPkg = JSON.parse(readFileSync(mainPkgPath, "utf8"));
mainPkg.version = version;
if (mainPkg.optionalDependencies) {
  for (const dep of Object.keys(mainPkg.optionalDependencies)) {
    mainPkg.optionalDependencies[dep] = version;
  }
}
writeFileSync(mainPkgPath, JSON.stringify(mainPkg, null, 2) + "\n");
console.log(`Updated ${mainPkgPath}`);

// 3. Update all platform package.json files
const platformDir = join(root, "npm", "@clifcode");
const platforms = readdirSync(platformDir).filter((d) =>
  statSync(join(platformDir, d)).isDirectory()
);

for (const platform of platforms) {
  const pkgPath = join(platformDir, platform, "package.json");
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`Updated ${pkgPath}`);
}

console.log(`\nAll versions set to ${version}`);
