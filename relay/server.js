import DHT from 'hyperdht'
import { relay } from '@hyperswarm/dht-relay'
import RelayStream from '@hyperswarm/dht-relay/ws'
import { WebSocketServer } from 'ws'
import http from 'node:http'

const host = process.env.RELAY_HOST || '0.0.0.0'
const port = Number(process.env.PORT || process.env.RELAY_PORT || 49443)

const dht = new DHT()
const server = http.createServer((req, res) => {
  if (req.url === '/healthz' || req.url === '/') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Pear Drops relay is running\n')
    return
  }

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('Not found\n')
})

const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
})

wss.on('connection', (socket) => {
  relay(dht, new RelayStream(false, socket))
})

server.listen(port, host, () => {
  console.log(`[relay] health endpoint: http://${host}:${port}/healthz`)
  console.log(`[relay] websocket relay: ws://${host}:${port}`)
})
