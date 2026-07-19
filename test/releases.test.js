import test from "node:test";
import assert from "node:assert/strict";
import {
  filterReleaseAssets,
  formatFileSize,
  normalizeRelease,
  normalizeReleaseAsset,
} from "../src/lib/releases.js";

test("normalizeReleaseAsset supports current Linux archives", () => {
  const asset = normalizeReleaseAsset({
    name: "PearDrop-linux-arm64.tar.gz",
    browser_download_url: "https://example.com/linux-arm64.tar.gz",
    size: 157706780,
  });

  assert.deepEqual(asset, {
    name: "PearDrop-linux-arm64.tar.gz",
    url: "https://example.com/linux-arm64.tar.gz",
    size: 157706780,
    sizeLabel: "150 MB",
    platform: "linux",
    architecture: "arm64",
    label: "Linux arm64",
    format: "tar.gz",
  });
});

test("normalizeReleaseAsset supports older AppImage releases", () => {
  const asset = normalizeReleaseAsset({
    name: "PearDrop-linux-x64.AppImage",
    browser_download_url: "https://example.com/linux-x64.AppImage",
    size: 158695211,
  });

  assert.equal(asset?.platform, "linux");
  assert.equal(asset?.architecture, "x64");
  assert.equal(asset?.format, "AppImage");
});

test("normalizeRelease ignores unrelated assets and sorts supported platforms", () => {
  const release = normalizeRelease({
    tag_name: "v1.2.3",
    assets: [
      releaseAsset("PearDrop-linux-x64.AppImage"),
      releaseAsset("applings.zip"),
      releaseAsset("PearDrop-macos-arm64.dmg"),
      releaseAsset("PearDrop-Setup.exe"),
    ],
  });

  assert.deepEqual(
    release.assets.map((asset) => asset.platform),
    ["windows", "mac", "linux"],
  );
  assert.equal(release.assets.length, 3);
});

test("filterReleaseAssets selects one platform without changing all view", () => {
  const release = normalizeRelease({
    tag_name: "v1.2.3",
    assets: [
      releaseAsset("PearDrop-linux-x64.AppImage"),
      releaseAsset("PearDrop-linux-arm64.tar.gz"),
      releaseAsset("PearDrop-macos-x64.dmg"),
    ],
  });

  assert.equal(filterReleaseAssets(release, "linux").length, 2);
  assert.equal(filterReleaseAssets(release, "mac").length, 1);
  assert.equal(filterReleaseAssets(release, "all").length, 3);
});

test("formatFileSize formats megabyte and gigabyte assets", () => {
  assert.equal(formatFileSize(170 * 1024 * 1024), "170 MB");
  assert.equal(formatFileSize(1.5 * 1024 * 1024 * 1024), "1.5 GB");
  assert.equal(formatFileSize(0), "");
});

function releaseAsset(name) {
  return {
    name,
    browser_download_url: `https://example.com/${name}`,
    size: 1024,
  };
}
