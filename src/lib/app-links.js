const FALLBACK_RELEASES_URL =
  "https://github.com/geordangesink/Pear-Drops-Desktop/releases";
const FALLBACK_WINDOWS_URL =
  "https://github.com/geordangesink/Pear-Drops-Desktop/releases/latest/download/PearDrop-Setup.exe";
const FALLBACK_MAC_ARM64_URL =
  "https://github.com/geordangesink/Pear-Drops-Desktop/releases/latest/download/PearDrop-macos-arm64.dmg";
const FALLBACK_MAC_X64_URL =
  "https://github.com/geordangesink/Pear-Drops-Desktop/releases/latest/download/PearDrop-macos-x64.dmg";
const FALLBACK_LINUX_ARM64_URL =
  "https://github.com/geordangesink/Pear-Drops-Desktop/releases/latest/download/PearDrop-linux-arm64.AppImage";
const FALLBACK_LINUX_X64_URL =
  "https://github.com/geordangesink/Pear-Drops-Desktop/releases/latest/download/PearDrop-linux-x64.AppImage";
const FALLBACK_SITE_ORIGIN = "https://peardrop.online";

const ENV = typeof import.meta !== "undefined" ? import.meta.env || {} : {};

function resolveWindowsInstallerUrl() {
  const configured = String(ENV.VITE_WINDOWS_INSTALLER_URL || "").trim();
  if (!configured) return FALLBACK_WINDOWS_URL;

  // Temporary guard: ignore legacy Railway-hosted Windows links and prefer GitHub releases.
  const lowered = configured.toLowerCase();
  if (
    lowered.includes(".up.railway.app/") ||
    lowered.includes("/downloads/win32/")
  ) {
    return FALLBACK_WINDOWS_URL;
  }

  return configured;
}

export const APP_LINKS = {
  siteOrigin: String(ENV.VITE_PUBLIC_SITE_ORIGIN || FALLBACK_SITE_ORIGIN),
  windows: resolveWindowsInstallerUrl(),
  macArm64: String(ENV.VITE_MAC_INSTALLER_ARM64_URL || FALLBACK_MAC_ARM64_URL),
  macX64: String(ENV.VITE_MAC_INSTALLER_X64_URL || FALLBACK_MAC_X64_URL),
  linuxArm64: String(
    ENV.VITE_LINUX_INSTALLER_ARM64_URL || FALLBACK_LINUX_ARM64_URL,
  ),
  linuxX64: String(ENV.VITE_LINUX_INSTALLER_X64_URL || FALLBACK_LINUX_X64_URL),
  ios: String(ENV.VITE_IOS_APP_URL || ""),
  android: String(ENV.VITE_ANDROID_APP_URL || ""),
  releases: String(ENV.VITE_RELEASES_URL || FALLBACK_RELEASES_URL),
};

export function detectClientPlatform(uaInput = "") {
  const ua = String(
    uaInput || (typeof navigator !== "undefined" ? navigator.userAgent : ""),
  ).toLowerCase();
  const isAndroid = ua.includes("android");
  const isIPhone = ua.includes("iphone");
  const isIPad = ua.includes("ipad");
  const isIOS = isIPhone || isIPad;
  const isWindows = ua.includes("windows");
  const isMac = ua.includes("mac os x") && !isIOS;
  const isLinux = ua.includes("linux") && !isAndroid;
  const desktopArch = detectDesktopArch(ua);

  if (isIOS) return { id: "ios", label: "iOS", group: "mobile", arch: "" };
  if (isAndroid) {
    return { id: "android", label: "Android", group: "mobile", arch: "" };
  }
  if (isWindows) {
    return { id: "windows", label: "Windows", group: "desktop", arch: "" };
  }
  if (isMac) {
    return { id: "mac", label: "macOS", group: "desktop", arch: desktopArch };
  }
  if (isLinux) {
    return { id: "linux", label: "Linux", group: "desktop", arch: desktopArch };
  }
  return { id: "unknown", label: "Your device", group: "unknown", arch: "" };
}

export function installerUrlForPlatform(platformId, platformInfo = null) {
  const arch =
    String(platformInfo?.arch || "")
      .trim()
      .toLowerCase() || "";
  if (platformId === "ios") return APP_LINKS.ios;
  if (platformId === "android") return APP_LINKS.android;
  if (platformId === "windows") return APP_LINKS.windows;
  if (platformId === "mac") {
    return arch === "x64" ? APP_LINKS.macX64 : APP_LINKS.macArm64;
  }
  if (platformId === "linux") {
    return arch === "arm64" ? APP_LINKS.linuxArm64 : APP_LINKS.linuxX64;
  }
  return "";
}

export function buildDownloadPageUrl({
  invite = "",
  source = "",
  auto = false,
} = {}) {
  const params = new URLSearchParams();
  const platform = detectClientPlatform().id;
  if (platform) params.set("platform", platform);
  if (invite) params.set("invite", invite);
  if (source) params.set("source", source);
  if (auto) params.set("auto", "1");
  const query = params.toString();
  return query ? `/?${query}#downloads` : "/#downloads";
}

export function buildWebClientInviteUrl(invite = "") {
  const safeInvite = toInviteUrl(invite);
  if (!safeInvite) return "/web-client/";
  return `/web-client/?invite=${encodeURIComponent(safeInvite)}`;
}

export function buildOpenInviteLink(invite = "", { absolute = true } = {}) {
  const safeInvite = toInviteUrl(invite);
  if (!safeInvite) return absolute ? `${APP_LINKS.siteOrigin}/open/` : "/open/";
  const path = `/open/?invite=${encodeURIComponent(safeInvite)}`;
  return absolute ? `${APP_LINKS.siteOrigin}${path}` : path;
}

export function toInviteUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("peardrops-web://join")) return raw;
  if (raw.startsWith("peardrops://invite")) return raw;

  try {
    const parsed = new URL(raw);
    const protocol = String(parsed.protocol || "").toLowerCase();

    if (protocol === "http:" || protocol === "https:") {
      const nested = parsed.searchParams.get("invite");
      if (nested) return toInviteUrl(nested);
      if (hasInviteCoordinates(parsed.searchParams)) {
        return `peardrops://invite${parsed.search || ""}`;
      }
      return "";
    }

    if (protocol === "peardrops-web:") {
      const nested = parsed.searchParams.get("invite");
      if (nested) return toInviteUrl(nested);
      if (hasInviteCoordinates(parsed.searchParams)) {
        return `peardrops-web://join${parsed.search || ""}`;
      }
      return "";
    }

    if (protocol === "peardrops:") {
      const nested = parsed.searchParams.get("invite");
      if (nested) return toInviteUrl(nested);
      if (hasInviteCoordinates(parsed.searchParams)) {
        return `peardrops://invite${parsed.search || ""}`;
      }
    }
  } catch {}

  return "";
}

export function toNativeInviteUrl(value) {
  const invite = toInviteUrl(value);
  if (!invite) return "";
  if (invite.startsWith("peardrops://invite")) return invite;

  if (invite.startsWith("peardrops-web://join")) {
    try {
      const parsed = new URL(invite);
      const nested = parsed.searchParams.get("invite");
      if (nested && nested.startsWith("peardrops://invite")) return nested;
    } catch {}
  }

  try {
    const parsed = new URL(invite);
    if (hasInviteCoordinates(parsed.searchParams)) {
      return `peardrops://invite${parsed.search || ""}`;
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

function detectDesktopArch(ua) {
  const lowered = String(ua || "").toLowerCase();
  if (
    lowered.includes("arm64") ||
    lowered.includes("aarch64") ||
    lowered.includes("armv8")
  ) {
    return "arm64";
  }
  if (
    lowered.includes("x86_64") ||
    lowered.includes("amd64") ||
    lowered.includes("x64") ||
    lowered.includes("intel")
  ) {
    return "x64";
  }
  return "";
}
