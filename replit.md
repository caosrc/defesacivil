# Defesa Civil de Ouro Branco — Sistema de Vistorias

## Overview
Progressive Web Application (PWA) para a Defesa Civil de Ouro Branco (MG). Gerencia ocorrências, escala, checklists, patrimônios e SOS em tempo real.

## System Architecture

### Frontend (React 19 + TypeScript + Vite 5)
- Toda a camada de dados usa **Supabase JS client diretamente** — não há backend Express no Netlify.
- Comunicação em tempo real via **Supabase Realtime Broadcast + Presence** (substitui WebSocket).
- Push notifications via **Supabase Edge Function** `send-sos-push`.

### Backend (Express — apenas para desenvolvimento local no Replit)
- `server/index.js` roda na porta 3001 com as mesmas tabelas.
- Em dev usa Replit PostgreSQL (`DATABASE_URL`) + WebSocket em `/ws`.
- Em produção (Netlify) o Express NÃO é usado — tudo vai direto ao Supabase.

### Banco de Dados
- **Produção**: Supabase PostgreSQL — projeto `sjdpsplbcrlkekdfnnlj`
- **Desenvolvimento**: Replit native PostgreSQL (separado do Supabase)
- Schema completo em `supabase-schema.sql` — executar no SQL Editor do Supabase.

### Deploy
- **Netlify** — hospeda apenas o frontend estático (`dist/`).
- Build: `npm run build` → publica `dist/`.
- Variáveis de ambiente em `netlify.toml` (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_VAPID_PUBLIC_KEY).

## Authentication
Login fixo (sem serviço externo):
- Email: `defesacivilob@gmail.com`
- Senha: `dc-2026`
- Escolha de agente após login (localStorage).

## Running the App
- `npm run start` — inicia Express (3001) + Vite dev (5000) em paralelo.
- Workflow: "Start application" → `npm run start`.

## Key Files
- `src/api.ts` — CRUD de ocorrências via Supabase JS client
- `src/wsClient.ts` — Supabase Realtime Broadcast + Presence (substitui WebSocket)
- `src/supabaseClient.ts` — cliente Supabase inicializado (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)
- `src/pushNotifications.ts` — Web Push: salva no Supabase, chama Edge Function
- `src/components/EscalaAgentes.tsx` — escala via Supabase (tabela `escala_estado`)
- `src/components/ChecklistViatura.tsx` — checklists via Supabase
- `src/components/MateriaisEmprestimos.tsx` — materiais/empréstimos/campo via Supabase
- `src/App.tsx` — equipamentos em campo para o mapa via Supabase
- `server/index.js` — Express (dev only): todas as rotas + WebSocket + Replit PG
- `supabase-schema.sql` — schema completo a executar no Supabase SQL Editor
- `netlify.toml` — configuração Netlify com variáveis de ambiente Supabase
- `supabase/functions/send-sos-push/index.ts` — Edge Function para push SOS

## Supabase Tables
- `ocorrencias` — ocorrências de defesa civil
- `escala_estado` — estado da escala (linha única, id=1, campo `data` JSONB)
- `checklists_viatura` — checklists de inspeção da viatura
- `materiais` — inventário de materiais/patrimônio
- `emprestimos` — registros de empréstimos de equipamentos
- `push_subscriptions` — inscrições Web Push (por dispositivo)
- `equipamentos_campo` — equipamentos implantados em campo
- `sos_ativos_db` — alertas SOS ativos (persistência entre sessões)

## Supabase Realtime (via wsClient.ts)
Canal: `defesacivil-realtime`. Mensagens Broadcast (event = tipo):
- `posicao` — posição GPS do agente
- `parar` — parou rastreamento GPS
- `sos` / `sos-cancelar` / `sos-audio` / `sos-visualizar` / `sos-nova-mensagem`
- `online` / `offline` — presença
- `online_sync` — lista de agentes online (via Presence API)

## External Services
- **OpenStreetMap**: tiles de mapa (chamada direta, CORS OK)
- **Nominatim**: geocodificação (chamada direta)
- **OSRM**: roteamento (chamada direta)
- **Open-Meteo**: clima (chamada direta no MapaOcorrencias.tsx)
- **Web Push**: VAPID keys em env vars (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`)

## Push Notifications (VAPID)
- Chave pública: `BDR2WpHgL7IN1NNdJv67HEMbyeUEnDRvgcnyfdWaopzkAOqa6EDYSbkXroYJ8CC_kaPjGEm8q5CCEn0KUqt3kmE`
- Chave privada: em `VAPID_PRIVATE_KEY` (Replit Secret)
- Edge Function Supabase: `/functions/v1/send-sos-push` (precisa VAPID_PRIVATE_KEY configurada)

## Features
- Registro de ocorrências com GPS, fotos, níveis de risco
- Rastreamento GPS em tempo real de agentes no mapa
- Sistema de SOS de emergência com gravação de áudio
- Checklists de inspeção da viatura com fotos
- Gestão de escala de plantão (sobreaviso, folgas, férias, banco de horas)
- Controle de empréstimos de equipamentos com assinatura digital
- Rastreamento de equipamentos em campo
- Suporte offline via Service Worker + IndexedDB
- Geração de relatórios DOCX (client-side, JSZip)
- Exportação Excel (client-side, ExcelJS)
- Push notifications Web para alertas SOS

## GitHub
Repositório: `https://github.com/caosrc/defesacivil`
