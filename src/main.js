import { relayUrlForInvite, formatBytes } from './lib/invite.js'
import { loadManifestFromInvite, readInviteEntry, safeClose } from './lib/download.js'
import { openDriveViaWebRtcInvite } from './lib/webrtc-client.js'

if (typeof globalThis.global === 'undefined') {
  globalThis.global = globalThis
}

const app = document.getElementById('app')

app.innerHTML = `
  <style>
    body {
      margin: 0;
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      color: #1f3342;
      background: radial-gradient(circle at top left, #e8f4ef, #f5f8fb);
    }
    main {
      max-width: 780px;
      margin: 48px auto;
      padding: 24px;
      background: #fff;
      border: 1px solid #d7e2ea;
      border-radius: 16px;
      box-shadow: 0 18px 42px rgba(31, 51, 66, 0.09);
    }
    textarea {
      width: 100%;
      min-height: 88px;
      border-radius: 12px;
      border: 1px solid #c8d6e2;
      padding: 10px;
      box-sizing: border-box;
    }
    button {
      border: 0;
      border-radius: 999px;
      background: #1f7a68;
      color: #fff;
      padding: 10px 16px;
      margin-top: 12px;
      cursor: pointer;
    }
    .ghost {
      border: 1px solid #1f7a68;
      background: transparent;
      color: #1f7a68;
      margin-left: 8px;
    }
    ul { padding-left: 20px; }
    .helper {
      margin-top: 12px;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid #f1d6a8;
      background: #fff8ea;
      color: #6d4d16;
      display: none;
    }
    .helper button {
      margin-top: 8px;
      background: #6d4d16;
      color: #fff8ea;
    }
  </style>

  <h1>Pear Drops Web Client</h1>
  <p>Join a native uploader from the browser and download files peer-to-peer.</p>

  <label for="invite">Invite link</label>
  <textarea id="invite" placeholder="Paste peardrops://invite..."></textarea>
  <div>
    <button id="join">Join & Load Files</button>
    <button id="open-native" class="ghost">Open In Native App</button>
  </div>
  <h2>Files</h2>
  <ul id="files"></ul>
  <p id="status">Idle</p>
  <div id="relay-helper" class="helper">
    <div><strong>Relay not running?</strong> Start it with:</div>
    <code id="relay-cmd">cd /Users/geordangesink/Documents/Projects/Pear Drops/web && npm run relay</code>
    <div><button id="copy-relay-cmd">Copy command</button></div>
  </div>
`

const statusEl = document.getElementById('status')
const filesEl = document.getElementById('files')
const inviteEl = document.getElementById('invite')
const joinBtn = document.getElementById('join')
const openNativeBtn = document.getElementById('open-native')
const relayHelperEl = document.getElementById('relay-helper')
const copyRelayCmdBtn = document.getElementById('copy-relay-cmd')
const relayCmdEl = document.getElementById('relay-cmd')

let currentSession = null

joinBtn.addEventListener('click', () => void joinInvite())
openNativeBtn.addEventListener('click', () => {
  const invite = inviteEl.value.trim()
  if (invite.startsWith('peardrops://invite') || invite.startsWith('peardrops-web://join')) {
    location.href = invite
  }
})
copyRelayCmdBtn.addEventListener('click', async () => {
  const cmd = relayCmdEl.textContent || ''
  try {
    await navigator.clipboard.writeText(cmd)
    statusEl.textContent = 'Relay command copied.'
  } catch {
    statusEl.textContent = 'Could not copy command automatically.'
  }
})

const initialInvite = new URLSearchParams(location.search).get('invite')
if (initialInvite) {
  inviteEl.value = initialInvite
  void joinInvite()
}

async function joinInvite() {
  const invite = normalizeInviteInput(inviteEl.value)
  if (!invite) {
    statusEl.textContent = 'Paste an invite URL first.'
    return
  }
  if (!invite.startsWith('peardrops://invite') && !invite.startsWith('peardrops-web://join')) {
    statusEl.textContent = 'Invite must start with peardrops://invite or peardrops-web://join'
    return
  }

  statusEl.textContent = 'Connecting to relay and peer swarm...'

  try {
    relayHelperEl.style.display = 'none'
    await safeClose(currentSession)
    currentSession = null

    const maybeTestOpenDrive = globalThis.__PEARDROPS_TEST_OPEN_DRIVE__
    const openDrive =
      typeof maybeTestOpenDrive === 'function'
        ? (parsed) => maybeTestOpenDrive(parsed)
        : (parsed) => openDriveFromInvite(parsed)

    const { manifest, session } = await loadManifestFromInvite(invite, {
      openDrive
    })

    currentSession = session

    filesEl.textContent = ''
    for (const entry of manifest.files || []) {
      const li = document.createElement('li')
      const btn = document.createElement('button')
      btn.textContent = `Download ${entry.name}`
      btn.style.marginTop = '0'
      btn.addEventListener('click', async () => {
        const data = await readInviteEntry(session, entry)

        const blob = new Blob([data], {
          type: entry.mimeType || 'application/octet-stream'
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = entry.name
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      })
      li.textContent = `${entry.name} (${formatBytes(entry.byteLength)}) `
      li.appendChild(btn)
      filesEl.appendChild(li)
    }

    statusEl.textContent = `Connected. ${manifest.files?.length || 0} file(s) available.`
  } catch (error) {
    const message = error.message || String(error)
    statusEl.textContent = `Join failed: ${message}`
    if (message.includes('Relay connection failed')) {
      relayHelperEl.style.display = 'block'
    }
  }
}

async function openDriveViaRelay(parsed) {
  const [{ default: DHT }, { default: RelayStream }, { default: b4a }] = await Promise.all([
    import('@hyperswarm/dht-relay'),
    import('@hyperswarm/dht-relay/ws'),
    import('b4a')
  ])

  const relayUrl = relayUrlForInvite(parsed, location)
  const socket = new WebSocket(relayUrl)
  await onceOpen(socket)

  const dht = new DHT(new RelayStream(true, socket))
  const topicHex = parsed.topic || parsed.driveKey
  if (!topicHex) throw new Error('Invite is missing web swarm topic')

  const topic = b4a.from(topicHex, 'hex')
  const preferredKey = parsed.webKey ? b4a.from(parsed.webKey, 'hex') : null
  const peerKey = await lookupFirstPeer(dht, topic, 8000, preferredKey)
  const stream = dht.connect(peerKey)
  await onceStreamOpen(stream)
  const peer = createPeerRequestClient(stream)

  return {
    drive: {
      async get(drivePath) {
        if (drivePath === '/manifest.json') {
          const response = await peer.request({ type: 'manifest' })
          if (!response || typeof response.manifest !== 'object') {
            throw new Error('Peer did not return a valid manifest payload')
          }
          return b4a.from(JSON.stringify(response.manifest), 'utf8')
        }

        const response = await peer.request({ type: 'file', path: drivePath })
        if (!response?.dataBase64) return null
        return b4a.from(response.dataBase64, 'base64')
      }
    },
    async close() {
      stream.destroy()
      if (typeof dht.destroy === 'function') await dht.destroy()
      socket.close()
    }
  }
}

async function openDriveFromInvite(parsed) {
  const relayUrl = relayUrlForInvite(parsed, location)
  const [{ default: DHT }, { default: RelayStream }, { default: b4a }] = await Promise.all([
    import('@hyperswarm/dht-relay'),
    import('@hyperswarm/dht-relay/ws'),
    import('b4a')
  ])

  if (parsed.signalKey) {
    return openDriveViaWebRtcInvite(parsed, relayUrl, {
      DHT,
      RelayStream,
      b4a
    })
  }

  return openDriveViaRelay(parsed)
}

function onceOpen(socket) {
  if (socket.readyState === WebSocket.OPEN) return Promise.resolve()
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true })
    socket.addEventListener(
      'error',
      () => {
        const url = socket.url || 'unknown relay url'
        reject(
          new Error(
            `Relay connection failed (${url}). Start relay with \`npm run relay\` or use an invite with a reachable relay host (not localhost unless browser is on same machine).`
          )
        )
      },
      { once: true }
    )
  })
}

function onceStreamOpen(stream) {
  if (stream.opened || stream.writable) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const onOpen = () => {
      cleanup()
      resolve()
    }
    const onError = (error) => {
      cleanup()
      reject(error || new Error('Peer connection failed'))
    }
    const cleanup = () => {
      stream.off?.('open', onOpen)
      stream.off?.('error', onError)
    }
    stream.on?.('open', onOpen)
    stream.on?.('error', onError)
  })
}

function lookupFirstPeer(dht, topic, timeoutMs, preferredKey = null) {
  return new Promise((resolve, reject) => {
    const stream = dht.lookup(topic)
    const timer = setTimeout(() => {
      stream.destroy?.()
      reject(new Error('Timed out finding a web peer on swarm topic'))
    }, timeoutMs)

    let fallbackPeer = null
    stream.on('data', (result) => {
      const peers = result?.peers || []
      for (const peer of peers) {
        if (!peer?.publicKey) continue
        fallbackPeer = fallbackPeer || peer.publicKey
        if (
          preferredKey &&
          peer.publicKey.length === preferredKey.length &&
          peer.publicKey.every((value, index) => value === preferredKey[index])
        ) {
          clearTimeout(timer)
          stream.destroy?.()
          resolve(peer.publicKey)
          return
        }
      }
    })

    stream.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })

    stream.on('end', () => {
      clearTimeout(timer)
      if (fallbackPeer) {
        resolve(fallbackPeer)
        return
      }
      reject(new Error('No peers announced for this web swarm topic'))
    })
  })
}

function createPeerRequestClient(stream) {
  let nextId = 1
  let buffered = ''
  const pending = new Map()
  const decoder = new TextDecoder('utf8')

  stream.on('data', (chunk) => {
    buffered += decoder.decode(chunk, { stream: true })
    let newline = buffered.indexOf('\n')
    while (newline !== -1) {
      const line = buffered.slice(0, newline).trim()
      buffered = buffered.slice(newline + 1)
      if (line) {
        try {
          const message = JSON.parse(line)
          const waiter = pending.get(message.id)
          if (waiter) {
            pending.delete(message.id)
            if (message.ok === false) waiter.reject(new Error(message.error || 'Peer request failed'))
            else waiter.resolve(message)
          }
        } catch {
          // Helps diagnose protocol mismatches when connected peer is not serving the expected API.
          console.warn('Ignoring non-JSON peer message:', line.slice(0, 120))
        }
      }
      newline = buffered.indexOf('\n')
    }
  })

  stream.on('error', (error) => {
    for (const waiter of pending.values()) waiter.reject(error)
    pending.clear()
  })

  return {
    request(payload) {
      const id = nextId++
      const request = JSON.stringify({ id, ...payload }) + '\n'
      stream.write(request)
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
      })
    }
  }
}

function normalizeInviteInput(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (text.startsWith('Join failed:')) return ''
  return text
}
