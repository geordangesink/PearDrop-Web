import test from 'node:test'
import assert from 'node:assert/strict'
import { parseInvite, relayUrlForInvite, formatBytes } from '../src/lib/invite.js'

test('parseInvite reads drive key and relay url', () => {
  const parsed = parseInvite('peardrops://invite?drive=abc&topic=def&relay=ws://127.0.0.1:49443')
  assert.equal(parsed.driveKey, 'abc')
  assert.equal(parsed.topic, 'def')
  assert.equal(parsed.relayUrl, 'ws://127.0.0.1:49443')
})

test('relayUrlForInvite falls back to location-derived url', () => {
  const relayUrl = relayUrlForInvite({ relayUrl: '' }, { protocol: 'https:', hostname: 'example.com' })
  assert.equal(relayUrl, 'wss://example.com:49443/')
})

test('formatBytes formats readable sizes', () => {
  assert.equal(formatBytes(100), '100 B')
  assert.equal(formatBytes(2048), '2.0 KB')
})
