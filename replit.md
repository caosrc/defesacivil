# Defesa Civil Ouro Branco — App de Gerenciamento de Ocorrências

## Run & Operate
- **Development + Production**: `npm install && npm run build && node server/index.js`
- The Express server builds the Vite frontend and serves everything on **port 5000**
- `npm run dev` — Vite dev server (port 5000) with proxy to Express on port 3001 (dev only)
- `npm run build` — build frontend for production only

Required env vars (all set in Replit shared env / secrets):
- `DATABASE_URL` — Replit PostgreSQL (auto-provisioned; do not set manually)
- `VAPID_PUBLIC_KEY` — VAPID public key (shared env var, already set)
- `VAPID_PRIVATE_KEY` — VAPID private key (**secret** — needed for push notifications)
- `VAPID_SUBJECT` — mailto: contact for VAPID (already set)
- `PORT` — Express server port (set to 5000)
- `VITE_USE_SUPABASE` — defaults to `true` when Supabase URL and key are present; set to `false` only for an explicit local-only fallback
- `NODE_ENV` — set to `production`
- `EARTH_ENGINE_SERVICE_ACCOUNT_JSON` — Secret containing the complete Google Cloud service-account JSON key
- `EARTH_ENGINE_PROJECT` — optional Earth Engine/Google Cloud project ID; when omitted, uses the `project_id` from the JSON key
- `FIRMS_MAP_KEY` — Secret for NASA FIRMS active-fire data
- `PLANET_API_KEY` — Secret for Planet satellite imagery queries

## Stack
- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Express 5 + Node.js 20 + native WebSocket (`ws`) — port 5000
- **Database**: Replit PostgreSQL — schema auto-created by `initDb()` on server startup
- **Push Notifications**: Web Push (VAPID) via `web-push` on Express server
- **Maps**: Leaflet + react-leaflet (tiles proxied via `/api/tiles`)
- **Incêndios ativos**: NASA FIRMS (VIIRS NOAA-20/S-NPP, MODIS Terra/Aqua) + Google Earth Engine (GOES-19 ABI, MODIS e VIIRS), exibidos como focos e camadas no mapa
- **Chuva ao vivo**: a base muda para imagem de satélite, recebe nuvens GOES-19 do setor sul da América do Sul e o servidor lê o PNG do quadro RainViewer para gerar GeoJSON da mancha irregular e dos núcleos fortes, enquanto o limite oficial de Ouro Branco é desenhado via OpenStreetMap/Nominatim
- **Imagens Planet**: consulta protegida pelo servidor em `/api/planet-focos`

## Where things live
- `server/index.js` — Express API + WebSocket server + DB init (`initDb`)
- `src/api.ts` — CRUD for ocorrências (Express primary, Supabase disabled)
- `src/matApi.ts` — CRUD for materiais/emprestimos/campo (Express primary)
- `src/supabaseClient.ts` — Supabase client; `supabaseDisponivel=false` on Replit (VITE_USE_SUPABASE=false)
- `src/wsClient.ts` — WebSocket client (connects to /ws)
- `src/pushNotifications.ts` — Web Push subscription via Express `/api/push-subscriptions`
- `src/components/` — React components per feature
- `src/offline.ts` — IndexedDB offline queue + cache
- `public/sw.js` — Service Worker (PWA, map tile cache)
- `attached_assets/` — report template (.docx)

## Architecture on Replit
- **Supabase** is the primary data store when configured; Express + Replit PostgreSQL remains the shared fallback for server-only features
- Supabase code is present for Netlify fallback but completely inactive on Replit
- DB tables auto-created on server startup — no separate migration step needed
- In production, Express serves the built `/dist` frontend directly on port 5000
- Vite dev server (port 5000) proxies `/api` and `/ws` to Express (port 3001) in dev mode only

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
- App is mobile-first PWA for field teams
- Portuguese (pt-BR) UI

## Gotchas
- Keep Supabase credentials configured for shared production data. Use `VITE_USE_SUPABASE=false` only when intentionally testing the local fallback.
- DB tables auto-created on server startup — no separate migration step needed on Replit
- Production: `npm run build && node server/index.js` — Express serves built `/dist`
- Push notifications require `VAPID_PRIVATE_KEY` secret to be set in Replit secrets
- Earth Engine requires the service account to have Earth Engine access and the `Service Usage Consumer` role on the Google Cloud project
- O botão **Chuva** ativa a imagem de satélite com nuvens GOES-19 atualizadas a cada 10 minutos e a mancha vetorial derivada do PNG RainViewer, atualizada automaticamente a cada 5 minutos. Gotas azuis só aparecem nos núcleos fortes detectados; a leitura em mm do centro é um resumo do Open-Meteo e não substitui pluviômetro local.
- O monitoramento do Earth Engine usa `FireMask >= 7` para MODIS/VIIRS e `Area > 0` para GOES-19 FDCF (cadência de 10 minutos); não interpreta chuva, radar, vegetação ou cicatriz de queimada como incêndio ativo

## Pointers
- DB schema: `server/index.js` → `initDb()` function
- matApi methods: `src/matApi.ts`
- Push flow: `src/pushNotifications.ts` → Express `/api/push-subscriptions` → `/api/send-sos-push`
- WS events: `server/index.js` → `wss.on('connection')` handler
