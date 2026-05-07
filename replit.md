# Defesa Civil Ouro Branco — App de Gerenciamento de Ocorrências

## Run & Operate
- `npm run start` — starts Express server (port 3001) + Vite dev server (port 5000) concurrently via `npx concurrently`
- `npm run dev` — Vite dev server only (requires separate `npm run server`)
- `npm run server` — Express API server only (port 3001)
- `npm run build` — build frontend for production

Required env vars (all set in Replit shared env / secrets):
- `DATABASE_URL` — Replit PostgreSQL (auto-provisioned; do not set manually)
- `VAPID_PUBLIC_KEY` / `VITE_VAPID_PUBLIC_KEY` — VAPID public key
- `VAPID_PRIVATE_KEY` — VAPID private key (secret)
- `VAPID_SUBJECT` — mailto: contact for VAPID
- `PORT` — Express server port (default 3001)
- `VITE_USE_SUPABASE` — set to `false` on Replit (disables Supabase; Express+PostgreSQL is the primary backend)

## Stack
- **Frontend**: React 19 + TypeScript + Vite (port 5000 in dev)
- **Backend**: Express 5 + Node.js 20 + native WebSocket (`ws`) (port 3001)
- **Database**: Replit PostgreSQL — schema auto-created by `initDb()` on server startup
- **Push Notifications**: Web Push (VAPID) via `web-push` on Express server
- **Maps**: Leaflet + react-leaflet (tiles proxied via `/api/tiles`)

## Where things live
- `server/index.js` — Express API + WebSocket server + DB init (`initDb`)
- `src/api.ts` — CRUD for ocorrências (Express primary, Supabase disabled fallback)
- `src/matApi.ts` — CRUD for materiais/emprestimos/campo (Express primary)
- `src/supabaseClient.ts` — Supabase client; `supabaseDisponivel=false` on Replit (VITE_USE_SUPABASE=false)
- `src/wsClient.ts` — WebSocket client (connects to /ws via Vite proxy)
- `src/pushNotifications.ts` — Web Push subscription via Express `/api/push-subscriptions`
- `src/components/` — React components per feature
- `src/offline.ts` — IndexedDB offline queue + cache
- `public/sw.js` — Service Worker (PWA, map tile cache)
- `attached_assets/` — report template (.docx)

## Architecture on Replit
- **Express + Replit PostgreSQL** is the unified data store (`VITE_USE_SUPABASE=false`)
- Supabase code is present for Netlify fallback but completely inactive on Replit
- DB tables auto-created on server startup — no separate migration step needed
- Vite dev server (port 5000) proxies `/api` and `/ws` to Express (port 3001)
- `concurrently` is a devDependency; called via `npx concurrently` in the start script

## Product
- Register and manage civil defense incidents with photos and GPS
- Real-time team tracking via WebSocket
- SOS alert system with Web Push notifications
- Agent schedule and hour bank management (escala)
- Vehicle checklist
- Materials, loans, and field equipment tracking (patrimônio)
- Inspection report generation (DOCX)
- KMZ/KML and Excel export
- Offline mode with sync queue (IndexedDB)

## User preferences
- Login: `defesacivilob@gmail.com` / `dc-2026`
- App is mobile-first PWA for field teams
- Portuguese (pt-BR) UI

## Gotchas
- Server runs on port 3001; Vite dev server on port 5000 with proxy (`/api` and `/ws`)
- `VITE_USE_SUPABASE=false` must remain set — this disables Supabase and routes all data through Express
- DB tables auto-created on server startup — no separate migration step needed on Replit
- Production deployment: Express serves built `/dist` from `vite build`

## Pointers
- DB schema: `server/index.js` → `initDb()` function
- matApi methods: `src/matApi.ts`
- Push flow: `src/pushNotifications.ts` → Express `/api/push-subscriptions` → `/api/send-sos-push`
- WS events: `server/index.js` → `wss.on('connection')` handler
