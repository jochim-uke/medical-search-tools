-- Integration assertions run in one rolled-back transaction.
-- The synthetic admin token exists only inside this DO block and is never returned.
BEGIN;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

DO $test$
DECLARE
  test_token text := encode(sha256(convert_to(gen_random_uuid()::text || clock_timestamp()::text,'UTF8')),'hex');
  before_row jsonb;
  after_row jsonb;
  saved jsonb;
  initial_version integer;
  test_number integer;
BEGIN
  SELECT to_jsonb(a) INTO STRICT before_row
  FROM public.ash2026_abstracts a WHERE number=706 FOR UPDATE;
  initial_version := (before_row->>'collections_version')::integer;

  INSERT INTO public.ua_sessions(token_hash,expires_at)
  VALUES (encode(sha256(convert_to(test_token,'UTF8')),'hex'),now()+interval '30 seconds');

  saved := public.ash2026_set_collection(
    test_token,706,'moderne-car-t-konstrukte',true,initial_version
  );
  IF saved->'collections' IS DISTINCT FROM '["moderne-car-t-konstrukte"]'::jsonb
    OR (saved->>'collections_version')::integer <> initial_version+1
    OR (saved->>'number')::integer <> 706
  THEN
    RAISE EXCEPTION 'Collection enable assertion failed';
  END IF;

  BEGIN
    PERFORM public.ash2026_set_collection(
      test_token,706,'moderne-car-t-konstrukte',false,initial_version
    );
    RAISE EXCEPTION 'Stale version was unexpectedly accepted';
  EXCEPTION WHEN serialization_failure THEN
    NULL;
  END;

  BEGIN
    PERFORM public.ash2026_set_collection(
      test_token,706,'invalid-collection',false,initial_version+1
    );
    RAISE EXCEPTION 'Unknown collection slug was unexpectedly accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  saved := public.ash2026_set_collection(
    test_token,706,'moderne-car-t-konstrukte',false,initial_version+1
  );
  IF saved->'collections' IS DISTINCT FROM '[]'::jsonb
    OR (saved->>'collections_version')::integer <> initial_version+2
  THEN
    RAISE EXCEPTION 'Collection disable assertion failed';
  END IF;

  SELECT to_jsonb(a) INTO STRICT after_row
  FROM public.ash2026_abstracts a WHERE number=706;
  IF (after_row - 'collections' - 'collections_version')
    IS DISTINCT FROM (before_row - 'collections' - 'collections_version')
  THEN
    RAISE EXCEPTION 'Collection toggle changed unrelated fields';
  END IF;

  SELECT candidate INTO test_number
  FROM generate_series(99999,99990,-1) candidate
  WHERE NOT EXISTS (SELECT 1 FROM public.ash2026_abstracts WHERE number=candidate)
  ORDER BY candidate DESC LIMIT 1;
  IF test_number IS NULL THEN
    RAISE EXCEPTION 'No unused abstract number for rolled-back add test';
  END IF;

  PERFORM public.ash2026_add(test_token,jsonb_build_object(
    'number',test_number,
    'title','Rollback-only collection integration test',
    'diseases',jsonb_build_array('Test'),
    'methods',jsonb_build_array('Test'),
    'summary','This row exists only inside a rolled-back integration transaction.',
    'source','https://example.org/rollback-only',
    'collections',jsonb_build_array('moderne-car-t-konstrukte')
  ));
  IF NOT EXISTS (
    SELECT 1 FROM public.ash2026_abstracts
    WHERE number=test_number
      AND collections=ARRAY['moderne-car-t-konstrukte']::text[]
      AND collections_version=0
  ) THEN
    RAISE EXCEPTION 'Add abstract collection assertion failed';
  END IF;
END;
$test$;

ROLLBACK;

SELECT jsonb_build_object(
  'passed',true,
  'assertions',ARRAY[
    'enable persists collection and increments version',
    'disable clears collection and increments version',
    'stale expected_version rejected with 40001',
    'invalid collection slug rejected with 22023',
    'unrelated abstract fields unchanged',
    'add_abstract accepts collections'
  ],
  'transaction','rolled back; no synthetic session or abstract retained'
) AS collection_integration_test;

