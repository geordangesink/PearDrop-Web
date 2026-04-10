import {
  APP_LINKS,
  detectClientPlatform,
  installerUrlForPlatform,
} from "./lib/app-links.js";

const app = document.getElementById("app");
const params = new URLSearchParams(location.search);
const platformInfo = detectClientPlatform();
const preferredUrl = installerUrlForPlatform(platformInfo.id);
const auto = params.get("auto") === "1";

app.innerHTML = `
  <style>
    body {
      margin: 0;
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      color: #112130;
      background: radial-gradient(circle at top left, #e8f4ef, #eef5ff 55%, #f7fafc);
    }
    main {
      max-width: 860px;
      margin: 38px auto;
      padding: 22px;
      background: #fff;
      border: 1px solid #d8e2ee;
      border-radius: 16px;
      box-shadow: 0 16px 40px rgba(17, 33, 48, 0.1);
    }
    h1 {
      margin: 0;
      font-size: 34px;
      line-height: 1.1;
    }
    .sub {
      margin: 8px 0 0;
      color: #4f6477;
    }
    .top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .badge {
      border: 1px solid #c6d7e8;
      border-radius: 999px;
      padding: 7px 12px;
      color: #36536a;
      background: #f4f9ff;
      font-weight: 600;
      font-size: 13px;
    }
    .hero {
      margin-top: 14px;
      border: 1px solid #d4e0ec;
      border-radius: 14px;
      padding: 14px;
      background: linear-gradient(180deg, #f9fcff 0%, #f4f9ff 100%);
    }
    .actions {
      margin-top: 12px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .btn {
      border: 0;
      border-radius: 11px;
      background: #1f7ae0;
      color: #fff;
      padding: 10px 14px;
      cursor: pointer;
      text-decoration: none;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .btn.alt {
      background: #f2f7fd;
      border: 1px solid #bfd3e7;
      color: #254760;
      font-weight: 600;
    }
    .grid {
      margin-top: 16px;
      display: grid;
      grid-template-columns: repeat(2, minmax(220px, 1fr));
      gap: 10px;
    }
    .card {
      border: 1px solid #d4e0ec;
      border-radius: 12px;
      padding: 12px;
      background: #fff;
    }
    .label {
      margin: 0 0 8px;
      font-size: 15px;
      font-weight: 700;
      color: #1f3342;
    }
    .muted {
      color: #62788d;
      font-size: 13px;
      margin: 0;
    }
    @media (max-width: 760px) {
      main {
        margin: 16px;
        padding: 16px;
      }
      h1 {
        font-size: 28px;
      }
      .grid {
        grid-template-columns: 1fr;
      }
    }
  </style>

  <div class="top">
    <h1>Get PearDrop</h1>
    <span class="badge">Detected: ${escapeHtml(platformInfo.label)}</span>
  </div>
  <p class="sub">Install the app for your device, then open invites directly in PearDrop.</p>

  <section class="hero">
    <strong>Recommended for this device</strong>
    <div class="actions">
      ${
        preferredUrl
          ? `<a id="recommended-link" class="btn" href="${escapeHtmlAttr(preferredUrl)}">Download for ${escapeHtml(platformInfo.label)}</a>`
          : `<a id="recommended-link" class="btn alt" href="#all-downloads">View all download options</a>`
      }
    </div>
  </section>

  <section id="all-downloads" class="grid">
    ${downloadCard("Windows (.exe)", APP_LINKS.windows)}
    ${downloadCard("macOS (.dmg)", APP_LINKS.mac)}
    ${downloadCard("Linux (.AppImage)", APP_LINKS.linux)}
    ${downloadCard("iOS", APP_LINKS.ios)}
    ${downloadCard("Android", APP_LINKS.android)}
    ${
      APP_LINKS.releases
        ? downloadCard("All Releases", APP_LINKS.releases, "Browse all published builds.")
        : ""
    }
  </section>
`;

if (auto && preferredUrl) {
  setTimeout(() => {
    location.href = preferredUrl;
  }, 180);
}

function downloadCard(title, href, note = "") {
  if (!href) {
    return `
      <article class="card">
        <h2 class="label">${escapeHtml(title)}</h2>
        <p class="muted">Coming soon.</p>
      </article>
    `;
  }
  return `
    <article class="card">
      <h2 class="label">${escapeHtml(title)}</h2>
      <a class="btn alt" href="${escapeHtmlAttr(href)}">Download</a>
      ${note ? `<p class="muted" style="margin-top:8px;">${escapeHtml(note)}</p>` : ""}
    </article>
  `;
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
