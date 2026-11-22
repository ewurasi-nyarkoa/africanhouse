
BEGIN;

-- =========================================================
-- 1. PREFLIGHT: VERIFY EXISTING TABLES AND DATA
-- =========================================================

DO $$
DECLARE
  v_status_type text;
  v_source_type text;
  v_token_type text;
BEGIN
  IF to_regclass('public.subscribers') IS NULL
     OR to_regclass('public.email_campaigns') IS NULL THEN
    RAISE EXCEPTION
      'Expected public.subscribers and public.email_campaigns tables';
  END IF;

  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION
      'Expected public.is_admin(); verify its implementation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.subscribers
    WHERE email IS NOT NULL
      AND btrim(email) = ''
  ) THEN
    RAISE EXCEPTION
      'Blank subscriber email addresses exist; reconcile them first';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.subscribers
    WHERE email IS NOT NULL
    GROUP BY lower(btrim(email))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate case-insensitive subscriber emails exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.subscribers
    WHERE unsubscribe_token IS NULL
  ) THEN
    RAISE EXCEPTION
      'Subscriber records have missing unsubscribe tokens';
  END IF;

  IF EXISTS (
    SELECT unsubscribe_token
    FROM public.subscribers
    GROUP BY unsubscribe_token
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate unsubscribe tokens exist';
  END IF;

  SELECT format_type(a.atttypid, a.atttypmod)
  INTO v_status_type
  FROM pg_attribute a
  WHERE a.attrelid = 'public.subscribers'::regclass
    AND a.attname = 'status'
    AND NOT a.attisdropped;

  SELECT format_type(a.atttypid, a.atttypmod)
  INTO v_source_type
  FROM pg_attribute a
  WHERE a.attrelid = 'public.subscribers'::regclass
    AND a.attname = 'source'
    AND NOT a.attisdropped;

  SELECT format_type(a.atttypid, a.atttypmod)
  INTO v_token_type
  FROM pg_attribute a
  WHERE a.attrelid = 'public.subscribers'::regclass
    AND a.attname = 'unsubscribe_token'
    AND NOT a.attisdropped;

  IF v_status_type NOT IN ('text', 'character varying')
     OR v_source_type NOT IN ('text', 'character varying') THEN
    RAISE EXCEPTION
      'Unexpected subscriber status/source types: % / %',
      v_status_type, v_source_type;
  END IF;

  IF v_token_type <> 'uuid' THEN
    RAISE EXCEPTION
      'Expected unsubscribe_token to remain UUID, found %',
      v_token_type;
  END IF;
END $$;


-- =========================================================
-- 2. ADD MARKETING CONSENT FIELDS
-- =========================================================

ALTER TABLE public.subscribers
  ADD COLUMN IF NOT EXISTS marketing_consent
    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_consent_at
    timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_consent_source
    text,
  ADD COLUMN IF NOT EXISTS marketing_consent_version
    text,
  ADD COLUMN IF NOT EXISTS marketing_consent_text
    text;


-- Existing subscribers receive marketing_consent = false.
-- No historical consent is assumed or invented.


-- =========================================================
-- 3. ADD DATA INTEGRITY CONSTRAINTS AND INDEXES
-- =========================================================

CREATE UNIQUE INDEX IF NOT EXISTS subscribers_unsubscribe_token_uidx
  ON public.subscribers (unsubscribe_token);

CREATE UNIQUE INDEX IF NOT EXISTS subscribers_email_lower_uidx
  ON public.subscribers (lower(btrim(email)))
  WHERE email IS NOT NULL;

ALTER TABLE public.subscribers
  DROP CONSTRAINT IF EXISTS subscribers_marketing_consent_evidence_check;

ALTER TABLE public.subscribers
  ADD CONSTRAINT subscribers_marketing_consent_evidence_check
  CHECK (
    marketing_consent IS NOT TRUE
    OR (
      marketing_consent_at IS NOT NULL
      AND marketing_consent_source IS NOT NULL
      AND marketing_consent_version IS NOT NULL
      AND marketing_consent_text IS NOT NULL
    )
  );


-- =========================================================
-- 4. SECURE NEWSLETTER SUBSCRIPTION FUNCTION
-- =========================================================

CREATE OR REPLACE FUNCTION public.subscribe_to_marketing(
  p_email text,
  p_source text,
  p_consent_version text,
  p_consent_text text
)
RETURNS TABLE (
  subscriber_id text,
  send_welcome boolean,
  token text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text;
  v_id public.subscribers.id%TYPE;
  v_status text;
  v_consent boolean;
  v_token uuid;
  v_found boolean;
BEGIN
  v_email := lower(btrim(p_email));

  IF v_email IS NULL
     OR length(v_email) > 254
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR p_source IS DISTINCT FROM 'homepage'
     OR p_consent_version IS NULL
     OR length(btrim(p_consent_version)) = 0
     OR length(p_consent_version) > 100
     OR p_consent_text IS NULL
     OR length(btrim(p_consent_text)) = 0
     OR length(p_consent_text) > 2000 THEN
    RAISE EXCEPTION
      'Valid email, homepage source and consent evidence are required';
  END IF;

  -- Serialize simultaneous subscriptions for the same email.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_email, 0)
  );

  SELECT
    s.id,
    s.status,
    s.marketing_consent,
    s.unsubscribe_token
  INTO
    v_id,
    v_status,
    v_consent,
    v_token
  FROM public.subscribers s
  WHERE lower(btrim(s.email)) = v_email
  FOR UPDATE;

  v_found := FOUND;

  -- Already subscribed with recorded consent.
  IF v_found
     AND v_status = 'active'
     AND v_consent IS TRUE THEN

    RETURN QUERY
      SELECT v_id::text, false, v_token::text;

    RETURN;
  END IF;

  -- Existing subscriber is resubscribing or giving consent
  -- for the first time.
  IF v_found THEN

    UPDATE public.subscribers
    SET
      email = v_email,
      status = 'active',
      marketing_consent = true,
      marketing_consent_at = now(),
      marketing_consent_source = p_source,
      marketing_consent_version = p_consent_version,
      marketing_consent_text = p_consent_text,
      unsubscribe_token = gen_random_uuid(),
      unsubscribed_at = NULL
    WHERE id = v_id
    RETURNING unsubscribe_token INTO v_token;

    RETURN QUERY
      SELECT v_id::text, true, v_token::text;

    RETURN;
  END IF;

  -- New subscriber.
  INSERT INTO public.subscribers (
    email,
    status,
    source,
    marketing_consent,
    marketing_consent_at,
    marketing_consent_source,
    marketing_consent_version,
    marketing_consent_text
  )
  VALUES (
    v_email,
    'active',
    p_source,
    true,
    now(),
    p_source,
    p_consent_version,
    p_consent_text
  )
  RETURNING id, unsubscribe_token
  INTO v_id, v_token;

  RETURN QUERY
    SELECT v_id::text, true, v_token::text;
END;
$$;


-- =========================================================
-- 5. PRESERVE THE EXISTING UUID UNSUBSCRIBE FUNCTION
-- =========================================================

CREATE OR REPLACE FUNCTION public.unsubscribe_by_token(
  p_token uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  IF p_token IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'message', 'invalid token'
    );
  END IF;

  UPDATE public.subscribers
  SET
    status = 'unsubscribed',
    marketing_consent = false,
    unsubscribed_at = now()
  WHERE unsubscribe_token = p_token
    AND status = 'active';

  IF FOUND THEN
    RETURN json_build_object('success', true);
  END IF;

  SELECT status
  INTO v_status
  FROM public.subscribers
  WHERE unsubscribe_token = p_token;

  IF v_status = 'unsubscribed' THEN
    RETURN json_build_object(
      'success', false,
      'message', 'already unsubscribed'
    );
  END IF;

  RETURN json_build_object(
    'success', false,
    'message', 'invalid token'
  );
END;
$$;


-- =========================================================
-- 6. FUNCTION PERMISSIONS
-- =========================================================

REVOKE ALL ON FUNCTION
  public.subscribe_to_marketing(text, text, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.subscribe_to_marketing(text, text, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION
  public.unsubscribe_by_token(uuid)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  public.unsubscribe_by_token(uuid)
  TO anon, authenticated, service_role;


-- =========================================================
-- 7. SECURE SUBSCRIBER AND CAMPAIGN TABLES
-- =========================================================

ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

-- Remove public and anonymous table privileges.
REVOKE ALL ON public.subscribers
  FROM PUBLIC, anon;

REVOKE ALL ON public.email_campaigns
  FROM PUBLIC, anon;

-- Trusted server-side functions retain full access.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.subscribers, public.email_campaigns
  TO service_role;

-- Authenticated users receive table privileges,
-- but RLS will restrict access to administrators.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.subscribers, public.email_campaigns
  TO authenticated;


-- =========================================================
-- 8. REMOVE OLD BROAD POLICIES
-- =========================================================

DROP POLICY IF EXISTS "public insert"
  ON public.subscribers;

DROP POLICY IF EXISTS subscribers_admin_access
  ON public.subscribers;

DROP POLICY IF EXISTS subscribers_admin_fence
  ON public.subscribers;

DROP POLICY IF EXISTS campaigns_authenticated_all
  ON public.email_campaigns;

DROP POLICY IF EXISTS email_campaigns_admin_access
  ON public.email_campaigns;

DROP POLICY IF EXISTS email_campaigns_admin_fence
  ON public.email_campaigns;


-- =========================================================
-- 9. ADMIN-ONLY SUBSCRIBER POLICIES
-- =========================================================

CREATE POLICY subscribers_admin_access
  ON public.subscribers
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY subscribers_admin_fence
  ON public.subscribers
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- =========================================================
-- 10. ADMIN-ONLY CAMPAIGN POLICIES
-- =========================================================

CREATE POLICY email_campaigns_admin_access
  ON public.email_campaigns
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY email_campaigns_admin_fence
  ON public.email_campaigns
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


COMMIT;
