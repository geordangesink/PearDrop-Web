import {
  APP_LINKS,
  detectClientPlatform,
  installerUrlForPlatform,
} from "./lib/app-links.js";
import { initTheme } from "./lib/theme.js";

const app = document.getElementById("app");
const platform = detectClientPlatform();
const recommendedInstaller = installerUrlForPlatform(platform.id, platform);
const recommendedActions = resolveRecommendedActions(
  platform,
  recommendedInstaller,
);

app.innerHTML = `
  <style>
    :root[data-theme="light"] {
      --bg: #f4f5f7;
      --bg-2: #eef1f4;
      --bg-radial-1: rgba(27, 163, 68, 0.14);
      --bg-radial-2: rgba(14, 108, 44, 0.09);
      --panel: #ffffff;
      --panel-2: #ffffff;
      --line: #d8dce3;
      --text: #171a21;
      --muted: #5e6675;
      --accent: #1ba344;
      --accent-2: #158238;
      --accent-soft: #eef9f1;
      --link: #1f5a36;
      --shadow: rgba(17, 26, 33, 0.12);
    }
    :root[data-theme="dark"] {
      --bg: #121212;
      --bg-2: #161616;
      --bg-radial-1: rgba(27, 163, 68, 0.2);
      --bg-radial-2: rgba(13, 84, 36, 0.22);
      --panel: #161616;
      --panel-2: #1a1a1a;
      --line: #2a2a2a;
      --text: #f1f3f4;
      --muted: #a4a7ad;
      --accent: #1ba344;
      --accent-2: #158238;
      --accent-soft: #1d2a20;
      --link: #6ed38a;
      --shadow: rgba(0, 0, 0, 0.38);
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      background:
        radial-gradient(1200px 520px at 15% -10%, var(--bg-radial-1) 0%, transparent 62%),
        radial-gradient(900px 440px at 100% 0%, var(--bg-radial-2) 0%, transparent 64%),
        linear-gradient(180deg, var(--bg), var(--bg-2));
      color: var(--text);
      min-height: 100vh;
      padding: 20px 0;
      overflow-x: hidden;
    }
    main {
      width: min(980px, 94vw);
      margin: 0 auto;
      border-radius: 20px;
      overflow: hidden;
      border: 1px solid var(--line);
      background: linear-gradient(180deg, var(--panel) 0%, var(--panel-2) 100%);
      box-shadow: 0 24px 64px var(--shadow);
    }
    .hero {
      padding: 38px 34px 30px;
      border-bottom: 1px solid var(--line);
      background:
        radial-gradient(500px 240px at 100% -20%, rgba(27, 163, 68, 0.17), transparent 70%),
        radial-gradient(520px 230px at -20% -40%, rgba(21, 130, 56, 0.14), transparent 70%);
    }
    .theme-switch {
      display: inline-flex;
      gap: 6px;
      padding: 4px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: var(--panel);
    }
    .theme-btn {
      border: 1px solid var(--line);
      background: var(--panel-2);
      color: var(--muted);
      padding: 7px 10px;
      border-radius: 9px;
      font-weight: 700;
      font-size: 12px;
      line-height: 1;
      cursor: pointer;
    }
    .theme-btn.is-active {
      border-color: var(--accent);
      color: var(--accent);
      background: var(--accent-soft);
    }
    h1 {
      margin: 8px 0 0;
      font-size: clamp(40px, 7vw, 66px);
      line-height: 0.95;
      letter-spacing: -0.03em;
      color: var(--text);
    }
    .title-row {
      margin-top: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .title-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .title-logo {
      width: 66px;
      height: 66px;
      object-fit: contain;
      background: var(--panel);
      flex: 0 0 auto;
    }
    .sub {
      margin: 12px 0 0;
      max-width: 700px;
      color: var(--muted);
      font-size: 19px;
      line-height: 1.45;
    }
    .actions {
      margin-top: 22px;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .btn {
      text-decoration: none;
      border-radius: 12px;
      padding: 11px 16px;
      font-weight: 700;
      border: 1px solid transparent;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: transform 130ms ease, box-shadow 130ms ease;
    }
    .btn:hover {
      transform: translateY(-1px);
    }
    .btn.primary {
      color: #fff;
      background: linear-gradient(180deg, var(--accent), var(--accent-2));
      box-shadow: 0 10px 24px rgba(27, 163, 68, 0.28);
    }
    .btn.alt {
      color: var(--link);
      background: var(--accent-soft);
      border-color: var(--line);
    }
    .downloads {
      padding: 22px 24px 18px;
    }
    .downloads-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 12px;
    }
    .downloads-title {
      margin: 0;
      font-size: 23px;
      letter-spacing: -0.01em;
    }
    .mini {
      color: var(--muted);
      font-size: 13px;
      font-weight: 600;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .card {
      border: 1px solid var(--line);
      border-radius: 13px;
      background: var(--panel);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 132px;
    }
    .card h2 {
      margin: 0;
      font-size: 18px;
      color: var(--text);
    }
    .card p {
      margin: 0;
      color: #71869c;
      font-size: 13px;
      line-height: 1.4;
      min-height: 36px;
    }
    .card .btn {
      margin-top: auto;
      align-self: flex-start;
      padding: 8px 12px;
      border-radius: 10px;
      font-size: 14px;
    }
    .footer {
      border-top: 1px solid var(--line);
      padding: 14px 22px 18px;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 8px 14px;
    }
    .footer-copy {
      color: var(--muted);
      font-size: 12px;
    }
    .legal {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .legal a {
      color: var(--link);
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      border-bottom: 1px solid var(--line);
    }
    @media (max-width: 980px) {
      .grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 680px) {
      main {
        width: calc(100vw - 16px);
        margin: 0 auto;
        border-radius: 14px;
      }
      body {
        padding: 8px 0;
      }
      .hero {
        padding: 22px 14px 18px;
      }
      .sub {
        font-size: 16px;
      }
      .title-row {
        gap: 10px;
      }
      .title-logo {
        width: 42px;
        height: 42px;
      }
      .downloads {
        padding: 16px 12px 12px;
      }
      .grid {
        grid-template-columns: 1fr;
      }
      .footer {
        padding: 12px;
      }
    }
  </style>

  <section class="hero">
    <div class="title-row">
      <div class="title-brand">
        <img class="title-logo" src="/images/logo.png" alt="PearDrop logo" />
        <h1>PearDrop</h1>
      </div>
      <div class="theme-switch" role="group" aria-label="Theme">
        <button class="theme-btn" data-theme-mode="system" aria-pressed="false">System</button>
        <button class="theme-btn" data-theme-mode="dark" aria-pressed="false">Dark</button>
        <button class="theme-btn" data-theme-mode="light" aria-pressed="false">Light</button>
      </div>
    </div>
    <p class="sub">Share files with one link. Fast in app, instant in browser.</p>
    <div class="actions">
      ${
        recommendedActions.primaryHref
          ? `<a class="btn primary" href="${escapeHtmlAttr(recommendedActions.primaryHref)}">${escapeHtml(recommendedActions.primaryLabel || `Download for ${platform.label}`)}</a>`
          : `<a class="btn primary" href="#downloads">Download App</a>`
      }
      ${
        recommendedActions.secondaryHref
          ? `<a class="btn alt" href="${escapeHtmlAttr(recommendedActions.secondaryHref)}">${escapeHtml(recommendedActions.secondaryLabel || "Other architecture")}</a>`
          : ""
      }
      <a class="btn alt" href="/web-client/">Use in Browser</a>
    </div>
  </section>

  <section id="downloads" class="downloads">
    <div class="downloads-head">
      <h2 class="downloads-title">Downloads</h2>
      <span class="mini">No account required</span>
    </div>
    <div class="grid">
      ${downloadCard("Windows", ".exe", APP_LINKS.windows)}
      ${downloadCardWithOptions("macOS", ".dmg", [
        { label: "Apple Silicon (arm64)", href: APP_LINKS.macArm64 },
        { label: "Intel (x64)", href: APP_LINKS.macX64 },
      ])}
      ${downloadCardWithOptions("Linux", ".AppImage", [
        { label: "arm64", href: APP_LINKS.linuxArm64 },
        { label: "x64", href: APP_LINKS.linuxX64 },
      ])}
      ${downloadCard("iOS", "App Store", APP_LINKS.ios)}
      ${downloadCard("Android", "Google Play", APP_LINKS.android)}
    </div>
  </section>

  <footer class="footer">
    <span class="footer-copy">PearDrop</span>
    <nav class="legal">
      <a href="/support.html">Support</a>
      <a href="/impressum.html">Legal Notice</a>
      <a href="/privacy.html">Privacy Policy</a>
      <a href="/terms.html">Terms</a>
    </nav>
  </footer>
`;

initTheme(app);

function downloadCard(name, ext, href) {
  const url = String(href || "").trim();
  return `
    <article class="card">
      <h2>${escapeHtml(name)}</h2>
      <p>${escapeHtml(ext)}</p>
      ${
        url
          ? `<a class="btn alt" href="${escapeHtmlAttr(url)}">Download</a>`
          : `<span class="btn alt" style="opacity:.55; cursor:default;">Coming soon</span>`
      }
    </article>
  `;
}

function downloadCardWithOptions(name, ext, options = []) {
  const available = options.filter((item) => String(item?.href || "").trim());
  return `
    <article class="card">
      <h2>${escapeHtml(name)}</h2>
      <p>${escapeHtml(ext)}</p>
      ${
        available.length > 0
          ? available
              .map(
                (item) =>
                  `<a class="btn alt" href="${escapeHtmlAttr(item.href)}">${escapeHtml(item.label || "Download")}</a>`,
              )
              .join("")
          : `<span class="btn alt" style="opacity:.55; cursor:default;">Coming soon</span>`
      }
    </article>
  `;
}

function resolveRecommendedActions(platformInfo, fallbackInstaller) {
  const id = String(platformInfo?.id || "").toLowerCase();
  if (id === "mac") {
    return {
      primaryHref: APP_LINKS.macArm64,
      primaryLabel: "Download for macOS (M-chip)",
      secondaryHref: APP_LINKS.macX64,
      secondaryLabel: "macOS Intel (x64)",
    };
  }
  if (id === "linux") {
    return {
      primaryHref: APP_LINKS.linuxX64,
      primaryLabel: "Download for Linux",
      secondaryHref: APP_LINKS.linuxArm64,
      secondaryLabel: "Linux arm64",
    };
  }
  return {
    primaryHref: fallbackInstaller,
    primaryLabel: `Download for ${platformInfo?.label || "your device"}`,
    secondaryHref: "",
    secondaryLabel: "",
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}
