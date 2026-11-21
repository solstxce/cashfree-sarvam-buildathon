-- Read-only diagnostics: run in the same Supabase project used by localhost.
-- Shows the current refresh definition, downstream queue triggers, and every
-- public stored function containing DELETE. Does not run any of these functions.

SELECT pg_get_functiondef('public.refresh_borrower_call_queue()'::regprocedure)
    AS current_queue_refresh_definition;

SELECT n.nspname AS table_schema, c.relname AS table_name,
       t.tgname AS trigger_name,
       pg_get_triggerdef(t.oid) AS trigger_definition,
       p.oid::regprocedure::text AS function_name,
       pg_get_functiondef(p.oid) AS function_definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal
  AND n.nspname = 'public'
  AND c.relname IN ('customers', 'agent', 'borrower_call_queue')
ORDER BY c.relname, t.tgname;

SELECT p.oid::regprocedure::text AS function_name,
       pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND p.prosrc ~* 'delete[[:space:]]+from'
ORDER BY p.oid::regprocedure::text;
