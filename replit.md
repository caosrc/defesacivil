# Defesa Civil Ouro Branco — App de Gerenciamento de Ocorrências

## Run & Operate
- `npm run start` — starts both Express server (port 3001) and Vite dev server (port 5000) concurrently
- `npm run dev` — Vite dev server only (requires separate `npm run server`)
- `npm run server` — Express API server only (port 3001)
- `npm run build` — build frontend for production

Required env vars (set in Replit Secrets or `.replit` userenv):
- `DATABASE_URL` — Replit PostgreSQL (set automatically)
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — Supabase (primary data source)
- `VAPID_PUBLIC_KEY` / `VITE_VAPID_PUBLIC_KEY` — VAPID public key
- `VAPID_PRIVATE_KEY` — VAPID private key (secret)
- `VAPID_SUBJECT` — mailto: for VAPID
- `PORT` — server port (default 3001)

## Stack
- **Frontend**: React 19 + TypeScript + Vite (port 5000)
- **Backend**: Express 5 + Node.js 20 + native WebSocket (`ws`) (port 3001)
- **Database**: Supabase (primary, shared with Netlify) + Replit PostgreSQL (fallback)
- **Push Notifications**: Web Push (VAPID) via `web-push` on server
- **Maps**: Leaflet + react-leaflet (tiles proxied via `/api/tiles`)

## Where things live
- `server/index.js` — Express API + WebSocket server + DB init
- `src/api.ts` — CRUD for ocorrências (Supabase primary, Express fallback)
- `src/matApi.ts` — CRUD for materiais/emprestimos/campo (Supabase primary, Express fallback)
- `src/wsClient.ts` — WebSocket + Supabase Realtime broadcast
- `src/pushNotifications.ts` — Web Push subscription via Supabase/Express
- `src/components/` — React components per feature
- `src/offline.ts` — IndexedDB offline queue + cache
- `public/sw.js` — Service Worker (PWA, map tile cache)
- `attached_assets/` — report template (.docx)

## Architecture decisions
- **Supabase is the single source of truth** — all CRUD uses Supabase when `supabaseDisponivel`; Express/PostgreSQL is fallback only
- Works on both **Netlify** (no Express) and **Replit dev** (Express + Supabase available)
- `MateriaisEmprestimos` uses `matApi.ts` exclusively — zero direct `fetch('/api/...')` calls
- `EscalaAgentes` and `ChecklistViatura` also use Supabase first, Express as fallback
- Realtime uses native WebSocket (`/ws`) + Supabase Realtime broadcast channel
- Push notifications use server-side VAPID; subscriptions stored in Supabase

## Product
- Register and manage civil defense incidents with photos and GPS
- Real-time team tracking via WebSocket + Supabase Realtime
- SOS alert system with Web Push notifications
- Agent schedule and hour bank management (escala)
- Vehicle checklist
- Materials, loans, and field equipment tracking (patrimônio)
- Inspection report generation (DOCX)
- KMZ/KML and Excel export
- Offline mode with sync queue

## User preferences
- Login: `defesacivilob@gmail.com` / `dc-2026`
- App is mobile-first PWA for field teams

## Gotchas
- Server runs on port 3001; Vite dev server on port 5000 with proxy
- Production deployment (Netlify): only Supabase is used — Express is not available
- VAPID keys are already set in `.replit` userenv — do not overwrite
- DB tables auto-created on server startup via `initDb()` — Replit PostgreSQL only
- Supabase is the PRIMARY data store; Replit PostgreSQL is only a dev fallback
- `supabaseDisponivel` = true when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set

## Pointers
- DB schema (Replit): `server/index.js` → `initDb()` function
- matApi methods: `src/matApi.ts` (Supabase primary for all patrimônio CRUD)
- Push flow: `src/pushNotifications.ts` → Supabase `push_subscriptions` → `/api/send-sos-push`
- WS events: `server/index.js` → `wss.on('connection')` handler
