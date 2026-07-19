import { APP_LINKS } from "./app-links.js";

const PLATFORM_ORDER = new Map([
  ["windows", 0],
  ["mac", 1],
  ["linux", 2],
]);

export async function fetchDesktopReleases({ fetchImpl, signal } = {}) {
  const request = fetchImpl || globalThis.fetch;
  if (typeof request !== "function") {
    throw new Error("Release lookup is unavailable in this browser.");
  }

  const response = await request(APP_LINKS.releasesApi, {
    headers: { Accept: "application/vnd.github+json" },
    signal,
  });
  if (!response.ok) {
    throw new Error(`GitHub release lookup failed (${response.status}).`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("GitHub returned an invalid release list.");
  }

  return payload
    .filter((release) => !release?.draft)
    .map(normalizeRelease)
    .filter((release) => release.tag && release.assets.length > 0);
}

export function normalizeRelease(release = {}) {
  const tag = String(release.tag_name || release.name || "").trim();
  const assets = Array.isArray(release.assets)
    ? release.assets
        .map(normalizeReleaseAsset)
        .filter(Boolean)
        .sort(compareAssets)
    : [];

  return {
    tag,
    title: String(release.name || tag).trim(),
    publishedAt: String(release.published_at || release.created_at || ""),
    prerelease: Boolean(release.prerelease),
    url:
      String(release.html_url || "").trim() ||
      `${APP_LINKS.desktopSource}/releases/tag/${encodeURIComponent(tag)}`,
    assets,
  };
}

export function normalizeReleaseAsset(asset = {}) {
  const name = String(asset.name || "").trim();
  const url = String(asset.browser_download_url || "").trim();
  if (!name || !url) return null;

  const lowered = name.toLowerCase();
  let platform = "";
  let architecture = "";
  let label = "";

  if (lowered === "peardrop-setup.exe") {
    platform = "windows";
    architecture = "x64";
    label = "Windows x64";
  } else if (lowered.includes("peardrop-macos-arm64")) {
    platform = "mac";
    architecture = "arm64";
    label = "macOS Apple Silicon";
  } else if (lowered.includes("peardrop-macos-x64")) {
    platform = "mac";
    architecture = "x64";
    label = "macOS Intel";
  } else if (lowered.includes("peardrop-linux-arm64")) {
    platform = "linux";
    architecture = "arm64";
    label = "Linux arm64";
  } else if (lowered.includes("peardrop-linux-x64")) {
    platform = "linux";
    architecture = "x64";
    label = "Linux x64";
  } else {
    return null;
  }

  return {
    name,
    url,
    size: Number(asset.size || 0),
    sizeLabel: formatFileSize(asset.size),
    platform,
    architecture,
    label,
    format: releaseAssetFormat(name),
  };
}

export function filterReleaseAssets(release, platform = "all") {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  if (!platform || platform === "all") return assets;
  return assets.filter((asset) => asset.platform === platform);
}

export function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return "";
  const megabytes = size / 1024 / 1024;
  if (megabytes >= 1000) return `${(megabytes / 1024).toFixed(1)} GB`;
  return `${Math.round(megabytes)} MB`;
}

export function formatReleaseDate(value, locale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(locale || undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function compareAssets(left, right) {
  const platformDifference =
    (PLATFORM_ORDER.get(left.platform) ?? 99) -
    (PLATFORM_ORDER.get(right.platform) ?? 99);
  if (platformDifference !== 0) return platformDifference;
  if (left.architecture === right.architecture) return 0;
  return left.architecture === "arm64" ? -1 : 1;
}

function releaseAssetFormat(name) {
  const lowered = String(name || "").toLowerCase();
  if (lowered.endsWith(".tar.gz")) return "tar.gz";
  if (lowered.endsWith(".appimage")) return "AppImage";
  if (lowered.endsWith(".dmg")) return "DMG";
  if (lowered.endsWith(".exe")) return "EXE";
  return "Download";
}
