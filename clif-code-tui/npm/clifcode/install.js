const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PLATFORM_MAP = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "linux-arm64": "aarch64-unknown-linux-gnu",
  "linux-x64": "x86_64-unknown-linux-gnu",
  "win32-arm64": "aarch64-pc-windows-msvc",
  "win32-x64": "x86_64-pc-windows-msvc",
};

function getPlatformPackage() {
  const key = `${process.platform}-${process.arch}`;
  return `@clifcode/cli-${process.platform}-${process.arch}`;
}

function hasPlatformBinary() {
  try {
    const pkg = getPlatformPackage();
    const pkgDir = path.dirname(require.resolve(`${pkg}/package.json`));
    const ext = process.platform === "win32" ? ".exe" : "";
    return fs.existsSync(path.join(pkgDir, "bin", `clifcode${ext}`));
  } catch {
    return false;
  }
}

function download(url, dest, redirects = 0) {
  if (redirects > 5) {
    throw new Error("Too many redirects");
  }

  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(download(res.headers.location, dest, redirects + 1));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => {
        file.close(resolve);
      });
      file.on("error", reject);
    }).on("error", reject);
  });
}

async function main() {
  // If the platform package already has the binary, nothing to do
  if (hasPlatformBinary()) {
    return;
  }

  const key = `${process.platform}-${process.arch}`;
  const target = PLATFORM_MAP[key];
  if (!target) {
    console.warn(`[clifcode] Unsupported platform: ${key}. Skipping download.`);
    return;
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
  const version = pkg.version;
  const ext = process.platform === "win32" ? ".exe" : "";
  const filename = `clifcode${ext}`;
  const url = `https://github.com/DLhugly/Clif-Code/releases/download/clifcode-v${version}/clifcode-${target}${ext}`;
  const dest = path.join(__dirname, "bin", filename);

  console.log(`[clifcode] Downloading binary for ${key}...`);

  try {
    await download(url, dest);
    if (process.platform !== "win32") {
      fs.chmodSync(dest, 0o755);
    }
    console.log(`[clifcode] Binary installed successfully.`);
  } catch (err) {
    console.warn(`[clifcode] Failed to download binary: ${err.message}`);
    console.warn(`[clifcode] You can build from source: cd clif-code-tui && cargo install --path .`);
    // Exit 0 so npm install doesn't fail
  }
}

main();
