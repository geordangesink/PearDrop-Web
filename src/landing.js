import "./styles/site.css";
import {
  APP_LINKS,
  detectClientPlatform,
  installerUrlForPlatform,
} from "./lib/app-links.js";
import {
  fetchDesktopReleases,
  filterReleaseAssets,
  formatReleaseDate,
} from "./lib/releases.js";

const ICONS = {
  arrow:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
  code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  download:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/></svg>',
  folder:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h7l2 2h9v11H3z"/></svg>',
  github:
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .8a11.4 11.4 0 0 0-3.6 22.2c.6.1.8-.2.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.9 1.3 1.9 1.3 1.1 1.9 2.9 1.3 3.6 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .4.2.7.8.6A11.4 11.4 0 0 0 12 .8Z"/></svg>',
  globe:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 15 15 9M7.5 12.5l-2 2a3.5 3.5 0 0 0 5 5l2-2M16.5 11.5l2-2a3.5 3.5 0 0 0-5-5l-2 2"/></svg>',
  linux:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 9c-.8 1.4-1.5 3.5-1.5 5.5 0 3.1 2.2 5.5 5 5.5s5-2.4 5-5.5c0-2-.7-4.1-1.5-5.5"/><path d="M9 8c0-2.4 1.3-4 3-4s3 1.6 3 4c0 1.7-1.3 3-3 3S9 9.7 9 8Z"/><path d="M10.5 7.5h.01M13.5 7.5h.01M10 10l2 1 2-1M7.5 17 5 19m11.5-2 2.5 2"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  mac: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.1 12.6c0-2.7 2.2-4 2.3-4.1a5 5 0 0 0-3.9-2.1c-1.6-.2-3.2 1-4 1-.9 0-2.1-1-3.5-1-1.8 0-3.5 1.1-4.4 2.7-1.9 3.3-.5 8.1 1.3 10.8.9 1.3 2 2.8 3.4 2.7 1.3-.1 1.9-.9 3.5-.9s2.1.9 3.5.8c1.5 0 2.4-1.3 3.3-2.6a10.7 10.7 0 0 0 1.5-3.1 4.7 4.7 0 0 1-3-4.2ZM14.4 4.7A4.8 4.8 0 0 0 15.5 1a5 5 0 0 0-3.3 1.7 4.5 4.5 0 0 0-1.1 3.5 4.1 4.1 0 0 0 3.3-1.5Z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 8h14M5 16h14"/></svg>',
  phone:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M10 5h4M11 18h2"/></svg>',
  repository:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 3h13a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2z"/><path d="M8 7h7M8 11h5M4 17h15"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 11 18-8-8 18-2-8zM11 13l4-4"/></svg>',
  windows:
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m3 5 7.7-1.1v7.4H3V5Zm8.6-1.2L21 2.5v8.8h-9.4V3.8ZM3 12.3h7.7v7.5L3 18.7v-6.4Zm8.6 0H21v8.8l-9.4-1.3v-7.5Z"/></svg>',
};

const sharedInvite = new URLSearchParams(location.search).get("invite");
const releaseState = {
  expanded: false,
  filter: "all",
  releases: [],
};
let platform = null;
let initialReleaseFilter = "all";

if (sharedInvite) {
  location.replace(`/web-client/?invite=${encodeURIComponent(sharedInvite)}`);
} else {
  renderLanding();
}

function renderLanding() {
  const app = document.getElementById("app");
  platform = detectClientPlatform();
  const recommended = resolveRecommendedDownload(platform);
  initialReleaseFilter = ["windows", "mac", "linux"].includes(platform.id)
    ? platform.id
    : "all";
  releaseState.filter = initialReleaseFilter;

  app.innerHTML = `
  <a class="skip-link" href="#content">Skip to content</a>
  ${pearInstallBanner()}
  ${siteHeader()}
  <main id="content" class="page-shell">
    <section class="hero container" aria-labelledby="hero-title">
      <div class="hero-copy reveal">
        <p class="eyebrow"><span class="eyebrow-dot"></span> Open-source peer-to-peer transfer</p>
        <h1 id="hero-title">Send files.<br /><span>Skip the cloud.</span></h1>
        <p class="hero-lede">PearDrop moves files directly between people with a simple invite link. No account, no upload queue, and no cloud folder left behind.</p>
        <div class="hero-actions">
          <a class="button button-primary" href="${escapeHtmlAttr(recommended.primaryHref)}">${ICONS.download}${escapeHtml(recommended.primaryLabel)}</a>
          <a class="button button-secondary" href="/web-client/">Try WebRTC beta${ICONS.arrow}</a>
        </div>
        <ul class="hero-proof" aria-label="PearDrop benefits">
          <li>${ICONS.check} No account</li>
          <li>${ICONS.check} Direct transfer</li>
          <li>${ICONS.check} Apache-2.0</li>
        </ul>
      </div>

      <div class="hero-visual reveal reveal-delay" aria-label="A PearDrop file transfer in progress">
        <div class="floating-chip floating-chip-one">${ICONS.lock} Direct connection</div>
        <div class="floating-chip floating-chip-two">${ICONS.code} Open source</div>
        <div class="transfer-panel">
          <div class="transfer-topbar">
            <span class="window-dots" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="connection-state"><i></i> peer connected</span>
          </div>
          <div class="transfer-content">
            <span class="transfer-label">Sending now</span>
            <div class="file-row">
              <span class="file-icon">${ICONS.file}</span>
              <div>
                <p class="file-name">project-release.tar.gz</p>
                <p class="file-meta">1.42 GB &middot; peer-to-peer</p>
              </div>
              <span class="file-percent">74%</span>
            </div>
            <div class="transfer-track" aria-hidden="true"><span></span></div>
            <div class="peer-row">
              <div class="peer"><small>From</small><strong>Your Mac</strong></div>
              <span class="peer-arrow">${ICONS.arrow}</span>
              <div class="peer"><small>To</small><strong>Alex's Linux PC</strong></div>
            </div>
          </div>
          <div class="signal-line"><span>Encrypted transport</span><span class="signal-bars" aria-hidden="true"><i></i><i></i><i></i></span></div>
        </div>
      </div>
    </section>

    <section class="trust-strip" aria-label="Project principles">
      <div class="trust-grid container">
        <div class="trust-item"><strong>Peer to peer</strong><span>Files take the direct route</span></div>
        <div class="trust-item"><strong>Open source</strong><span>Code you can inspect</span></div>
        <div class="trust-item"><strong>Cross-platform</strong><span>Desktop, mobile, and web</span></div>
        <div class="trust-item"><strong id="latest-version">Latest release</strong><span>Built and published on GitHub</span></div>
      </div>
    </section>

    <section id="how-it-works" class="section container">
      <div class="section-heading">
        <div>
          <p class="section-kicker">How it works</p>
          <h2>From your device to theirs.</h2>
        </div>
        <p>PearDrop turns a file selection into a private invite. The recipient opens it, chooses what they need, and the transfer starts.</p>
      </div>
      <div class="steps-grid">
        ${stepCard("01", "Choose", "Select files or a folder on your device. Nothing uploads while you prepare the share.", "folder")}
        ${stepCard("02", "Share", "Send one invite link through any app you already use. The link contains what PearDrop needs to connect.", "link")}
        ${stepCard("03", "Transfer", "Keep PearDrop open while the recipient downloads directly from you. Native apps are the reliable option across networks.", "send")}
      </div>
    </section>

    <section class="source-section" aria-labelledby="source-title">
      <div class="source-layout container">
        <div class="source-copy">
          <p class="section-kicker">Built in public</p>
          <h2 id="source-title">Software you can actually inspect.</h2>
          <p>PearDrop is released under Apache-2.0. Read the source, follow development, report an issue, or build your own version. The desktop and web clients both live in public repositories.</p>
          <div class="source-actions">
            <a class="button button-primary" href="${escapeHtmlAttr(APP_LINKS.desktopSource)}" target="_blank" rel="noreferrer">${ICONS.github} View desktop source</a>
            <a class="button button-secondary" href="${escapeHtmlAttr(APP_LINKS.webSource)}" target="_blank" rel="noreferrer">View web source${ICONS.arrow}</a>
          </div>
        </div>
        <div class="repo-card" aria-label="PearDrop repository overview">
          <div class="repo-head">
            <span class="repo-path">${ICONS.repository} geordangesink / PearDrop-Desktop</span>
            <span class="repo-public">Public</span>
          </div>
          <div class="repo-command"><span>$</span> git clone github.com/geordangesink/PearDrop-Desktop.git</div>
          <ul class="repo-files">
            <li>${ICONS.folder}<span>electron</span><small>desktop shell</small></li>
            <li>${ICONS.folder}<span>workers</span><small>transfer runtime</small></li>
            <li>${ICONS.folder}<span>src</span><small>product UI</small></li>
            <li>${ICONS.file}<span>LICENSE</span><small>Apache-2.0</small></li>
          </ul>
          <div class="repo-stats">
            <div class="repo-stat"><strong>Apache-2.0</strong><span>License</span></div>
            <div class="repo-stat"><strong>Public</strong><span>Development</span></div>
            <div class="repo-stat"><strong>GitHub</strong><span>Releases</span></div>
          </div>
        </div>
      </div>
    </section>

    <section id="downloads" class="section download-section">
      <div class="container">
        <div class="download-intro">
          <div>
            <p class="section-kicker">Downloads</p>
            <h2>Pick your platform.</h2>
          </div>
          <p>Native apps keep transfers available in the background and open invite links directly. They are the recommended option across different networks.</p>
        </div>
        ${recommendedDownload(recommended, platform)}
        ${webBetaNotice()}
        <div class="platform-grid">
          ${platformCard("Windows", "Windows 10 or newer", "windows", [{ label: "Download installer", href: APP_LINKS.windows }])}
          ${platformCard(
            "macOS",
            "Signed DMG for Apple Silicon or Intel",
            "mac",
            [
              { label: "Apple Silicon (arm64)", href: APP_LINKS.macArm64 },
              { label: "Intel (x64)", href: APP_LINKS.macX64 },
            ],
          )}
          ${platformCard(
            "Linux",
            "tar.gz archive containing the AppImage",
            "linux",
            [
              { label: "Linux x64", href: APP_LINKS.linuxX64 },
              { label: "Linux arm64", href: APP_LINKS.linuxArm64 },
            ],
          )}
        </div>
        <div class="mobile-downloads">
          ${mobileCard("Android", "Available on Google Play", "phone", APP_LINKS.android, "Open Play Store")}
          ${mobileCard("iOS", "Native app for iPhone and iPad", "phone", APP_LINKS.ios, "Open App Store")}
        </div>
      </div>
    </section>

    <section id="releases" class="section release-section" aria-labelledby="releases-title">
      <div class="container">
        <div class="release-head">
          <div>
            <p class="section-kicker">Version archive</p>
            <h2 id="releases-title">Current and past releases.</h2>
            <p>Need to roll back or support an older machine? Download any published desktop version directly from GitHub.</p>
          </div>
          <a class="button button-secondary" href="${escapeHtmlAttr(APP_LINKS.releases)}" target="_blank" rel="noreferrer">All releases on GitHub${ICONS.arrow}</a>
        </div>
        <div class="release-toolbar">
          <div class="release-filters" role="group" aria-label="Filter releases by platform">
            ${releaseFilter("all", "All", initialReleaseFilter)}
            ${releaseFilter("windows", "Windows", initialReleaseFilter)}
            ${releaseFilter("mac", "macOS", initialReleaseFilter)}
            ${releaseFilter("linux", "Linux", initialReleaseFilter)}
          </div>
          <a class="release-source" href="${escapeHtmlAttr(APP_LINKS.releases)}" target="_blank" rel="noreferrer">Source: GitHub Releases</a>
        </div>
        <div id="release-list" class="release-list" aria-live="polite" aria-busy="true">
          <div class="release-loading" aria-label="Loading releases"><span class="release-skeleton"></span><span class="release-skeleton"></span><span class="release-skeleton"></span></div>
        </div>
        <div id="release-more" class="release-more" hidden>
          <button id="release-more-button" class="button button-secondary" type="button">Show all versions</button>
        </div>
        <p class="release-note">Older builds may include known issues. For the best experience, use the <a href="#downloads">latest release</a>.</p>
      </div>
    </section>

    <section class="final-cta">
      <div class="final-card container">
        <div>
          <h2>One link. No cloud detour.</h2>
          <p>Install the native app for reliable transfers across networks, or try the WebRTC beta when both devices are on a friendly connection.</p>
        </div>
        <div class="final-actions">
          <a class="button button-dark" href="/web-client/">Open WebRTC beta${ICONS.arrow}</a>
          <a class="button button-secondary" href="#downloads">Download PearDrop</a>
        </div>
      </div>
    </section>
  </main>
  ${siteFooter()}
  `;

  initPearInstall();
  initNavigation();
  initReleaseArchive();
}

function pearInstallBanner() {
  if (platform.group !== "desktop") return "";
  return `
    <aside class="pear-install" aria-label="Install PearDrop with Pear">
      <div class="pear-install-inner container">
        <span class="pear-install-label">Install with Pear <small>Desktop · requires Pear</small></span>
        <code>${escapeHtml(APP_LINKS.pearInstallCommand)}</code>
        <button class="pear-install-copy button button-secondary" type="button" aria-label="Copy Pear install command">${ICONS.copy}<span aria-live="polite">Copy command</span></button>
      </div>
    </aside>
  `;
}

function initPearInstall() {
  const button = document.querySelector(".pear-install-copy");
  button?.addEventListener("click", async () => {
    const label = button.querySelector("span");
    try {
      await navigator.clipboard.writeText(APP_LINKS.pearInstallCommand);
      label.textContent = "Copied!";
    } catch {
      label.textContent = "Select command to copy";
    }
  });
}

function siteHeader() {
  return `
    <header class="site-header">
      <div class="site-nav">
        <a class="brand" href="/" aria-label="PearDrop home">
          <img class="brand-mark" src="/images/logo.png" alt="" />
          <span>PearDrop</span>
          <span class="brand-badge">Open source</span>
        </a>
        <button class="nav-toggle" type="button" aria-controls="site-menu" aria-expanded="false" aria-label="Open navigation">${ICONS.menu}</button>
        <nav id="site-menu" class="site-menu" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#downloads">Downloads</a>
          <a href="#releases">Versions</a>
          <a href="${escapeHtmlAttr(APP_LINKS.desktopSource)}" target="_blank" rel="noreferrer">GitHub</a>
          <a class="nav-cta" href="/web-client/">Open web beta${ICONS.arrow}</a>
        </nav>
      </div>
    </header>
  `;
}

function siteFooter() {
  return `
    <footer class="site-footer">
      <div class="footer-main container">
        <div class="footer-brand">
          <a class="brand" href="/" aria-label="PearDrop home"><img class="brand-mark" src="/images/logo.png" alt="" /><span>PearDrop</span><span class="brand-badge">Open source</span></a>
          <p>Direct, account-free file transfer for desktop, mobile, and the web.</p>
        </div>
        <div class="footer-links">
          <div class="footer-column"><strong>Product</strong><a href="#downloads">Downloads</a><a href="#releases">Past versions</a><a href="/web-client/">WebRTC beta</a></div>
          <div class="footer-column"><strong>Project</strong><a href="${escapeHtmlAttr(APP_LINKS.desktopSource)}" target="_blank" rel="noreferrer">Desktop source</a><a href="${escapeHtmlAttr(APP_LINKS.webSource)}" target="_blank" rel="noreferrer">Web source</a><a href="${escapeHtmlAttr(APP_LINKS.releases)}" target="_blank" rel="noreferrer">Releases</a></div>
          <div class="footer-column"><strong>Help</strong><a href="/support.html">Support</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="/impressum.html">Legal notice</a></div>
        </div>
      </div>
      <div class="footer-bottom container"><span>PearDrop &middot; Apache-2.0</span><a href="mailto:support@realpainpoints.com">support@realpainpoints.com</a></div>
    </footer>
  `;
}

function stepCard(number, title, copy, iconName) {
  return `<article class="step-card"><div class="step-topline"><span class="step-number">${number} / 03</span><span class="step-icon">${ICONS[iconName]}</span></div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p></article>`;
}

function recommendedDownload(recommendation, detectedPlatform) {
  const secondary = recommendation.secondaryHref
    ? `<a class="button button-secondary" href="${escapeHtmlAttr(recommendation.secondaryHref)}">${escapeHtml(recommendation.secondaryLabel)}</a>`
    : "";
  return `
    <article class="recommended-download">
      <div>
        <span class="recommendation-label">${ICONS.check} Recommended for ${escapeHtml(platformDisplayName(detectedPlatform))}</span>
        <h3>${escapeHtml(recommendation.primaryLabel)}</h3>
        <p>${escapeHtml(recommendation.note)}</p>
      </div>
      <div class="recommendation-actions">
        <a class="button button-dark" href="${escapeHtmlAttr(recommendation.primaryHref)}">${ICONS.download} Download</a>
        ${secondary}
      </div>
    </article>
  `;
}

function webBetaNotice() {
  return `
    <aside class="web-beta-notice">
      <span class="web-beta-icon">${ICONS.globe}</span>
      <div>
        <span class="web-beta-label">Browser beta</span>
        <strong>Fast when WebRTC can connect.</strong>
        <p>The browser client has no transfer fallback. Same-network transfers are the most reliable; some routers, VPNs, and firewalls may prevent a connection.</p>
      </div>
      <a class="button button-ghost" href="/web-client/">Try web beta${ICONS.arrow}</a>
    </aside>
  `;
}

function platformCard(name, description, iconName, links) {
  const available = links.filter((link) => String(link.href || "").trim());
  return `
    <article class="platform-card">
      <div class="platform-card-head">
        <div><h3>${escapeHtml(name)}</h3><p>${escapeHtml(description)}</p></div>
        <span class="platform-icon">${ICONS[iconName]}</span>
      </div>
      <div class="platform-actions">
        ${available.map((link) => downloadLink(link.label, link.href)).join("") || '<span class="coming-soon">Coming soon</span>'}
      </div>
    </article>
  `;
}

function mobileCard(name, description, iconName, href, linkLabel) {
  const action = href
    ? `<a class="button button-ghost" href="${escapeHtmlAttr(href)}">${escapeHtml(linkLabel)}${ICONS.arrow}</a>`
    : '<span class="coming-soon">Coming soon</span>';
  return `<article class="mobile-card"><span class="platform-icon">${ICONS[iconName]}</span><div><h3>${escapeHtml(name)}</h3><p>${escapeHtml(description)}</p></div>${action}</article>`;
}

function downloadLink(label, href) {
  return `<a class="download-link" href="${escapeHtmlAttr(href)}"><span>${escapeHtml(label)}</span>${ICONS.download}</a>`;
}

function releaseFilter(value, label, activeFilter) {
  const active = value === activeFilter;
  return `<button class="release-filter${active ? " is-active" : ""}" type="button" data-release-filter="${escapeHtmlAttr(value)}" aria-pressed="${active ? "true" : "false"}">${escapeHtml(label)}</button>`;
}

function resolveRecommendedDownload(platformInfo) {
  const id = String(platformInfo?.id || "").toLowerCase();
  const arch = String(platformInfo?.arch || "").toLowerCase();
  if (id === "mac") {
    const intel = arch === "x64";
    return {
      primaryHref: intel ? APP_LINKS.macX64 : APP_LINKS.macArm64,
      primaryLabel: intel
        ? "PearDrop for macOS Intel"
        : "PearDrop for Apple Silicon",
      secondaryHref: intel ? APP_LINKS.macArm64 : APP_LINKS.macX64,
      secondaryLabel: intel ? "Apple Silicon build" : "Intel build",
      note: "Signed DMG installer",
    };
  }
  if (id === "linux") {
    const arm = arch === "arm64";
    return {
      primaryHref: arm ? APP_LINKS.linuxArm64 : APP_LINKS.linuxX64,
      primaryLabel: arm ? "PearDrop for Linux arm64" : "PearDrop for Linux x64",
      secondaryHref: arm ? APP_LINKS.linuxX64 : APP_LINKS.linuxArm64,
      secondaryLabel: arm ? "x64 build" : "arm64 build",
      note: "tar.gz archive containing the AppImage",
    };
  }
  if (id === "windows") {
    return {
      primaryHref: APP_LINKS.windows,
      primaryLabel: "PearDrop for Windows",
      secondaryHref: "",
      secondaryLabel: "",
      note: "64-bit desktop installer",
    };
  }
  if (id === "android") {
    return {
      primaryHref: APP_LINKS.android,
      primaryLabel: "PearDrop for Android",
      secondaryHref: "",
      secondaryLabel: "",
      note: "Available on Google Play",
    };
  }
  if (id === "ios" && APP_LINKS.ios) {
    return {
      primaryHref: APP_LINKS.ios,
      primaryLabel: "PearDrop for iOS",
      secondaryHref: "",
      secondaryLabel: "",
      note: "Available on the App Store",
    };
  }
  return {
    primaryHref: installerUrlForPlatform(id, platformInfo) || "#downloads",
    primaryLabel: "Download PearDrop",
    secondaryHref: "",
    secondaryLabel: "",
    note: "Choose the build for your device",
  };
}

function platformDisplayName(platformInfo) {
  const label = String(platformInfo?.label || "your device");
  const arch = String(platformInfo?.arch || "");
  if (platformInfo?.id === "mac" && arch === "arm64") {
    return `${label} Apple Silicon`;
  }
  if (platformInfo?.id === "mac" && arch === "x64") return `${label} Intel`;
  if (arch) return `${label} ${arch}`;
  return label;
}

function initNavigation() {
  const toggle = document.querySelector(".nav-toggle");
  const menu = document.getElementById("site-menu");
  if (!(toggle instanceof HTMLElement) || !(menu instanceof HTMLElement)) {
    return;
  }

  const setOpen = (open) => {
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute(
      "aria-label",
      open ? "Close navigation" : "Open navigation",
    );
    menu.classList.toggle("is-open", open);
  };

  toggle.addEventListener("click", () => {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });
  menu.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.closest("a")) {
      setOpen(false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
}

function initReleaseArchive() {
  const filterButtons = document.querySelectorAll("[data-release-filter]");
  const moreButton = document.getElementById("release-more-button");

  for (const button of filterButtons) {
    button.addEventListener("click", () => {
      const nextFilter = String(
        button.getAttribute("data-release-filter") || "all",
      );
      releaseState.filter = nextFilter;
      releaseState.expanded = false;
      for (const candidate of filterButtons) {
        const active = candidate === button;
        candidate.classList.toggle("is-active", active);
        candidate.setAttribute("aria-pressed", active ? "true" : "false");
      }
      renderReleaseArchive();
    });
  }

  moreButton?.addEventListener("click", () => {
    releaseState.expanded = !releaseState.expanded;
    renderReleaseArchive();
  });

  void loadReleaseArchive();
}

async function loadReleaseArchive() {
  try {
    releaseState.releases = await fetchDesktopReleases();
    const latestVersion = document.getElementById("latest-version");
    if (latestVersion && releaseState.releases[0]?.tag) {
      latestVersion.textContent = releaseState.releases[0].tag;
    }
    renderReleaseArchive();
  } catch (error) {
    const list = document.getElementById("release-list");
    const more = document.getElementById("release-more");
    if (list) {
      list.setAttribute("aria-busy", "false");
      list.innerHTML = `<div class="release-empty"><p>The version archive could not be loaded right now.</p><a class="button button-secondary" href="${escapeHtmlAttr(APP_LINKS.releases)}" target="_blank" rel="noreferrer">Browse all versions on GitHub${ICONS.arrow}</a></div>`;
    }
    if (more) more.hidden = true;
    console.warn("Failed to load GitHub releases", error);
  }
}

function renderReleaseArchive() {
  const list = document.getElementById("release-list");
  const more = document.getElementById("release-more");
  const moreButton = document.getElementById("release-more-button");
  if (!list || !more || !moreButton || releaseState.releases.length === 0) {
    return;
  }

  const releases = releaseState.releases.filter(
    (release) => filterReleaseAssets(release, releaseState.filter).length > 0,
  );
  const visible = releaseState.expanded ? releases : releases.slice(0, 5);

  list.setAttribute("aria-busy", "false");
  list.innerHTML = visible.length
    ? visible
        .map((release) =>
          releaseRow(release, release === releaseState.releases[0]),
        )
        .join("")
    : '<div class="release-empty"><p>No downloads are available for this platform.</p></div>';

  more.hidden = releases.length <= 5;
  moreButton.textContent = releaseState.expanded
    ? "Show fewer versions"
    : `Show all ${releases.length} versions`;
}

function releaseRow(release, latest) {
  const assets = filterReleaseAssets(release, releaseState.filter);
  const badge = latest
    ? '<span class="latest-badge">Latest</span>'
    : release.prerelease
      ? '<span class="prerelease-badge">Pre-release</span>'
      : "";
  return `
    <article class="release-row">
      <div>
        <div class="release-version-line"><a class="release-version" href="${escapeHtmlAttr(release.url)}" target="_blank" rel="noreferrer">${escapeHtml(release.tag)}</a>${badge}</div>
        <p class="release-date">${escapeHtml(formatReleaseDate(release.publishedAt))}</p>
      </div>
      <div class="release-assets">
        ${assets.map((asset) => releaseAssetLink(asset, release.tag)).join("")}
      </div>
    </article>
  `;
}

function releaseAssetLink(asset, tag) {
  const meta = [asset.format, asset.sizeLabel].filter(Boolean).join(" / ");
  return `<a class="release-asset" href="${escapeHtmlAttr(asset.url)}" aria-label="Download ${escapeHtmlAttr(asset.label)} for ${escapeHtmlAttr(tag)}">${ICONS.download}<span>${escapeHtml(asset.label)}</span><span class="asset-meta">${escapeHtml(meta)}</span></a>`;
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
