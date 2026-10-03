-- Enable Row Level Security on all base tables in the public schema.
-- RLS is not represented in the Prisma schema, so this is a manual migration
-- with no corresponding schema.prisma change (no drift).
--
-- Note: the application connects as the table owner (postgres), which bypasses
-- RLS, so app access is unaffected. With no policies defined, the Supabase API
-- roles (anon/authenticated) are denied by default. Add explicit policies if a
-- table is ever exposed through PostgREST.

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
