# PearDrop Web

Browser client for opening invite links and downloading from active native hosts.

## Dev Architecture

- Invite pages normalize and route shared links.
- Join/download UI uses WebRTC-enabled invites (`signal` key required).
- Signaling/bootstrap uses `@hyperswarm/dht-relay`.
- File transfer flows through WebRTC data channels once peers connect.

## Local Run

```bash
npm install
npm run relay
npm run dev
```

## Tests

```bash
npm test
```

## Build

```bash
npm run build
```
