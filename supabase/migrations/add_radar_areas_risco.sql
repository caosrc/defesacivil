-- Áreas de risco e limites de precipitação monitorados pelo Radar DC.
CREATE TABLE IF NOT EXISTS public.radar_areas_risco (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('alagamento', 'deslizamento', 'incendio', 'outro')),
  icone TEXT NOT NULL CHECK (icone IN ('water', 'landslide', 'fire', 'other')),
  poligono JSONB NOT NULL,
  limite_mm NUMERIC NOT NULL CHECK (limite_mm >= 0),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.radar_areas_risco ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "radar areas risco aberto" ON public.radar_areas_risco;
CREATE POLICY "radar areas risco aberto"
  ON public.radar_areas_risco
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS radar_areas_risco_ativo_idx
  ON public.radar_areas_risco (ativo);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'radar_areas_risco'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.radar_areas_risco;
  END IF;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;
