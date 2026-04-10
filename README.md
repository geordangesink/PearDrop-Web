# PearDrop Web (MVP)

Browser join/download client for PearDrop native uploaders.

## Architecture

- web app parses `peardrops://invite` URLs
- uses `@hyperswarm/dht-relay` over WebSocket transport to reach uploader swarm
- reads remote manifest and downloads file bytes directly from peer drive stream
- relay server only forwards DHT control traffic, not file storage

## Run

```bash
npm install
npm run relay
npm run dev
```

If the relay runs on another host, include it in the invite as `relay` query param.


## Test

```bash
npm test
```

Production build:

```bash
npm run build
```
