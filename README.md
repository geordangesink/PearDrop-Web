# PearDrop Web (MVP)

Browser join/download client for PearDrop native uploaders.

## Architecture

- web app parses `peardrops://invite` URLs
- requires WebRTC-enabled invites (`signal` key) for browser downloads
- uses `@hyperswarm/dht-relay` for signaling transport/bootstrap
- transfers manifest/file data over direct WebRTC data channels once connected
- TODO: evaluate a future non-WebRTC fallback with equivalent privacy guarantees

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
