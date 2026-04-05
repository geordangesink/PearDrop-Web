import { parseInvite } from './invite.js'

export async function loadManifestFromInvite(invite, { openDrive, waitMs = 10000, retryMs = 150 }) {
  if (typeof openDrive !== 'function') {
    throw new Error('openDrive must be provided')
  }

  const parsed = parseInvite(invite)
  const session = await openDrive(parsed)

  try {
    const rawManifest = await waitForEntry(session.drive, '/manifest.json', waitMs, retryMs)
    const manifest = parseManifestPayload(rawManifest)

    return {
      manifest,
      session
    }
  } catch (error) {
    await safeClose(session)
    throw error
  }
}

function parseManifestPayload(rawManifest) {
  const text = decodeUtf8(rawManifest)
  try {
    return JSON.parse(text)
  } catch {
    const first = text.indexOf('{')
    const last = text.lastIndexOf('}')
    if (first !== -1 && last > first) {
      return JSON.parse(text.slice(first, last + 1))
    }
    throw new Error(`Invalid manifest payload received from peer: ${text.slice(0, 120)}`)
  }
}

function decodeUtf8(value) {
  if (typeof value === 'string') return value
  if (value instanceof Uint8Array) {
    return new TextDecoder('utf8').decode(value)
  }
  if (value && typeof value.toString === 'function') {
    return value.toString('utf8')
  }
  return String(value || '')
}

export async function readInviteEntry(session, entry, { waitMs = 10000, retryMs = 150 } = {}) {
  if (!session || !session.drive) throw new Error('An active drive session is required')
  if (!entry || !entry.drivePath) throw new Error('Entry with drivePath is required')

  const data = await waitForEntry(session.drive, entry.drivePath, waitMs, retryMs)
  if (!data) {
    throw new Error(`Entry not found: ${entry.drivePath}`)
  }
  return data
}

async function waitForEntry(drive, drivePath, waitMs, retryMs) {
  const start = Date.now()
  while (true) {
    const data = await drive.get(drivePath)
    if (data) return data

    if (Date.now() - start > waitMs) {
      throw new Error(`Timed out waiting for ${drivePath}`)
    }
    await sleep(retryMs)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function safeClose(session) {
  if (!session || typeof session.close !== 'function') return
  await session.close()
}
