const STORAGE_KEY = "peardrop-theme-mode";
const DEFAULT_MODE = "system";
const MODES = new Set(["system", "dark", "light"]);

function isMode(value) {
  return MODES.has(String(value || "").toLowerCase());
}

function readStoredMode() {
  try {
    const value = String(localStorage.getItem(STORAGE_KEY) || "").toLowerCase();
    if (isMode(value)) return value;
  } catch {}
  return DEFAULT_MODE;
}

function resolveTheme(mode, mql) {
  const normalized = isMode(mode) ? String(mode).toLowerCase() : DEFAULT_MODE;
  if (normalized === "system") return mql.matches ? "dark" : "light";
  return normalized;
}

export function initTheme(toggleRoot = document) {
  const media =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : { matches: false, addEventListener: () => {}, removeEventListener: () => {} };

  let mode = readStoredMode();
  const root = document.documentElement;

  const apply = () => {
    const resolved = resolveTheme(mode, media);
    root.dataset.themeMode = mode;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;

    const buttons = toggleRoot.querySelectorAll("[data-theme-mode]");
    for (const button of buttons) {
      const targetMode = String(button.getAttribute("data-theme-mode") || "").toLowerCase();
      const active = targetMode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }
  };

  const onToggleClick = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const node = target.closest("[data-theme-mode]");
    if (!(node instanceof HTMLElement)) return;
    const nextMode = String(node.getAttribute("data-theme-mode") || "").toLowerCase();
    if (!isMode(nextMode)) return;
    mode = nextMode;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {}
    apply();
  };

  const onMediaChange = () => {
    if (mode === "system") apply();
  };

  toggleRoot.addEventListener("click", onToggleClick);
  media.addEventListener("change", onMediaChange);
  apply();

  return () => {
    toggleRoot.removeEventListener("click", onToggleClick);
    media.removeEventListener("change", onMediaChange);
  };
}

