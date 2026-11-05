-- Execute no SQL Editor do projeto Supabase usado pelo app.
-- A coluna é aditiva e não altera os registros existentes.
ALTER TABLE public.ocorrencias
  ADD COLUMN IF NOT EXISTS telefone TEXT;

-- Atualiza o cache de esquema usado pela API REST do Supabase.
NOTIFY pgrst, 'reload schema';
