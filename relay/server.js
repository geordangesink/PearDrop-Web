import DHT from 'hyperdht'
import { relay } from '@hyperswarm/dht-relay'
import RelayStream from '@hyperswarm/dht-relay/ws'
import { WebSocketServer } from 'ws'

const host = process.env.RELAY_HOST || '0.0.0.0'
const port = Number(process.env.PORT || process.env.RELAY_PORT || 49443)

const dht = new DHT()
const wss = new WebSocketServer({ host, port })

wss.on('connection', (socket) => {
  relay(dht, new RelayStream(false, socket))
})

console.log(`[relay] hyperswarm dht relay listening on ws://${host}:${port}`)
