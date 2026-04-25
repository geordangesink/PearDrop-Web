import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        landing: fileURLToPath(new URL("./index.html", import.meta.url)),
        legalNotice: fileURLToPath(
          new URL("./impressum.html", import.meta.url),
        ),
        support: fileURLToPath(new URL("./support.html", import.meta.url)),
        privacy: fileURLToPath(new URL("./privacy.html", import.meta.url)),
        terms: fileURLToPath(new URL("./terms.html", import.meta.url)),
        openInvite: fileURLToPath(
          new URL("./open/index.html", import.meta.url),
        ),
        webClient: fileURLToPath(
          new URL("./web-client/index.html", import.meta.url),
        ),
      },
    },
  },
  resolve: {
    alias: {
      "sodium-universal": fileURLToPath(
        new URL("./src/shims/sodium-universal.js", import.meta.url),
      ),
      "sodium-native": "sodium-javascript",
      "rocksdb-native": fileURLToPath(
        new URL("./src/shims/rocksdb-native.js", import.meta.url),
      ),
      "require-addon": fileURLToPath(
        new URL("./src/shims/require-addon.js", import.meta.url),
      ),
      "device-file": fileURLToPath(
        new URL("./src/shims/device-file.js", import.meta.url),
      ),
      "fd-lock": fileURLToPath(
        new URL("./src/shims/fd-lock.js", import.meta.url),
      ),
    },
  },
  define: {
    global: "globalThis",
    __filename: JSON.stringify("/browser.js"),
    __dirname: JSON.stringify("/"),
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: "globalThis",
        __filename: JSON.stringify("/browser.js"),
        __dirname: JSON.stringify("/"),
      },
    },
  },
});
