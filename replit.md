# Defesa Civil Ouro Branco — App de Gerenciamento de Ocorrências

## Run & Operate
- `npm run start` — starts Express server (port 3001) + Vite dev server (port 5000) concurrently
- `npm run dev` — Vite dev server only (requires separate `npm run server`)
- `npm run server` — Express API server only (port 3001)
- `npm run build` — build frontend for production

Required env vars (managed via Replit Secrets / env vars):
- `DATABASE_URL` — Replit PostgreSQL (auto-provisioned)
- `VAPID_PUBLIC_KEY` / `VITE_VAPID_PUBLIC_KEY` — VAPID public key (set in shared env)
- `VAPID_PRIVATE_KEY` — VAPID private key (set as Replit Secret)
- `VAPID_SUBJECT` — mailto: for VAPID (set in shared env)
- `PORT` — server port, default 3001 (set in shared env)
- `VITE_USE_SUPABASE` — set to `false` on Replit; Express+PostgreSQL is primary

## Stack
- **Frontend**: React 19 + TypeScript + Vite (port 5000 in dev)
- **Backend**: Express 5 + Node.js 20 + native WebSocket (`ws`) (port 3001)
- **Database**: Replit PostgreSQL via `pg` (primary on Replit); Supabase as optional fallback for Netlify
- **Push Notifications**: Web Push (VAPID) via `web-push` on Express server
- **Maps**: Leaflet + react-leaflet (tiles proxied via `/api/tiles`)

## Where things live
- `server/index.js` — Express API + WebSocket server + DB init (`initDb`)
- `src/api.ts` — CRUD for ocorrências (Express primary, Supabase fallback)
- `src/matApi.ts` — CRUD for materiais/emprestimos/campo (Express primary, Supabase fallback)
- `src/supabaseClient.ts` — Supabase client; `supabaseDisponivel` is `false` on Replit
- `src/wsClient.ts` — WebSocket + optional Supabase Realtime broadcast
- `src/pushNotifications.ts` — Web Push subscription via Express `/api/push-subscriptions`
- `src/components/` — React components per feature
- `src/offline.ts` — IndexedDB offline queue + cache
- `public/sw.js` — Service Worker (PWA, map tile cache)
- `attached_assets/` — report template (.docx)

## Architecture decisions
- **Express + Replit PostgreSQL is primary on Replit** — `VITE_USE_SUPABASE=false` disables Supabase path
- **Supabase fallback preserved** for Netlify deployment compatibility (no Express available there)
- DB tables auto-created on server startup via `initDb()` in `server/index.js`
- Realtime uses native WebSocket (`/ws`) on Replit; Supabase Realtime only when Supabase is active
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
- `supabaseDisponivel` is `false` on Replit (controlled by `VITE_USE_SUPABASE=false`)
- DB tables auto-created on server startup — no separate migration step needed on Replit
- `concurrently` is a dev dependency — required for `npm run start`
- Production deployment serves built `/dist` from Express; Vite is not needed

## Pointers
- DB schema: `server/index.js` → `initDb()` function
- matApi methods: `src/matApi.ts`
- Push flow: `src/pushNotifications.ts` → Express `/api/push-subscriptions` → `/api/send-sos-push`
- WS events: `server/index.js` → `wss.on('connection')` handler
