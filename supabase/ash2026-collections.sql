-- Manual ASH collection; existing diseases, methods, content and priorities are untouched.
ALTER TABLE public.ash2026_abstracts
  ADD COLUMN IF NOT EXISTS collections text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS collections_version integer NOT NULL DEFAULT 0;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.ash2026_abstracts'::regclass
      AND conname = 'ash2026_collections_valid'
  ) THEN
    ALTER TABLE public.ash2026_abstracts
      ADD CONSTRAINT ash2026_collections_valid CHECK (
        collections <@ ARRAY['moderne-car-t-konstrukte']::text[]
        AND cardinality(collections) <= 1
        AND array_position(collections, NULL) IS NULL
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.ash2026_abstracts'::regclass
      AND conname = 'ash2026_collections_version_valid'
  ) THEN
    ALTER TABLE public.ash2026_abstracts
      ADD CONSTRAINT ash2026_collections_version_valid CHECK (collections_version >= 0);
  END IF;
END;
$migration$;

COMMENT ON COLUMN public.ash2026_abstracts.collections IS
  'Manuell gepflegte Sammlung, unabhängig von Erkrankungen und Methoden. moderne-car-t-konstrukte = Moderne CAR T konstrukte.';

CREATE OR REPLACE FUNCTION ash2026_private.add_abstract(session_token text, entry jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF session_token IS NULL OR session_token !~ '^[a-f0-9]{64}$' OR NOT EXISTS (
    SELECT 1 FROM public.ua_sessions
    WHERE token_hash = encode(sha256(convert_to(session_token,'UTF8')),'hex')
      AND expires_at > now()
  ) THEN
    RAISE insufficient_privilege USING MESSAGE = 'Bitte erneut als Archiv-Admin anmelden.';
  END IF;
  INSERT INTO public.ash2026_abstracts(number,title,diseases,methods,summary,source,collections)
    SELECT a.number,trim(a.title),a.diseases,a.methods,trim(a.summary),trim(a.source),
           coalesce(a.collections,'{}'::text[])
    FROM jsonb_to_record(entry) AS a(
      number integer,title text,diseases text[],methods text[],
      summary text,source text,collections text[]
    );
END;
$function$;

CREATE OR REPLACE FUNCTION ash2026_private.set_collection(
  session_token text,
  abstract_number integer,
  collection_slug text,
  included boolean,
  expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  saved jsonb;
BEGIN
  IF session_token IS NULL OR session_token !~ '^[a-f0-9]{64}$' OR NOT EXISTS (
    SELECT 1 FROM public.ua_sessions
    WHERE token_hash = encode(sha256(convert_to(session_token,'UTF8')),'hex')
      AND expires_at > now()
  ) THEN
    RAISE insufficient_privilege USING MESSAGE = 'Bitte erneut als Archiv-Admin anmelden.';
  END IF;
  IF collection_slug IS DISTINCT FROM 'moderne-car-t-konstrukte'
    OR included IS NULL
    OR abstract_number IS NULL OR abstract_number NOT BETWEEN 1 AND 99999
    OR expected_version IS NULL OR expected_version < 0
  THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Ungültige Sammlung oder Versionsnummer.';
  END IF;
  UPDATE public.ash2026_abstracts
  SET collections = CASE WHEN included THEN ARRAY[collection_slug]::text[] ELSE '{}'::text[] END,
      collections_version = collections_version + 1
  WHERE number = abstract_number AND collections_version = expected_version
  RETURNING jsonb_build_object(
    'number',number,'collections',collections,'collections_version',collections_version
  ) INTO saved;
  IF saved IS NULL THEN
    RAISE serialization_failure USING MESSAGE =
      'Der Beitrag wurde zwischenzeitlich geändert. Bitte Ansicht aktualisieren.';
  END IF;
  RETURN saved;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ash2026_set_collection(
  session_token text,
  abstract_number integer,
  collection_slug text,
  included boolean,
  expected_version integer
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT ash2026_private.set_collection(
    session_token,abstract_number,collection_slug,included,expected_version
  );
$function$;

-- Match the existing archive's custom admin-session authentication.
-- A public API role can invoke the wrapper, but a valid, unexpired archive
-- admin token is required before either private function can write.
REVOKE ALL ON FUNCTION ash2026_private.set_collection(text,integer,text,boolean,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ash2026_set_collection(text,integer,text,boolean,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ash2026_private.set_collection(text,integer,text,boolean,integer) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ash2026_set_collection(text,integer,text,boolean,integer) TO anon,authenticated;

NOTIFY pgrst, 'reload schema';

