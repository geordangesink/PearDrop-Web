import b4a from "b4a";
import Corestore from "corestore";
import Hyperdrive from "hyperdrive";
import Hyperswarm from "hyperswarm";

async function main() {
  const raw = Bare.argv[Bare.argv.length - 1] || "{}";
  const config = JSON.parse(raw);

  const relayUrl = String(config.relayUrl || "ws://127.0.0.1:49443");
  const payload = String(config.payload || "web e2e payload");
  const fileName = String(config.fileName || "download.txt");
  const baseDir = String(
    config.baseDir ||
      `/tmp/peardrops-bare-uploader-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );

  const store = new Corestore(`${baseDir}/corestore`);
  await store.ready();

  const keyPair = await store.createKeyPair("peardrops-web-e2e");
  const swarm = new Hyperswarm({ keyPair });
  swarm.on("connection", (socket) => store.replicate(socket));

  const drive = new Hyperdrive(store.namespace("upload"));
  await drive.ready();

  const drivePath = `/files/${fileName}`;
  const data = b4a.from(payload, "utf8");
  await drive.put(drivePath, data);
  await drive.put(
    "/manifest.json",
    b4a.from(
      JSON.stringify(
        {
          files: [
            {
              name: fileName,
              drivePath,
              byteLength: data.byteLength,
              mimeType: "text/plain",
            },
          ],
        },
        null,
        2,
      ),
    ),
  );

  swarm.join(drive.discoveryKey, { server: true, client: true });

  const webTopic = b4a.from(drive.discoveryKey);
  webTopic[0] ^= 0x70;
  webTopic[1] ^= 0x64;
  const webKeyPair = await store.createKeyPair("peardrops-web-e2e-bridge");
  const webSwarm = new Hyperswarm({ keyPair: webKeyPair, dht: swarm.dht });
  const webDiscovery = webSwarm.join(webTopic, { server: true, client: false });
  await webDiscovery.flushed();
  webSwarm.on("connection", (socket) => {
    let buffered = "";
    socket.on("data", async (chunk) => {
      buffered += b4a.toString(chunk, "utf8");
      let newline = buffered.indexOf("\n");
      while (newline !== -1) {
        const line = buffered.slice(0, newline).trim();
        buffered = buffered.slice(newline + 1);
        if (line) {
          let req = null;
          try {
            req = JSON.parse(line);
          } catch {
            req = null;
          }
          if (req) {
            const id = typeof req.id === "number" ? req.id : 0;
            try {
              if (req.type === "manifest") {
                const rawManifest = await drive.get("/manifest.json");
                socket.write(
                  b4a.from(
                    JSON.stringify({
                      id,
                      ok: true,
                      manifest: JSON.parse(rawManifest.toString("utf8")),
                    }) + "\n",
                  ),
                );
              } else if (req.type === "file") {
                const rawFile = await drive.get(String(req.path || ""));
                socket.write(
                  b4a.from(
                    JSON.stringify({
                      id,
                      ok: true,
                      dataBase64: rawFile
                        ? b4a.toString(rawFile, "base64")
                        : "",
                    }) + "\n",
                  ),
                );
              }
            } catch (error) {
              socket.write(
                b4a.from(
                  JSON.stringify({
                    id,
                    ok: false,
                    error: error?.message || String(error),
                  }) + "\n",
                ),
              );
            }
          }
        }
        newline = buffered.indexOf("\n");
      }
    });
  });

  const invite = `peardrops://invite?drive=${drive.key.toString("hex")}&topic=${webTopic.toString("hex")}&web=${webKeyPair.publicKey.toString("hex")}&relay=${encodeURIComponent(relayUrl)}&app=native`;
  console.log(`INVITE:${invite}`);

  const rawManifest = await drive.get("/manifest.json");
  const state = {
    invite,
    driveKey: drive.key.toString("hex"),
    manifest: JSON.parse(rawManifest.toString("utf8")),
    files: {
      [drivePath]: data.toString("base64"),
    },
  };
  console.log(`STATE:${JSON.stringify(state)}`);

  const shutdown = async () => {
    try {
      await drive.close();
      await webSwarm.destroy();
      await swarm.destroy();
      await store.close();
    } finally {
      Bare.exit(0);
    }
  };

  if (typeof Bare.on === "function") {
    Bare.on("beforeExit", shutdown);
  }

  setInterval(() => {}, 1000);
}

main().catch((error) => {
  console.error(error);
  Bare.exit(1);
});
