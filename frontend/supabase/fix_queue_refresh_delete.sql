-- Fix borrower INSERT failures caused by the queue refresh's unqualified DELETE.
-- Run once in Supabase SQL Editor as the database administrator.
-- Only the function definition is changed; this script does not execute it.
BEGIN;

DO $patch$
DECLARE
    definition text;
    unsafe_statement constant text := 'DELETE FROM public.borrower_call_queue;';
    safe_statement constant text := 'DELETE FROM public.borrower_call_queue WHERE TRUE;';
BEGIN
    definition := pg_get_functiondef('public.refresh_borrower_call_queue()'::regprocedure);

    IF strpos(definition, safe_statement) > 0 AND strpos(definition, unsafe_statement) = 0 THEN
        RAISE NOTICE 'Queue refresh is already patched.';
    ELSIF strpos(definition, unsafe_statement) > 0 THEN
        -- Preserve the deployed function, including locking, ranking and call limits.
        EXECUTE replace(definition, unsafe_statement, safe_statement);
    ELSE
        RAISE EXCEPTION 'Queue refresh definition differs from the reviewed version. No changes made.';
    END IF;
END;
$patch$;

COMMIT;

-- Verify the updated definition without rebuilding or changing queue records.
SELECT strpos(
    pg_get_functiondef('public.refresh_borrower_call_queue()'::regprocedure),
    'DELETE FROM public.borrower_call_queue WHERE TRUE;'
) > 0 AS queue_delete_fixed;
