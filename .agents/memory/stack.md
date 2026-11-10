---
name: Stack e arquitetura
description: Stack técnica, configuração do ambiente Replit, e decisões de backend/frontend.
---

## Stack
- Frontend: React 19 + TypeScript + Vite
- Backend: Express 5 + Node.js 20 + WebSocket (`ws`) — porta 5000
- Banco primário: Replit PostgreSQL (auto-provisionado)
- Supabase: usado como fonte de dados real (VITE_USE_SUPABASE=true em shared env)

## VITE_USE_SUPABASE — IMPORTANTE
**Deve ser `true`**. O banco PostgreSQL local (Replit) está vazio — todos os dados reais (ocorrências, fotos, etc.) estão no Supabase. Alterar para `false` quebra o app.

**Why:** O projeto foi importado do GitHub com dados já em Supabase. O replit.md diz `false`, mas isso está desatualizado — o usuário usa Supabase como fonte de dados.

**How to apply:** Sempre manter `VITE_USE_SUPABASE=true` em shared env. Nunca mudar para `false`.

## npm install
- `npm install` falha com "Invalid Version" por entradas `@esbuild` com versão vazia no `package-lock.json`.
- Workaround obrigatório: `npm install --no-package-lock --silent`.

## Export Excel — Fotos
- Fotos das ocorrências são base64 no Supabase (`data:image/jpeg;base64,...`).
- Buscar fotos pelo browser direto do Supabase pode falhar por CORS.
- Solução implementada: endpoint `/api/ocorrencias/fotos-supabase-lote?ids=...` no servidor busca do Supabase REST API server-side e retorna base64 pronto.
- `buscarFotosOcorrencias` em `src/api.ts` tenta esse endpoint primeiro (sem CORS), com fallback para Supabase direto e depois PostgreSQL local.
- Proxy de imagens também disponível em `/api/proxy-imagem?url=...` para URLs do Supabase Storage.

## Atualizações do Radar em hospedagem serverless
- O Radar mantém polling periódico como fallback para hospedagens sem WebSocket persistente, enquanto Supabase Realtime/WS permanece como caminho instantâneo quando disponível.

**Why:** Netlify Functions não mantém uma conexão WebSocket de longa duração; depender apenas do WS faz mudanças e convocações parecerem congeladas.

**How to apply:** Ao alterar eventos do Radar, preserve uma rota de revalidação periódica e teste a sincronização entre duas sessões publicadas.

## Radar — fontes opcionais no Supabase
- A tabela `checklists_ferramental` pode não existir no Supabase compartilhado, enquanto `ocorrencias` e `checklists_viatura` existem.
- Filtros de datas operacionais devem considerar que `data_ocorrencia` e `data_checklist` são salvos como `YYYY-MM-DD`.

**Why:** Uma consulta opcional com erro não pode impedir que as fontes principais do Radar sejam exibidas; comparar datas com horário exclui valores armazenados apenas como data.

**How to apply:** Ao adicionar fontes ao Radar, trate tabelas opcionais separadamente e use igualdade/prefixo compatível com o tipo real persistido.

## Confirmações do Radar
- Operações de confirmação devem identificar onde o registro do Radar realmente existe antes de atualizar: Supabase compartilhado quando usado pelo frontend, com fallback ao PostgreSQL local.

**Why:** O ambiente pode servir leituras e gravações do Radar por armazenamentos diferentes conforme as variáveis disponíveis; escolher um único banco pode retornar sucesso sem atualizar a fila exibida aos agentes.

**How to apply:** Ao alterar mutações ou notificações do Radar, preserve a coerência entre criação, confirmação, polling, WebSocket e push nos dois caminhos de persistência.

## Importação de layout do Radar DC
- Ao trazer a interface do Radar de outro projeto, mantenha a conexão Supabase e os fluxos de dados deste app; não substitua a origem das ocorrências, checklists ou lembretes.

**Why:** O usuário pediu que interfaces importadas preservem os dados e as relações já existentes neste app.

**How to apply:** Reutilize os clientes e adaptadores locais; confirme o nome e o formato de cada tabela antes de integrar consultas ou gravações do projeto de origem.
