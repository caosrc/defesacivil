# Defesa Civil Ouro Branco — App de Gerenciamento de Ocorrências

## Visão Geral
Aplicativo web mobile-first (PWA) para equipes de campo da Defesa Civil de Ouro Branco - MG. Funcionalidades principais:
- Registro e gerenciamento de ocorrências com fotos e GPS
- Rastreamento em tempo real de equipes via WebSocket
- SOS com push notifications (Web Push / VAPID)
- Escala de agentes e banco de horas
- Checklist de viatura
- Materiais, empréstimos e equipamentos em campo
- Geração de relatório de vistoria em DOCX
- Exportação KMZ/KML e Excel
- Modo offline com fila de sincronização

## Arquitetura

### Frontend
- **React 19 + TypeScript + Vite** na porta 5000
- PWA com service worker em `public/sw.js`
- Mapas: Leaflet + react-leaflet
- WebSocket client: `src/wsClient.ts`
- Push notifications: `src/pushNotifications.ts`
- GPS: `src/gpsService.ts`
- Offline queue/cache: `src/offline.ts`
- Exportação Excel: `src/exportExcel.ts`

### Backend
- **Express (Node.js)** na porta 3001
- **PostgreSQL** via `DATABASE_URL` (Replit native DB)
- WebSocket Server (`ws`) em `/ws`
- Geração de DOCX via `jszip`
- Push SOS via `web-push` (VAPID)

### Endpoints principais
- `GET/POST /api/ocorrencias` — CRUD de ocorrências
- `GET/PUT /api/escala` — escala de agentes
- `GET/POST /api/checklists` — checklists de viatura
- `GET/POST /api/materiais` — catálogo de materiais
- `GET/POST /api/emprestimos` — empréstimos
- `GET/POST /api/equipamentos-campo` — equipamentos em campo
- `POST /api/push-subscriptions` — inscrição Web Push
- `POST /api/send-sos-push` — disparo de SOS push
- `POST /api/relatorio-vistoria` — geração de relatório DOCX
- `GET /api/tiles/:z/:x/:y` — proxy de tiles OSM
- `GET /api/geocode` — proxy Nominatim
- `GET /api/rota` — proxy OSRM
- `GET /api/tempo` — dados climáticos INMET/Open-Meteo
- `GET /api/vapid-public-key` — chave VAPID pública
- `WebSocket /ws` — rastreamento GPS em tempo real + SOS

## Estrutura de arquivos
```
server/index.js        — Backend Express + WebSocket + DB
src/
  App.tsx              — Shell principal, navegação por abas
  main.tsx             — Entry point, registro do SW
  config.ts            — URLs de API e WebSocket
  api.ts               — Funções de API para ocorrências
  wsClient.ts          — Cliente WebSocket
  gpsService.ts        — Rastreamento GPS
  pushNotifications.ts — Web Push (SOS)
  offline.ts           — Cache offline e fila pendente
  exportExcel.ts       — Exportação Excel
  components/          — Componentes React por funcionalidade
public/
  sw.js                — Service Worker PWA
attached_assets/       — Template DOCX para relatórios
```

## Variáveis de Ambiente
- `DATABASE_URL` — PostgreSQL (gerenciado pelo Replit, provisionado automaticamente)
- `VAPID_PUBLIC_KEY` / `VITE_VAPID_PUBLIC_KEY` — Chave pública VAPID (env var compartilhada)
- `VAPID_PRIVATE_KEY` — Chave privada VAPID (**Replit Secret** — nunca exposta no frontend)
- `VAPID_SUBJECT` — Email para VAPID (env var compartilhada)
- `PORT` — Porta do servidor (padrão: 3001, env var compartilhada)

## Scripts
- `npm run start` — Inicia backend (porta 3001) + Vite dev server (porta 5000) em paralelo
- `npm run build` — Build de produção do frontend
- `node server/index.js` — Somente backend (produção)

## Banco de Dados
Tabelas criadas automaticamente no `initDb()` ao iniciar o servidor:
- `ocorrencias` — Registros de ocorrências
- `escala_estado` — Estado da escala de agentes
- `checklists_viatura` — Checklists de viaturas
- `materiais` — Catálogo de materiais
- `emprestimos` — Registros de empréstimos
- `push_subscriptions` — Inscrições Web Push
- `equipamentos_campo` — Equipamentos implantados em campo
- `sos_ativos_db` — Alertas SOS persistidos

## Credenciais de acesso (desenvolvimento)
- Usuário: `defesacivilob@gmail.com`
- Senha: `dc-2026`

## Notas de migração Replit
- Supabase foi removido — `supabaseClient.ts` retorna `null`; todos os dados vão via Express + PostgreSQL nativo do Replit
- Edge Function `send-sos-push` foi portada para `POST /api/send-sos-push` no servidor Express
- VAPID_PRIVATE_KEY armazenada como Replit Secret (não exposta em código)
- Banco de dados PostgreSQL provisionado pelo Replit com DATABASE_URL injetado automaticamente
