-- ─────────────────────────────────────────────────────────────────────────────
-- Defesa Civil de Ouro Branco — Schema Supabase
--
-- COMO USAR:
--   1. Entre em https://supabase.com/dashboard → seu projeto
--   2. Menu lateral: SQL Editor → New query
--   3. Cole TODO o conteúdo deste arquivo e clique em "Run"
--   4. Pronto. O app já está pronto para usar.
-- ─────────────────────────────────────────────────────────────────────────────

-- Tabela de alertas SOS ativos.
-- Guarda os SOS disparados pelos agentes para que outros agentes que abrirem
-- o app DEPOIS do disparo também consigam ver o alerta (por até 10 min).
create table if not exists public.sos_alertas (
  id          text primary key,
  agente      text        not null,
  lat         double precision,
  lng         double precision,
  bateria     integer,
  audio       text,
  created_at  timestamptz not null default now()
);

create index if not exists sos_alertas_created_at_idx
  on public.sos_alertas (created_at desc);

-- Habilita Row Level Security
alter table public.sos_alertas enable row level security;

-- Como a autenticação do app é feita no frontend (login fixo da Defesa Civil),
-- liberamos todas as operações para a chave anônima neste único cenário.
drop policy if exists "anon_select_sos" on public.sos_alertas;
drop policy if exists "anon_insert_sos" on public.sos_alertas;
drop policy if exists "anon_update_sos" on public.sos_alertas;
drop policy if exists "anon_delete_sos" on public.sos_alertas;

create policy "anon_select_sos" on public.sos_alertas
  for select to anon using (true);
create policy "anon_insert_sos" on public.sos_alertas
  for insert to anon with check (true);
create policy "anon_update_sos" on public.sos_alertas
  for update to anon using (true) with check (true);
create policy "anon_delete_sos" on public.sos_alertas
  for delete to anon using (true);
