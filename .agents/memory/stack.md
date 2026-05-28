---
name: Stack e arquitetura
description: Visão geral do stack técnico do projeto Defesa Civil Ouro Branco
---

# Stack — Defesa Civil Ouro Branco PWA

## Frontend
- React 19 + TypeScript + Vite (porta 5173 dev, build → `dist/`)
- Leaflet / react-leaflet para mapas
- ExcelJS (lazy import via `await import('exceljs')`) para exportação
- Service Worker em `public/sw.js` — offline, push, cache tiles

## Backend
- Express 5 + Node.js em `server/index.js` (porta 5000)
- WebSocket nativo (`ws`) em `/ws` — broadcast em tempo real
- `pg` para PostgreSQL (Replit managed)

## Banco
- Replit PostgreSQL (DATABASE_URL via env secrets)
- Schema auto-criado no `initDB()` em `server/index.js`
- `VITE_USE_SUPABASE=false` — Supabase é fallback inativo

## Push
- VAPID keys em `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` (env secrets)
- `web-push` lib no servidor
- Subscriptions em tabela `push_subscriptions` (endpoint, p256dh, auth, agente)

## Convenções importantes
- Supabase path sempre preservado como fallback morto (não remover)
- Conversões Plano ↔ DB: `sbParaPlano` e `planoParaSB` em Planejamento.tsx
- IDs offline: negativos e estáveis (baseados em localId, não posição)
