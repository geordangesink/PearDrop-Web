import { parseInvite } from "./invite.js";

export async function loadManifestFromInvite(
  invite,
  { openDrive, waitMs = 10000, retryMs = 150, onPhase = null },
) {
  if (typeof openDrive !== "function") {
    throw new Error("openDrive must be provided");
  }
  const emitPhase = typeof onPhase === "function" ? onPhase : () => {};

  emitPhase("parse-invite");
  const parsed = parseInvite(invite);
  emitPhase("open-drive");
  const session = await openDrive(parsed, { onPhase });

  try {
    emitPhase("manifest-request");
    const rawManifest = await waitForEntry(
      session.drive,
      "/manifest.json",
      waitMs,
      retryMs,
    );
    emitPhase("manifest-received");
    const manifest = parseManifestPayload(rawManifest);
    emitPhase("manifest-parsed");

    return {
      manifest,
      session,
    };
  } catch (error) {
    await safeClose(session);
    throw error;
  }
}

function parseManifestPayload(rawManifest) {
  const text = decodeUtf8(rawManifest);
  try {
    return JSON.parse(text);
  } catch {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first !== -1 && last > first) {
      return JSON.parse(text.slice(first, last + 1));
    }
    throw new Error(
      `Invalid manifest payload received from peer: ${text.slice(0, 120)}`,
    );
  }
}

function decodeUtf8(value) {
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) {
    return new TextDecoder("utf8").decode(value);
  }
  if (value && typeof value.toString === "function") {
    return value.toString("utf8");
  }
  return String(value || "");
}

export async function readInviteEntry(
  session,
  entry,
  { waitMs = 15000, retryMs = 200 } = {},
) {
  if (!session || !session.drive) {
    throw new Error("An active drive session is required");
  }
  if (!entry || !entry.drivePath) {
    throw new Error("Entry with drivePath is required");
  }

  if (
    typeof session.drive.getChunk === "function" &&
    Number(entry.byteLength || 0) > 0
  ) {
    const chunks = [];
    for await (const chunk of readInviteEntryChunks(session, entry, {
      waitMs,
      retryMs,
    })) {
      chunks.push(chunk);
    }
    return concatUint8(chunks);
  }

  const data = await waitForEntry(
    session.drive,
    entry.drivePath,
    waitMs,
    retryMs,
  );
  if (!data) {
    throw new Error(`Entry not found: ${entry.drivePath}`);
  }
  return data;
}

export async function* readInviteEntryChunks(
  session,
  entry,
  { waitMs = 15000, retryMs = 200, chunkSize = 64 * 1024 } = {},
) {
  if (!session || !session.drive) {
    throw new Error("An active drive session is required");
  }
  if (!entry || !entry.drivePath) {
    throw new Error("Entry with drivePath is required");
  }

  const total = Math.max(0, Number(entry.byteLength || 0));
  const supportsChunks = typeof session.drive.getChunk === "function";

  if (!supportsChunks) {
    const one = await readInviteEntry(session, entry, { waitMs, retryMs });
    yield toUint8(one);
    return;
  }

  if (total <= 0) {
    let offset = 0;
    while (true) {
      const chunk = await waitForChunk(
        session.drive,
        entry.drivePath,
        offset,
        chunkSize,
        waitMs,
        retryMs,
        { allowEmptyAtStart: offset === 0 },
      );
      const bytes = toUint8(chunk);
      if (!bytes.byteLength) {
        if (offset === 0) {
          throw new Error(`Entry not available: ${entry.drivePath}`);
        }
        break;
      }
      yield bytes;
      offset += bytes.byteLength;
      if (bytes.byteLength < chunkSize) break;
    }
    return;
  }

  let offset = 0;
  while (offset < total) {
    const length = Math.min(chunkSize, total - offset);
    const chunk = await waitForChunk(
      session.drive,
      entry.drivePath,
      offset,
      length,
      waitMs,
      retryMs,
    );
    const bytes = toUint8(chunk);
    if (!bytes.byteLength) {
      throw new Error(`Peer returned empty chunk for ${entry.drivePath}`);
    }
    yield bytes;
    offset += bytes.byteLength;
  }
}

async function waitForEntry(drive, drivePath, waitMs, retryMs) {
  const start = Date.now();
  while (true) {
    try {
      const data = await drive.get(drivePath);
      if (data) return data;
    } catch {}

    if (waitMs > 0 && Date.now() - start > waitMs) {
      throw new Error(`Timed out waiting for ${drivePath}`);
    }
    await sleep(retryMs);
  }
}

async function waitForChunk(
  drive,
  drivePath,
  offset,
  length,
  waitMs,
  retryMs,
  options = {},
) {
  const start = Date.now();
  const allowEmptyAtStart = Boolean(options.allowEmptyAtStart);
  let sawAnyData = false;
  let emptyCount = 0;
  while (true) {
    try {
      const data = await drive.getChunk(drivePath, offset, length);
      const bytes = toUint8(data);
      if (bytes.byteLength > 0) {
        sawAnyData = true;
        return bytes;
      }
      emptyCount += 1;
      if (allowEmptyAtStart && !sawAnyData && emptyCount >= 2) {
        return new Uint8Array(0);
      }
      if (sawAnyData && emptyCount >= 2) return new Uint8Array(0);
    } catch {}

    if (waitMs > 0 && Date.now() - start > waitMs) {
      throw new Error(`Timed out waiting for ${drivePath} chunk @${offset}`);
    }
    await sleep(retryMs);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toUint8(value) {
  if (value instanceof Uint8Array) return value;
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value || 0);
}

function concatUint8(chunks) {
  const list = Array.isArray(chunks) ? chunks : [];
  const total = list.reduce(
    (sum, item) => sum + Number(item?.byteLength || 0),
    0,
  );
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of list) {
    const bytes = toUint8(chunk);
    out.set(bytes, offset);
    offset += bytes.byteLength;
  }
  return out;
}

export async function safeClose(session) {
  if (!session || typeof session.close !== "function") return;
  await session.close();
}
