const FALLBACK_RELEASES_URL = "https://github.com/geordangesink/Pear-Drops-Desktop/releases";
const FALLBACK_WINDOWS_URL =
  "https://github.com/geordangesink/Pear-Drops-Desktop/releases/download/main-latest/PearDrop-Setup.exe";
const FALLBACK_MAC_URL =
  "https://github.com/geordangesink/Pear-Drops-Desktop/releases/download/main-latest/PearDrop.dmg";
const FALLBACK_LINUX_URL =
  "https://github.com/geordangesink/Pear-Drops-Desktop/releases/download/main-latest/PearDrop.AppImage";
const FALLBACK_SITE_ORIGIN = "https://peardrop.online";

const ENV = typeof import.meta !== "undefined" ? import.meta.env || {} : {};

export const APP_LINKS = {
  siteOrigin: String(ENV.VITE_PUBLIC_SITE_ORIGIN || FALLBACK_SITE_ORIGIN),
  windows: String(ENV.VITE_WINDOWS_INSTALLER_URL || FALLBACK_WINDOWS_URL),
  mac: String(ENV.VITE_MAC_INSTALLER_URL || FALLBACK_MAC_URL),
  linux: String(ENV.VITE_LINUX_INSTALLER_URL || FALLBACK_LINUX_URL),
  ios: String(ENV.VITE_IOS_APP_URL || ""),
  android: String(ENV.VITE_ANDROID_APP_URL || ""),
  releases: String(ENV.VITE_RELEASES_URL || FALLBACK_RELEASES_URL),
};

export function detectClientPlatform(uaInput = "") {
  const ua = String(
    uaInput || (typeof navigator !== "undefined" ? navigator.userAgent : "")
  ).toLowerCase();
  const isAndroid = ua.includes("android");
  const isIPhone = ua.includes("iphone");
  const isIPad = ua.includes("ipad");
  const isIOS = isIPhone || isIPad;
  const isWindows = ua.includes("windows");
  const isMac = ua.includes("mac os x") && !isIOS;
  const isLinux = ua.includes("linux") && !isAndroid;

  if (isIOS) return { id: "ios", label: "iOS", group: "mobile" };
  if (isAndroid) return { id: "android", label: "Android", group: "mobile" };
  if (isWindows) return { id: "windows", label: "Windows", group: "desktop" };
  if (isMac) return { id: "mac", label: "macOS", group: "desktop" };
  if (isLinux) return { id: "linux", label: "Linux", group: "desktop" };
  return { id: "unknown", label: "Your device", group: "unknown" };
}

export function installerUrlForPlatform(platformId) {
  if (platformId === "ios") return APP_LINKS.ios;
  if (platformId === "android") return APP_LINKS.android;
  if (platformId === "windows") return APP_LINKS.windows;
  if (platformId === "mac") return APP_LINKS.mac;
  if (platformId === "linux") return APP_LINKS.linux;
  return "";
}

export function buildDownloadPageUrl({ invite = "", source = "", auto = false } = {}) {
  const params = new URLSearchParams();
  const platform = detectClientPlatform().id;
  if (platform) params.set("platform", platform);
  if (invite) params.set("invite", invite);
  if (source) params.set("source", source);
  if (auto) params.set("auto", "1");
  return `/download.html?${params.toString()}`;
}

export function buildWebClientInviteUrl(invite = "") {
  const safeInvite = toNativeInviteUrl(invite);
  if (!safeInvite) return "/web-client/";
  return `/web-client/?invite=${encodeURIComponent(safeInvite)}`;
}

export function buildOpenInviteLink(invite = "", { absolute = true } = {}) {
  const safeInvite = toNativeInviteUrl(invite);
  if (!safeInvite) return absolute ? `${APP_LINKS.siteOrigin}/open/` : "/open/";
  const path = `/open/?invite=${encodeURIComponent(safeInvite)}`;
  return absolute ? `${APP_LINKS.siteOrigin}${path}` : path;
}

export function toNativeInviteUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("peardrops://invite")) return raw;

  if (raw.startsWith("peardrops-web://join")) {
    try {
      const parsed = new URL(raw);
      const nested = parsed.searchParams.get("invite");
      if (nested && nested.startsWith("peardrops://invite")) return nested;
      if (parsed.search) return `peardrops://invite${parsed.search}`;
    } catch {
      return "";
    }
  }

  try {
    const parsed = new URL(raw);
    const protocol = String(parsed.protocol || "").toLowerCase();

    if (protocol === "http:" || protocol === "https:") {
      const nested = parsed.searchParams.get("invite");
      if (nested) return toNativeInviteUrl(nested);
      if (hasInviteCoordinates(parsed.searchParams)) {
        return `peardrops://invite${parsed.search || ""}`;
      }
      return "";
    }

    if (protocol === "peardrops:") {
      const nested = parsed.searchParams.get("invite");
      if (nested) return toNativeInviteUrl(nested);
      if (hasInviteCoordinates(parsed.searchParams)) {
        return `peardrops://invite${parsed.search || ""}`;
      }
    }
  } catch {}

  return "";
}

function hasInviteCoordinates(searchParams) {
  return (
    searchParams.has("drive") ||
    searchParams.has("room") ||
    searchParams.has("topic") ||
    searchParams.has("relay") ||
    searchParams.has("web") ||
    searchParams.has("signal")
  );
}
