# Defesa Civil Ouro Branco — App de Gerenciamento de Ocorrências

## Run & Operate
- `npm run start` — starts Express server (port 3001) + Vite dev server (port 5000) concurrently
- `npm run dev` — Vite dev server only (requires separate `npm run server`)
- `npm run server` — Express API server only (port 3001)
- `npm run build` — build frontend for production

Required env vars (managed via Replit Secrets / env vars):
- `DATABASE_URL` — Replit PostgreSQL (auto-provisioned; used only by Express for WS/push state)
- `VAPID_PUBLIC_KEY` / `VITE_VAPID_PUBLIC_KEY` — VAPID public key (set in shared env)
- `VAPID_PRIVATE_KEY` — VAPID private key (set as Replit Secret)
- `VAPID_SUBJECT` — mailto: for VAPID (set in shared env)
- `PORT` — server port, default 3001 (set in shared env)
- `VITE_USE_SUPABASE` — set to `true` on Replit AND Netlify; Supabase is the unified data store
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — Supabase credentials (set in shared env)

## Stack
- **Frontend**: React 19 + TypeScript + Vite (port 5000 in dev)
- **Backend**: Express 5 + Node.js 20 + native WebSocket (`ws`) (port 3001)
- **Database**: **Supabase** (unified, primary for both Replit and Netlify); Replit PostgreSQL kept only for Express WS/push infra
- **Push Notifications**: Web Push (VAPID) via `web-push` on Express server
- **Maps**: Leaflet + react-leaflet (tiles proxied via `/api/tiles`)

## Where things live
- `server/index.js` — Express API + WebSocket server + DB init (`initDb`)
- `src/api.ts` — CRUD for ocorrências (Express primary, Supabase fallback)
- `src/matApi.ts` — CRUD for materiais/emprestimos/campo (Express primary, Supabase fallback)
- `src/supabaseClient.ts` — Supabase client; `supabaseDisponivel` is `true` on both Replit and Netlify
- `src/wsClient.ts` — WebSocket + optional Supabase Realtime broadcast
- `src/pushNotifications.ts` — Web Push subscription via Express `/api/push-subscriptions`
- `src/components/` — React components per feature
- `src/offline.ts` — IndexedDB offline queue + cache
- `public/sw.js` — Service Worker (PWA, map tile cache)
- `attached_assets/` — report template (.docx)

## Architecture decisions
- **Supabase is the unified database** — `VITE_USE_SUPABASE=true` on both Replit and Netlify; both share the same data
- Express server remains for WebSocket (`/ws`), push notifications (VAPID), tile proxy — NOT for data storage
- `api.ts`/`matApi.ts` try Express first (returns valid JSON on Replit), then Supabase — on Netlify, Express returns HTML so Supabase is used directly
- Realtime: native WS (`/ws`) on Replit + Supabase Realtime broadcast both active when `supabaseDisponivel=true`
- VAPID private key stored as Replit Secret; public key in shared env vars

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
- `supabaseDisponivel` is `true` on both Replit and Netlify (`VITE_USE_SUPABASE=true` in shared env)
- DB tables auto-created on server startup — no separate migration step needed on Replit
- `concurrently` is a dev dependency — required for `npm run start`
- Production deployment serves built `/dist` from Express; Vite is not needed

## Pointers
- DB schema: `server/index.js` → `initDb()` function
- matApi methods: `src/matApi.ts`
- Push flow: `src/pushNotifications.ts` → Express `/api/push-subscriptions` → `/api/send-sos-push`
- WS events: `server/index.js` → `wss.on('connection')` handler
