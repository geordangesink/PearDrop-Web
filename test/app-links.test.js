import test from "node:test";
import assert from "node:assert/strict";
import {
  detectClientPlatform,
  toInviteUrl,
  toNativeInviteUrl,
} from "../src/lib/app-links.js";

test("toNativeInviteUrl accepts https open links with nested invite", () => {
  const native =
    "peardrops://invite?drive=abc123&relay=wss%3A%2F%2Fpear-drops.up.railway.app";
  const httpsLink = `https://peardrop.online/open/?invite=${encodeURIComponent(native)}`;
  assert.equal(toNativeInviteUrl(httpsLink), native);
});

test("toNativeInviteUrl accepts https links with invite coordinates directly", () => {
  const input =
    "https://peardrop.online/open/?drive=abc123&room=room123&relay=wss%3A%2F%2Fpear-drops.up.railway.app";
  assert.equal(
    toNativeInviteUrl(input),
    "peardrops://invite?drive=abc123&room=room123&relay=wss%3A%2F%2Fpear-drops.up.railway.app",
  );
});

test("toInviteUrl preserves peardrops-web invite inside https open links", () => {
  const webInvite =
    "peardrops-web://join?signal=abc123&relay=wss%3A%2F%2Fpear-drops.up.railway.app&invite=peardrops%3A%2F%2Finvite%3Fdrive%3Dabc123";
  const httpsLink = `https://peardrop.online/open/?invite=${encodeURIComponent(webInvite)}`;
  assert.equal(toInviteUrl(httpsLink), webInvite);
});

test("toNativeInviteUrl resolves native invite nested inside peardrops-web link", () => {
  const native = "peardrops://invite?drive=abc123&room=room123";
  const webInvite = `peardrops-web://join?signal=abc123&invite=${encodeURIComponent(native)}`;
  const httpsLink = `https://peardrop.online/open/?invite=${encodeURIComponent(webInvite)}`;
  assert.equal(toNativeInviteUrl(httpsLink), native);
});

test("generic macOS user agents do not guess Intel architecture", () => {
  const platform = detectClientPlatform(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  );

  assert.equal(platform.id, "mac");
  assert.equal(platform.arch, "");
});

test("explicit desktop architecture markers are preserved", () => {
  assert.equal(detectClientPlatform("Mac OS X x86_64").arch, "x64");
  assert.equal(detectClientPlatform("Linux aarch64").arch, "arm64");
});
