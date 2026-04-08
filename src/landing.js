import {
  APP_LINKS,
  detectClientPlatform,
  installerUrlForPlatform,
} from "./lib/app-links.js";

const app = document.getElementById("app");
const platform = detectClientPlatform();
const recommendedInstaller = installerUrlForPlatform(platform.id);

app.innerHTML = `
  <style>
    body {
      margin: 0;
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      color: #162737;
      background: radial-gradient(circle at top left, #e8f4ef, #eef5ff 55%, #f7fafc);
    }
    main {
      max-width: 980px;
      margin: 36px auto;
      padding: 24px;
      background: #fff;
      border: 1px solid #d7e3ef;
      border-radius: 16px;
      box-shadow: 0 18px 42px rgba(22, 39, 55, 0.1);
    }
    h1 {
      margin: 0;
      font-size: 40px;
      line-height: 1.05;
    }
    .sub {
      margin: 10px 0 0;
      color: #547089;
      font-size: 16px;
    }
    .hero {
      margin-top: 14px;
      padding: 14px;
      border: 1px solid #d2e1f0;
      border-radius: 14px;
      background: linear-gradient(180deg, #f9fcff 0%, #f3f9ff 100%);
    }
    .top-actions {
      margin-top: 10px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 11px;
      border: 1px solid transparent;
      text-decoration: none;
      font-weight: 700;
      padding: 10px 14px;
      cursor: pointer;
    }
    .btn.primary {
      background: #1f7ae0;
      color: #fff;
      border-color: #1f7ae0;
    }
    .btn.alt {
      background: #f1f7fd;
      color: #22465f;
      border-color: #c2d6ea;
    }
    .grid {
      margin-top: 14px;
      display: grid;
      grid-template-columns: repeat(2, minmax(230px, 1fr));
      gap: 10px;
    }
    .card {
      border: 1px solid #d6e2ee;
      border-radius: 12px;
      background: #fff;
      padding: 12px;
    }
    .card h2 {
      margin: 0 0 7px;
      font-size: 16px;
      color: #1e3a51;
    }
    .card p {
      margin: 0 0 8px;
      color: #607a90;
      font-size: 13px;
    }
    .section-title {
      margin: 18px 0 0;
      font-size: 22px;
    }
    @media (max-width: 780px) {
      main {
        margin: 14px;
        padding: 16px;
      }
      h1 {
        font-size: 32px;
      }
      .grid {
        grid-template-columns: 1fr;
      }
    }
  </style>

  <h1>Pear Drop</h1>
  <p class="sub">Native-first file sharing with invite links across desktop, mobile, and web.</p>

  <section class="hero">
    <strong>Detected device: ${escapeHtml(platform.label)}</strong>
    <div class="top-actions">
      ${
        recommendedInstaller
          ? `<a class="btn primary" href="${escapeHtmlAttr(recommendedInstaller)}">Download for ${escapeHtml(platform.label)}</a>`
          : `<a class="btn primary" href="/download.html">View Downloads</a>`
      }
      <a class="btn alt" href="/download.html">All Installers</a>
      <a class="btn alt" href="/web-client/">Open Web Client</a>
    </div>
  </section>

  <h2 class="section-title">Installers</h2>
  <section class="grid">
    ${installerCard("Windows (.msix)", APP_LINKS.windows)}
    ${installerCard("macOS (.dmg)", APP_LINKS.mac)}
    ${installerCard("Linux (.AppImage)", APP_LINKS.linux)}
    ${installerCard("Mobile (iOS / Android)", "/download.html")}
  </section>

  <h2 class="section-title">Use in Browser</h2>
  <section class="card">
    <h2>Web Client</h2>
    <p>Open invite links directly in the browser to view drive files and download selected items.</p>
    <a class="btn primary" href="/web-client/">Go to Web Client</a>
  </section>
`;

function installerCard(title, href) {
  const safeHref = String(href || "").trim();
  return `
    <article class="card">
      <h2>${escapeHtml(title)}</h2>
      <p>Direct installer download.</p>
      ${
        safeHref
          ? `<a class="btn alt" href="${escapeHtmlAttr(safeHref)}">Download</a>`
          : `<span class="btn alt" style="opacity:.55; cursor:default;">Coming soon</span>`
      }
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
