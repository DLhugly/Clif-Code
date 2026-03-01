#!/usr/bin/env node

// Syncs version across Cargo.toml and all npm package.json files
// Usage: node bump-version.js <version>

const fs = require("fs");
const path = require("path");

const version = process.argv[2];
if (!version) {
  console.error("Usage: node bump-version.js <version>");
  process.exit(1);
}

const root = path.resolve(__dirname, "..");

// 1. Update Cargo.toml
const cargoPath = path.join(root, "Cargo.toml");
let cargo = fs.readFileSync(cargoPath, "utf8");
cargo = cargo.replace(/^version\s*=\s*".*"/m, `version = "${version}"`);
fs.writeFileSync(cargoPath, cargo);
console.log(`Updated ${cargoPath}`);

// 2. Update main package.json (including optionalDependencies versions)
const mainPkgPath = path.join(root, "npm", "clifcode", "package.json");
const mainPkg = JSON.parse(fs.readFileSync(mainPkgPath, "utf8"));
mainPkg.version = version;
if (mainPkg.optionalDependencies) {
  for (const dep of Object.keys(mainPkg.optionalDependencies)) {
    mainPkg.optionalDependencies[dep] = version;
  }
}
fs.writeFileSync(mainPkgPath, JSON.stringify(mainPkg, null, 2) + "\n");
console.log(`Updated ${mainPkgPath}`);

// 3. Update all platform package.json files
const platformDir = path.join(root, "npm", "@clifcode");
const platforms = fs.readdirSync(platformDir).filter((d) =>
  fs.statSync(path.join(platformDir, d)).isDirectory()
);

for (const platform of platforms) {
  const pkgPath = path.join(platformDir, platform, "package.json");
  if (!fs.existsSync(pkgPath)) continue;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.version = version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`Updated ${pkgPath}`);
}

console.log(`\nAll versions set to ${version}`);
