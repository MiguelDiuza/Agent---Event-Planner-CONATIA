-- pgTAP: arnés de pruebas de base de datos. Lo usa `supabase test db` para
-- correr los archivos de supabase/tests/. Se instala en el esquema
-- extensions para no ensuciar public.
create extension if not exists pgtap with schema extensions;
