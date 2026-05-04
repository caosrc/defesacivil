# Defesa Civil Ouro Branco — PWA

Progressive Web App for the Civil Defense of Ouro Branco, MG. Manages emergency occurrences, agent schedules, vehicle checklists, materials/loans, and field equipment with real-time coordination via WebSockets and SOS alerts.

## Architecture

- **Frontend**: React 19 + TypeScript + Vite (port 5000)
- **Backend**: Node.js + Express (port 3001)
- **Database**: PostgreSQL (Replit native via `DATABASE_URL`)
- **Real-time**: WebSocket (`/ws`) — position tracking, SOS alerts, online agents
- **Push Notifications**: Web Push API with VAPID keys

## Running the App

```bash
npm run start  # runs both server (port 3001) and Vite (port 5000) concurrently
```

The Vite dev server proxies `/api` and `/ws` to `localhost:3001`.

## Key Files

- `server/index.js` — Express API + WebSocket server + DB init
- `src/App.tsx` — Main React component (tabs: Lista, Mapa, Viatura, Escala, Materiais)
- `src/api.ts` — Occurrence CRUD via REST `/api/ocorrencias`
- `src/wsClient.ts` — Native WebSocket client (real-time GPS, SOS, online agents)
- `src/pushNotifications.ts` — Web Push subscription management
- `src/components/` — All UI components
- `public/sw.js` — Service Worker for PWA/offline support

## Database Tables

All tables are auto-created on server start via `initDb()`:

- `ocorrencias` — Emergency occurrences with GPS, photos, status
- `escala_estado` — Agent shift schedule state (JSONB)
- `checklists_viatura` — Vehicle inspection checklists
- `materiais` — Equipment catalog
- `emprestimos` — Equipment loan records
- `equipamentos_campo` — Equipment deployed in the field
- `push_subscriptions` — Web Push subscriptions for SOS notifications
- `sos_ativos_db` — Active SOS alerts (persisted across server restarts)

## Environment Variables

Set in `.replit` `[userenv.shared]` or as Replit secrets:

- `DATABASE_URL` — PostgreSQL connection string (auto-set by Replit DB)
- `VAPID_PUBLIC_KEY` — VAPID public key for Web Push
- `VAPID_PRIVATE_KEY` — VAPID private key for Web Push
- `VAPID_SUBJECT` — VAPID subject (mailto: or URL)
- `VITE_VAPID_PUBLIC_KEY` — Same public key exposed to frontend
- `PORT` — Server port (default 3001)

## Login

- **Email**: `defesacivilob@gmail.com`
- **Password**: `dc-2026`
- After login, user selects an agent name from a list

## API Endpoints

- `GET/POST /api/ocorrencias` — Occurrences
- `GET/PUT /api/escala` — Agent schedule
- `GET/POST/DELETE /api/checklists` — Vehicle checklists
- `GET/POST/PATCH/DELETE /api/materiais` — Equipment catalog
- `GET/POST/PATCH /api/emprestimos` — Equipment loans
- `GET/POST/PATCH/DELETE /api/equipamentos-campo` — Field equipment
- `POST/DELETE /api/push-subscriptions` — Push notification subscriptions
- `POST /api/send-sos-push` — Trigger SOS push notifications
- `POST /api/sos` — SOS event processing (REST fallback)
- `GET /api/vapid-public-key` — Public VAPID key for frontend
- `POST /api/relatorio-vistoria` — Generate .docx inspection reports
- `GET /api/tiles/:z/:x/:y` — OpenStreetMap tile proxy
- `GET /api/geocode` — Nominatim geocode proxy
- `GET /api/rota` — OSRM routing proxy
- `GET /api/tempo` — Weather data (INMET/Open-Meteo)
- `GET /api/health` — Health check

## Migration Notes

- Migrated from Supabase to Replit's native PostgreSQL
- All frontend Supabase calls replaced with native `fetch()` to `/api/*` endpoints
- WebSocket client (`wsClient.ts`) rewritten from Supabase Realtime to native WebSocket
- Supabase Edge Function (`send-sos-push`) replaced by `/api/send-sos-push` Express route
- `@supabase/supabase-js` package still installed but only used in `supabaseClient.ts` (kept as dead code for reference, not imported anywhere functional)
