# Defesa Civil Ouro Branco — App de Gerenciamento de Ocorrências

## Run & Operate
- `npm run start` — starts both Express server (port 3001) and Vite dev server (port 5000) concurrently
- `npm run dev` — Vite dev server only (requires separate `npm run server`)
- `npm run server` — Express API server only (port 3001)
- `npm run build` — build frontend for production

Required env vars (set in Replit Secrets or `.replit` userenv):
- `DATABASE_URL` — Replit PostgreSQL (set automatically)
- `VAPID_PUBLIC_KEY` / `VITE_VAPID_PUBLIC_KEY` — VAPID public key
- `VAPID_PRIVATE_KEY` — VAPID private key (secret)
- `VAPID_SUBJECT` — mailto: for VAPID
- `PORT` — server port (default 3001)

## Stack
- **Frontend**: React 19 + TypeScript + Vite (port 5000)
- **Backend**: Express 5 + Node.js 20 + native WebSocket (`ws`) (port 3001)
- **Database**: Replit PostgreSQL (via `pg` pool, `DATABASE_URL`)
- **Push Notifications**: Web Push (VAPID) via `web-push` on server
- **Maps**: Leaflet + react-leaflet (tiles proxied via `/api/tiles`)

## Where things live
- `server/index.js` — Express API + WebSocket server + DB init
- `src/api.ts` — CRUD for ocorrências (REST)
- `src/wsClient.ts` — native WebSocket client (browser)
- `src/pushNotifications.ts` — Web Push subscription (uses `/api/push-subscriptions`)
- `src/components/` — React components per feature
- `src/offline.ts` — IndexedDB offline queue + cache
- `public/sw.js` — Service Worker (PWA, map tile cache)
- `attached_assets/` — report template (.docx)

## Architecture decisions
- All data goes through the Express REST API — no direct DB access from the browser
- Realtime uses a native WebSocket server (`/ws`) — no Supabase Realtime dependency
- Push notifications use server-side VAPID (Express route `/api/send-sos-push`)
- DB schema is created/migrated automatically at server startup via `initDb()`
- Vite proxies `/api` and `/ws` to `localhost:3001` in dev; production serves built frontend from Express

## Product
- Register and manage civil defense incidents with photos and GPS
- Real-time team tracking via native WebSocket
- SOS alert system with Web Push notifications
- Agent schedule and hour bank management
- Vehicle checklist
- Materials, loans, and field equipment tracking
- Inspection report generation (DOCX)
- KMZ/KML and Excel export
- Offline mode with sync queue

## User preferences
- Login: `defesacivilob@gmail.com` / `dc-2026`
- App is mobile-first PWA for field teams

## Gotchas
- Server runs on port 3001; Vite dev server on port 5000 with proxy
- Production deployment: build with `npx vite build`, serve with `node server/index.js`
- VAPID keys are already set in `.replit` userenv — do not overwrite
- DB tables auto-created on server startup — no manual migration needed
- `supabaseClient.ts` kept as stub (not used) to avoid removing unused file

## Pointers
- DB schema: `server/index.js` → `initDb()` function
- Push flow: `src/pushNotifications.ts` → `/api/push-subscriptions` → `/api/send-sos-push`
- WS events: `server/index.js` → `wss.on('connection')` handler
