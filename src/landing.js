import {
  APP_LINKS,
  detectClientPlatform,
  installerUrlForPlatform,
} from "./lib/app-links.js";

const app = document.getElementById("app");
const platform = detectClientPlatform();
const recommendedInstaller = installerUrlForPlatform(platform.id, platform);
const recommendedActions = resolveRecommendedActions(
  platform,
  recommendedInstaller,
);

app.innerHTML = `
  <style>
    :root {
      --bg: #0b1320;
      --bg-2: #12233a;
      --panel: #ffffff;
      --line: #d7e3ef;
      --text: #0f2237;
      --muted: #647b92;
      --brand: #1a7cf0;
      --brand-2: #1262be;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      background:
        radial-gradient(1200px 520px at 15% -10%, #294a70 0%, transparent 62%),
        radial-gradient(900px 440px at 100% 0%, #12365a 0%, transparent 64%),
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
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: linear-gradient(180deg, #ffffff 0%, #f7fbff 100%);
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.35);
    }
    .hero {
      padding: 38px 34px 30px;
      border-bottom: 1px solid var(--line);
      background:
        radial-gradient(500px 240px at 100% -20%, rgba(26, 124, 240, 0.18), transparent 70%),
        radial-gradient(520px 230px at -20% -40%, rgba(53, 181, 128, 0.14), transparent 70%);
    }
    h1 {
      margin: 16px 0 0;
      font-size: clamp(40px, 7vw, 66px);
      line-height: 0.95;
      letter-spacing: -0.03em;
      color: #0a1e33;
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
      background: linear-gradient(180deg, var(--brand), var(--brand-2));
      box-shadow: 0 10px 24px rgba(26, 124, 240, 0.3);
    }
    .btn.alt {
      color: #274a64;
      background: #f1f7fd;
      border-color: #c5d7e8;
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
      background: #fff;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 132px;
    }
    .card h2 {
      margin: 0;
      font-size: 18px;
      color: #163149;
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
      color: #7890a6;
      font-size: 12px;
    }
    .legal {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .legal a {
      color: #4a6680;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      border-bottom: 1px solid #c5d5e5;
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
    <h1>PearDrop</h1>
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
      <a class="btn alt" href="#downloads">All Downloads</a>
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
      ${downloadCardWithOptions("Mobile", "iOS / Android", [
        { label: "iOS (App Store)", href: APP_LINKS.ios },
        { label: "Android (Coming soon)", href: "" },
      ])}
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
      primaryLabel: "Download for macOS",
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
