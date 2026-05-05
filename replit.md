# Defesa Civil Ouro Branco — App de Gerenciamento de Ocorrências

## Visão Geral
Aplicativo web mobile-first (PWA) para equipes de campo da Defesa Civil de Ouro Branco - MG. Deploy alvo: **Netlify** (frontend/functions) + **Supabase** (banco de dados + Realtime).

Funcionalidades principais:
- Registro e gerenciamento de ocorrências com fotos e GPS
- Rastreamento em tempo real de equipes via Supabase Realtime (Broadcast + Presence)
- SOS com push notifications (Web Push / VAPID) via Netlify Function
- Escala de agentes e banco de horas
- Checklist de viatura
- Materiais, empréstimos e equipamentos em campo
- Geração de relatório de vistoria em DOCX (100% client-side)
- Exportação KMZ/KML e Excel
- Modo offline com fila de sincronização

## Arquitetura

### Frontend (Netlify)
- **React 19 + TypeScript + Vite**
- PWA com service worker em `public/sw.js`
- Mapas: Leaflet + react-leaflet (tiles OSM direto, geocode Nominatim direto, rota OSRM direto)
- Realtime: `src/wsClient.ts` — Supabase Realtime (Broadcast para mensagens, Presence para agentes online)
- Push notifications: `src/pushNotifications.ts` — salva subscriptions no Supabase, envia via Netlify Function
- GPS: `src/gpsService.ts`
- Offline queue/cache: `src/offline.ts`
- Exportação Excel: `src/exportExcel.ts`
- Relatório DOCX: `src/relatorioVistoria.ts` (client-side com template `/public/relatorio-vistoria-template.docx`)

### Backend (Supabase)
- **Supabase** (PostgreSQL gerenciado) em `https://sjdpsplbcrlkekdfnnlj.supabase.co`
- Cliente JS: `src/supabaseClient.ts`
- CRUD direto via Supabase JS em todos os componentes (sem servidor intermediário)
- Realtime via Supabase Realtime channel `defesacivil-main`

### Netlify Functions
- `netlify/functions/send-sos-push.js` — Disparo de Web Push VAPID para SOS
  - Roteado por `/api/send-sos-push` → `/.netlify/functions/send-sos-push`

### Chamadas externas (direto do browser)
- Tiles: OpenStreetMap direto
- Geocode: Nominatim direto
- Rota: OSRM público direto
- Clima: Open-Meteo direto

## Estrutura de arquivos
```
netlify/
  functions/
    send-sos-push.js   — Netlify Function: Web Push SOS
netlify.toml           — Build config + redirects + headers
supabase-migration.sql — Schema SQL para rodar no painel Supabase
src/
  App.tsx              — Shell principal, navegação por abas
  main.tsx             — Entry point, registro do SW
  config.ts            — Helper netlifyFn()
  supabaseClient.ts    — Cliente Supabase JS
  api.ts               — CRUD ocorrências via Supabase
  wsClient.ts          — Supabase Realtime (Broadcast + Presence)
  gpsService.ts        — Rastreamento GPS
  pushNotifications.ts — Web Push (SOS) — subscriptions no Supabase
  offline.ts           — Cache offline e fila pendente
  exportExcel.ts       — Exportação Excel
  components/          — Componentes React por funcionalidade
public/
  sw.js                — Service Worker PWA
```

## Variáveis de Ambiente

### netlify.toml (já configuradas, públicas)
- `VITE_SUPABASE_URL` — URL do projeto Supabase
- `VITE_SUPABASE_ANON_KEY` — Chave anon Supabase (segura para frontend)
- `VITE_VAPID_PUBLIC_KEY` — Chave pública VAPID

### Netlify Dashboard → Environment Variables (secretas)
- `VAPID_PRIVATE_KEY` — Chave privada VAPID (**nunca exposta no frontend**)
- `VAPID_SUBJECT` — Email para VAPID (ex: `mailto:defesacivil@ourobranco.mg.gov.br`)
- `SUPABASE_SERVICE_ROLE_KEY` — (opcional) para a Netlify Function; se ausente, usa anon key

## Scripts
- `npm run dev` — Vite dev server (porta 5000, para desenvolvimento local)
- `npm run build` — Build de produção do frontend

## Banco de Dados (Supabase)
Execute `supabase-migration.sql` no SQL Editor do painel Supabase:
- `ocorrencias` — Registros de ocorrências
- `escala_estado` — Estado da escala de agentes (linha única id=1)
- `checklists_viatura` — Checklists de viaturas
- `materiais` — Catálogo de materiais/patrimônio
- `emprestimos` — Registros de empréstimos
- `push_subscriptions` — Inscrições Web Push
- `equipamentos_campo` — Equipamentos implantados em campo
- `sos_ativos_db` — Alertas SOS persistidos (TTL manual via DELETE)

RLS desabilitado em todas as tabelas (app não usa Supabase Auth).

## Credenciais de acesso (desenvolvimento)
- Usuário: `defesacivilob@gmail.com`
- Senha: `dc-2026`

## Checklist de deploy Netlify
1. Executar `supabase-migration.sql` no painel Supabase
2. Adicionar `VAPID_PRIVATE_KEY` nas env vars do Netlify Dashboard
3. Conectar repositório ao Netlify, build command `npm run build`, publish `dist`
4. Todas as outras env vars já estão em `netlify.toml`
