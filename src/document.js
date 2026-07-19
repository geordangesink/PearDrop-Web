import "./styles/site.css";
import { APP_LINKS } from "./lib/app-links.js";

const ICONS = {
  arrow:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 8h14M5 16h14"/></svg>',
};

const main = document.querySelector("main");
const navigation = main?.querySelector(".nav");

if (main && navigation) {
  document.body.classList.add("document-page");
  main.className = "document-shell";
  navigation.className = "document-nav";
  navigation.insertAdjacentHTML("afterbegin", "<strong>Documentation</strong>");

  const content = document.createElement("article");
  content.className = "document-content";
  const children = [...main.children].filter((child) => child !== navigation);
  for (const child of children) content.append(child);
  main.append(content);

  const heading = content.querySelector("h1");
  if (heading) {
    const kicker = document.createElement("p");
    kicker.className = "document-kicker";
    kicker.textContent = documentKicker(location.pathname);
    content.insertBefore(kicker, heading);
  }

  for (const link of navigation.querySelectorAll("a")) {
    if (new URL(link.href).pathname === location.pathname) {
      link.setAttribute("aria-current", "page");
    }
  }

  const muted = content.querySelectorAll(".muted");
  const finalMuted = muted[muted.length - 1];
  if (finalMuted?.textContent?.trim().startsWith("Last updated:")) {
    finalMuted.classList.add("document-updated");
  }

  document.body.insertBefore(createHeader(), main);
  document.body.append(createFooter());
  initNavigation();
}

function createHeader() {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <header class="site-header">
      <div class="site-nav">
        <a class="brand" href="/" aria-label="PearDrop home"><img class="brand-mark" src="/images/logo.png" alt="" /><span>PearDrop</span><span class="brand-badge">Open source</span></a>
        <button class="nav-toggle" type="button" aria-controls="site-menu" aria-expanded="false" aria-label="Open navigation">${ICONS.menu}</button>
        <nav id="site-menu" class="site-menu" aria-label="Main navigation">
          <a href="/#how-it-works">How it works</a>
          <a href="/#downloads">Downloads</a>
          <a href="/#releases">Versions</a>
          <a href="${escapeHtmlAttr(APP_LINKS.desktopSource)}" target="_blank" rel="noreferrer">GitHub</a>
          <a class="nav-cta" href="/web-client/">Open web beta${ICONS.arrow}</a>
        </nav>
      </div>
    </header>
  `;
  return wrapper.firstElementChild;
}

function createFooter() {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <footer class="site-footer">
      <div class="footer-main container">
        <div class="footer-brand"><a class="brand" href="/" aria-label="PearDrop home"><img class="brand-mark" src="/images/logo.png" alt="" /><span>PearDrop</span><span class="brand-badge">Open source</span></a><p>Direct, account-free file transfer for desktop, mobile, and the web.</p></div>
        <div class="footer-links">
          <div class="footer-column"><strong>Product</strong><a href="/#downloads">Downloads</a><a href="/#releases">Past versions</a><a href="/web-client/">WebRTC beta</a></div>
          <div class="footer-column"><strong>Project</strong><a href="${escapeHtmlAttr(APP_LINKS.desktopSource)}" target="_blank" rel="noreferrer">Desktop source</a><a href="${escapeHtmlAttr(APP_LINKS.webSource)}" target="_blank" rel="noreferrer">Web source</a><a href="${escapeHtmlAttr(APP_LINKS.releases)}" target="_blank" rel="noreferrer">Releases</a></div>
          <div class="footer-column"><strong>Help</strong><a href="/support.html">Support</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="/impressum.html">Legal notice</a></div>
        </div>
      </div>
      <div class="footer-bottom container"><span>PearDrop &middot; Apache-2.0</span><a href="mailto:support@realpainpoints.com">support@realpainpoints.com</a></div>
    </footer>
  `;
  return wrapper.firstElementChild;
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
  menu.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
}

function documentKicker(pathname) {
  if (pathname.includes("support")) return "Help center";
  if (pathname.includes("privacy")) return "Project policy";
  if (pathname.includes("terms")) return "Project terms";
  return "Project information";
}

function escapeHtmlAttr(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
