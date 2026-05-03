# Defesa Civil de Ouro Branco — Sistema de Vistorias

## Overview
This project is a comprehensive Progressive Web Application (PWA) designed for the Defesa Civil de Ouro Branco (MG) to register and manage occurrences. Its primary purpose is to streamline the workflow for civil defense operations, providing tools for real-time incident tracking, reporting, and team coordination.

## System Architecture

The app runs as a **fullstack Node.js + React** application on Replit:

- **Frontend**: React 19 + TypeScript + Vite 5. Dev server on port 5000.
- **Backend**: Express.js on port 3001. All data access goes through `/api/*` REST endpoints.
- **Database**: Replit native PostgreSQL (via `pg` Pool + `DATABASE_URL` env var). Tables are auto-created at startup by `initDb()` in `server/index.js`.
- **Realtime**: Native WebSocket at `ws://host/ws` (no Supabase Realtime). Messages are broadcast from the Express server to all connected clients.

## Authentication
Hardcoded login (no external auth service):
- Email: `defesacivilob@gmail.com`
- Password: `dc-2026`
- Agent name selection after login (stored in localStorage).

## Running the App
- `npm run start` — starts both Express (port 3001) and Vite dev server (port 5000) concurrently.
- Workflow: "Start application" → `npm run start`.
- Required env var: `DATABASE_URL` (set automatically by Replit PostgreSQL integration).

## Key Files
- `server/index.js` — Express API server, WebSocket, DB init, all CRUD endpoints
- `src/api.ts` — frontend API calls (fetch to `/api/*`)
- `src/wsClient.ts` — native WebSocket client (replaces Supabase Realtime)
- `src/supabaseClient.ts` — stub file (throws if called, `isSupabaseConfigured()` returns false)
- `src/pushNotifications.ts` — Web Push subscription via `/api/push-subscriptions`
- `src/components/EscalaAgentes.tsx` — schedule management (fetch `/api/escala`)
- `src/components/ChecklistViatura.tsx` — vehicle checklist (fetch `/api/checklists`)
- `src/components/MateriaisEmprestimos.tsx` — materials & loans management
- `src/components/NovaOcorrencia.tsx` — new occurrence form
- `src/components/MapaOcorrencias.tsx` — occurrence map with GPS tracking

## Database Tables (auto-created)
- `ocorrencias` — civil defense occurrences
- `escala_estado` — agent schedule state (single row, id=1)
- `checklists_viatura` — vehicle inspection checklists
- `materiais` — materials/equipment inventory
- `emprestimos` — equipment loan records
- `push_subscriptions` — Web Push subscriptions
- `equipamentos_campo` — field equipment tracking
- `sos_ativos` — active SOS alerts (in-memory on server + DB)
- `locations` — agent GPS positions (in-memory on server + DB)

## API Endpoints (Express)
- `GET/POST /api/ocorrencias` — list/create occurrences
- `GET/PUT/DELETE /api/ocorrencias/:id` — read/update/delete occurrence
- `GET/PUT /api/escala` — get/save schedule state
- `GET/POST /api/checklists` + `DELETE /api/checklists/:id`
- `GET/POST /api/materiais` + `PATCH/DELETE /api/materiais/:id`
- `GET/POST /api/emprestimos` + `PATCH /api/emprestimos/:id`
- `GET/POST /api/equipamentos-campo` + `PATCH/DELETE /api/equipamentos-campo/:id`
- `POST /api/push-subscriptions` + `DELETE /api/push-subscriptions/:id`
- `POST /api/sos` — SOS broadcast
- `POST /api/send-sos-push` — send Web Push notifications
- `GET /api/vapid-public-key` — VAPID public key for push
- `GET /api/tiles/:z/:x/:y` — OSM tile proxy
- `GET /api/geocode` — Nominatim geocoding proxy
- `GET /api/rota` — OSRM routing proxy
- `GET /api/tempo` — Open-Meteo weather proxy
- `GET /api/health` — health check

## WebSocket Messages
Native WS at `/ws`. Client sends/receives JSON `{ tipo, ... }`:
- `posicao` — GPS location update
- `parar` — GPS stopped
- `sos` / `sos-cancelar` / `sos-audio` / `sos-visualizar`
- `online` / `offline` — presence
- `solicitar_estado` — request current SOS + GPS state
- `ocorrencias_atualizadas` — DB change broadcast
- `online_sync` — list of online agents

## External Services
- **OpenStreetMap**: map tiles (proxied via `/api/tiles`)
- **Nominatim**: geocoding (proxied via `/api/geocode`)
- **OSRM**: routing (proxied via `/api/rota`)
- **Open-Meteo**: weather (via `/api/tempo`)
- **Web Push**: VAPID keys in env vars `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

## Push Notifications (VAPID)
- Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` in Replit Secrets.
- Generate keys: `npx web-push generate-vapid-keys --json`
- `VAPID_SUBJECT` = `mailto:defesacivilob@gmail.com`

## Features
- Occurrence registration with GPS, photos, risk levels
- Real-time GPS tracking of agents on map
- SOS emergency alert system with audio recording
- Vehicle inspection checklists with photo evidence
- Agent schedule management (on-call, leave, overtime tracking)
- Equipment/materials loan tracking with digital signature
- Field equipment deployment tracking
- Offline support via Service Worker + IndexedDB
- DOCX report generation (client-side, JSZip)
- Excel export (client-side, ExcelJS)
- Web Push notifications for SOS alerts
