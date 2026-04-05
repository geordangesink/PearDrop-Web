export function parseInvite(invite) {
  const url = new URL(invite)
  if (!['peardrops:', 'peardrops-web:'].includes(url.protocol)) {
    throw new Error('Invite must start with peardrops:// or peardrops-web://')
  }

  const driveKey = url.searchParams.get('drive') || ''
  const topic = url.searchParams.get('topic') || ''
  const webKey = url.searchParams.get('web') || ''
  const signalKey = url.searchParams.get('signal') || ''
  const nativeInvite = url.searchParams.get('invite') || ''
  if (!driveKey && !topic && !webKey && !signalKey) throw new Error('Invite is missing join coordinates')

  return {
    driveKey,
    topic,
    webKey,
    signalKey,
    nativeInvite,
    relayUrl: url.searchParams.get('relay') || ''
  }
}

export function relayUrlForInvite(parsed, locationLike) {
  const fallback = `${locationLike.protocol === 'https:' ? 'wss' : 'ws'}://${locationLike.hostname}:49443`
  const candidate = parsed.relayUrl || fallback

  try {
    const relay = new URL(candidate)
    const pageHost = String(locationLike.hostname || '').trim()
    const relayHost = relay.hostname
    const isLoopbackRelay =
      relayHost === 'localhost' ||
      relayHost === '127.0.0.1' ||
      relayHost === '::1' ||
      relayHost === '[::1]'
    const isLoopbackPage =
      pageHost === 'localhost' ||
      pageHost === '127.0.0.1' ||
      pageHost === '::1'

    if (isLoopbackRelay && pageHost && !isLoopbackPage) {
      relay.hostname = pageHost
      return relay.toString()
    }

    return relay.toString()
  } catch {
    return fallback
  }
}

export function formatBytes(value = 0) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}
