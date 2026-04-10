import test from "node:test";
import assert from "node:assert/strict";
import { toNativeInviteUrl } from "../src/lib/app-links.js";

test("toNativeInviteUrl accepts https open links with nested invite", () => {
  const native = "peardrops://invite?drive=abc123&relay=wss%3A%2F%2Fpear-drops.up.railway.app";
  const httpsLink = `https://peardrop.online/open/?invite=${encodeURIComponent(native)}`;
  assert.equal(toNativeInviteUrl(httpsLink), native);
});

test("toNativeInviteUrl accepts https links with invite coordinates directly", () => {
  const input =
    "https://peardrop.online/open/?drive=abc123&room=room123&relay=wss%3A%2F%2Fpear-drops.up.railway.app";
  assert.equal(
    toNativeInviteUrl(input),
    "peardrops://invite?drive=abc123&room=room123&relay=wss%3A%2F%2Fpear-drops.up.railway.app"
  );
});
