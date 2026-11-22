BEGIN;

-- AfriLoom Fabrics - Migration 003
-- Order-processing claims, transactional email idempotency,
-- inventory deduction ledger, and Resend webhook processing.
-- Requires Migration 002 to have completed successfully.

DO $$
DECLARE
  v_deduct_count integer;
  v_deduct_result text;
  v_order_id_type text;
BEGIN
  IF to_regclass('public.orders') IS NULL
     OR to_regclass('public.email_deliveries') IS NULL THEN
    RAISE EXCEPTION 'Apply the earlier guarded email migrations after verifying the orders schema';
  END IF;

  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Expected Supabase Auth auth.users; inspect the Auth schema before applying this migration';
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'id'
     )
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'paystack_reference'
     )
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'status'
     )
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'items'
     )
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'total_amount'
     )
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'location'
     ) THEN
    RAISE EXCEPTION 'The orders table does not match process-order; inspect the schema before applying this migration';
  END IF;

  SELECT count(*)::integer, min(pg_get_function_result(p.oid))
    INTO v_deduct_count, v_deduct_result
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'deduct_inventory'
    AND p.pronargs = 2;

  IF v_deduct_count <> 1 OR v_deduct_result NOT IN ('json', 'jsonb') THEN
    RAISE EXCEPTION 'Expected exactly one public.deduct_inventory function with two arguments and json/jsonb result; inspect its implementation before applying this migration';
  END IF;

  SELECT format_type(a.atttypid, a.atttypmod)
    INTO v_order_id_type
  FROM pg_attribute a
  WHERE a.attrelid = 'public.orders'::regclass
    AND a.attname = 'id'
    AND NOT a.attisdropped;

  IF v_order_id_type NOT IN ('smallint', 'integer', 'bigint') THEN
    RAISE EXCEPTION 'orders.id is %, but current order tracking/template code expects an integer ID', v_order_id_type;
  END IF;
END;
$$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_email text;

-- Prevent sending account-welcome emails retroactively to existing accounts.
INSERT INTO public.email_deliveries (
  delivery_kind,
  idempotency_key,
  source_id,
  recipient_email,
  status,
  attempt_count,
  last_error
)
SELECT
  'account_welcome',
  'account-welcome:' || u.id::text,
  u.id::text,
  u.email,
  'skipped',
  3,
  'Account existed before welcome-email deduplication rollout'
FROM auth.users AS u
WHERE u.email IS NOT NULL
ON CONFLICT (idempotency_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.order_processing_claims (
  paystack_reference text PRIMARY KEY,
  claim_token uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  lease_expires_at timestamptz,
  order_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_inventory_deductions (
  paystack_reference text NOT NULL,
  fabric_id bigint NOT NULL,
  yards numeric NOT NULL CHECK (yards > 0),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (paystack_reference, fabric_id)
);

CREATE TABLE IF NOT EXISTS public.resend_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

-- Claim a transactional email once per idempotency key.
-- The same key cannot be reused for a different kind, source, or recipient.
CREATE OR REPLACE FUNCTION public.claim_transactional_email(
  p_delivery_kind text,
  p_idempotency_key text,
  p_source_id text,
  p_recipient_email text,
  p_lease_seconds integer DEFAULT 180
)
RETURNS TABLE (
  claimed boolean,
  delivery_id bigint,
  lease_token uuid,
  attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id bigint;
  v_token uuid;
  v_attempts integer;
  v_kind text;
  v_source_id text;
  v_email text;
BEGIN
  IF p_delivery_kind IS NULL
     OR p_delivery_kind NOT IN ('newsletter_welcome', 'account_welcome', 'order_confirmation') THEN
    RAISE EXCEPTION 'Unsupported transactional delivery kind';
  END IF;

  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0
     OR p_recipient_email IS NULL OR length(trim(p_recipient_email)) = 0 THEN
    RAISE EXCEPTION 'An idempotency key and recipient email are required';
  END IF;

  INSERT INTO public.email_deliveries (
    delivery_kind, idempotency_key, source_id, recipient_email
  )
  VALUES (
    p_delivery_kind, p_idempotency_key, p_source_id, lower(trim(p_recipient_email))
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  SELECT d.id, d.delivery_kind, d.source_id, d.recipient_email
    INTO v_id, v_kind, v_source_id, v_email
  FROM public.email_deliveries d
  WHERE d.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Could not locate transactional email delivery after insert';
  END IF;

  IF v_kind IS DISTINCT FROM p_delivery_kind
     OR v_source_id IS DISTINCT FROM p_source_id
     OR lower(trim(v_email)) IS DISTINCT FROM lower(trim(p_recipient_email)) THEN
    RAISE EXCEPTION 'Idempotency key is already associated with different delivery details';
  END IF;

  UPDATE public.email_deliveries d
  SET status = 'sending',
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 600))),
      attempt_count = d.attempt_count + 1,
      updated_at = now()
  WHERE d.id = v_id
    AND d.attempt_count < 3
    AND (
      d.status = 'pending'
      OR (d.status = 'failed' AND d.attempt_count < 3)
      OR (d.status = 'sending' AND d.lease_expires_at < now() AND d.attempt_count < 3)
    )
  RETURNING d.id, d.lease_token, d.attempt_count
    INTO v_id, v_token, v_attempts;

  IF v_token IS NULL THEN
    RETURN QUERY SELECT false, NULL::bigint, NULL::uuid, 0;
  ELSE
    RETURN QUERY SELECT true, v_id, v_token, v_attempts;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_order_processing(
  p_paystack_reference text,
  p_lease_seconds integer DEFAULT 600
)
RETURNS TABLE (claimed boolean, claim_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token uuid;
BEGIN
  IF p_paystack_reference IS NULL OR length(trim(p_paystack_reference)) = 0 THEN
    RAISE EXCEPTION 'Paystack reference is required';
  END IF;

  INSERT INTO public.order_processing_claims (
    paystack_reference, claim_token, status, lease_expires_at
  )
  VALUES (
    p_paystack_reference,
    gen_random_uuid(),
    'processing',
    now() + make_interval(secs => greatest(60, least(p_lease_seconds, 1800)))
  )
  ON CONFLICT (paystack_reference) DO UPDATE
    SET claim_token = gen_random_uuid(),
        status = 'processing',
        lease_expires_at = now() + make_interval(secs => greatest(60, least(p_lease_seconds, 1800))),
        last_error = NULL,
        updated_at = now()
    WHERE order_processing_claims.status = 'failed'
       OR (
         order_processing_claims.status = 'processing'
         AND order_processing_claims.lease_expires_at < now()
       )
  RETURNING order_processing_claims.claim_token INTO v_token;

  RETURN QUERY SELECT v_token IS NOT NULL, v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_order_processing(
  p_paystack_reference text,
  p_claim_token uuid,
  p_order_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.order_processing_claims
  SET status = 'completed',
      order_id = p_order_id,
      lease_expires_at = NULL,
      last_error = NULL,
      updated_at = now()
  WHERE paystack_reference = p_paystack_reference
    AND claim_token = p_claim_token
    AND status = 'processing';

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_order_processing(
  p_paystack_reference text,
  p_claim_token uuid,
  p_error text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.order_processing_claims
  SET status = 'failed',
      lease_expires_at = NULL,
      last_error = left(COALESCE(p_error, 'Order processing failed'), 1000),
      updated_at = now()
  WHERE paystack_reference = p_paystack_reference
    AND claim_token = p_claim_token
    AND status = 'processing';

  RETURN FOUND;
END;
$$;

-- Idempotent single-fabric deduction. This preserves the existing
-- public.deduct_inventory(bigint, integer) implementation unchanged.
CREATE OR REPLACE FUNCTION public.deduct_inventory_once(
  p_paystack_reference text,
  p_fabric_id bigint,
  p_yards numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_yards numeric;
  v_result jsonb;
  v_arg1 regtype;
  v_arg2 regtype;
BEGIN
  IF p_paystack_reference IS NULL OR length(trim(p_paystack_reference)) = 0
     OR p_fabric_id IS NULL
     OR p_yards IS NULL
     OR p_yards <= 0
     OR p_yards <> trunc(p_yards)
     OR p_yards > 2147483647 THEN
    RAISE EXCEPTION 'Invalid payment reference, fabric ID, or yard quantity';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_paystack_reference || ':' || p_fabric_id::text, 0)
  );

  SELECT yards
    INTO v_yards
  FROM public.order_inventory_deductions
  WHERE paystack_reference = p_paystack_reference
    AND fabric_id = p_fabric_id;

  IF FOUND THEN
    IF v_yards <> p_yards THEN
      RAISE EXCEPTION 'Payment reference was retried with a different fabric quantity';
    END IF;

    RETURN jsonb_build_object('success', true, 'already_deducted', true);
  END IF;

  SELECT p.proargtypes[0]::regtype, p.proargtypes[1]::regtype
    INTO v_arg1, v_arg2
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'deduct_inventory'
    AND p.pronargs = 2
  ORDER BY p.oid
  LIMIT 1;

  IF v_arg1 IS NULL OR v_arg2 IS NULL THEN
    RAISE EXCEPTION 'The expected public.deduct_inventory function was not found';
  END IF;

  EXECUTE format(
    'SELECT public.deduct_inventory($1::%s, $2::%s)::jsonb',
    v_arg1,
    v_arg2
  )
  INTO v_result
  USING p_fabric_id, p_yards::integer;

  IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE THEN
    RETURN COALESCE(
      v_result,
      jsonb_build_object('success', false, 'message', 'Inventory deduction failed')
    );
  END IF;

  INSERT INTO public.order_inventory_deductions (
    paystack_reference, fabric_id, yards
  )
  VALUES (p_paystack_reference, p_fabric_id, p_yards);

  RETURN v_result;
END;
$$;

-- Atomic multi-fabric deduction. Update process-order to call this once
-- with the complete cart array; do not call the single-item RPC repeatedly
-- if all-or-nothing inventory deduction is required.
CREATE OR REPLACE FUNCTION public.deduct_inventory_batch_once(
  p_paystack_reference text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF p_paystack_reference IS NULL
     OR length(trim(p_paystack_reference)) = 0
     OR p_items IS NULL
     OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A payment reference and non-empty items array are required';
  END IF;

  FOR v_item IN
    SELECT x.fabric_id, sum(x.yards)::numeric AS yards
    FROM jsonb_to_recordset(p_items) AS x(fabric_id bigint, yards numeric)
    GROUP BY x.fabric_id
    ORDER BY x.fabric_id
  LOOP
    IF v_item.fabric_id IS NULL
       OR v_item.yards IS NULL
       OR v_item.yards <= 0
       OR v_item.yards <> trunc(v_item.yards)
       OR v_item.yards > 2147483647 THEN
      RAISE EXCEPTION 'Invalid fabric ID or yard quantity in batch';
    END IF;

    v_result := public.deduct_inventory_once(
      p_paystack_reference,
      v_item.fabric_id,
      v_item.yards
    );

    IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Inventory deduction failed for fabric %: %',
        v_item.fabric_id,
        COALESCE(v_result ->> 'message', 'Unknown inventory error');
    END IF;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'fabric_id', v_item.fabric_id,
        'yards', v_item.yards,
        'result', v_result
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'already_or_newly_deducted', v_results
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_email_campaign_stats_from_webhook(
  p_campaign_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total integer;
  v_attempted integer;
  v_sent integer;
  v_delivered integer;
  v_failed integer;
  v_pending integer;
  v_skipped integer;
  v_status text;
BEGIN
  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE attempt_count > 0)::integer,
    count(*) FILTER (WHERE sent_at IS NOT NULL)::integer,
    count(*) FILTER (WHERE status = 'delivered')::integer,
    count(*) FILTER (WHERE status IN ('failed', 'bounced'))::integer,
    count(*) FILTER (WHERE status IN ('pending', 'sending'))::integer,
    count(*) FILTER (WHERE status = 'skipped')::integer
  INTO
    v_total, v_attempted, v_sent, v_delivered,
    v_failed, v_pending, v_skipped
  FROM public.email_deliveries
  WHERE delivery_kind = 'campaign'
    AND campaign_id = p_campaign_id;

  IF v_pending > 0 THEN
    v_status := 'sending';
  ELSIF v_total = 0 OR v_sent = 0 THEN
    v_status := 'failed';
  ELSIF v_failed > 0 THEN
    v_status := 'partially_failed';
  ELSE
    v_status := 'sent';
  END IF;

  UPDATE public.email_campaigns
  SET total_eligible = v_total,
      attempted_count = v_attempted,
      sent_count = v_sent,
      delivered_count = v_delivered,
      failed_count = v_failed,
      pending_count = v_pending,
      skipped_count = v_skipped,
      recipient_count = v_sent,
      status = v_status
  WHERE id::text = p_campaign_id;
END;
$$;

-- Only record a webhook event after its Resend message ID has a matching
-- delivery row. An unmatched event can therefore be retried/reconciled later.
CREATE OR REPLACE FUNCTION public.record_resend_email_event(
  p_event_id text,
  p_event_type text,
  p_message_id text,
  p_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_campaign_id text;
BEGIN
  IF p_event_id IS NULL OR length(trim(p_event_id)) = 0
     OR p_message_id IS NULL OR length(trim(p_message_id)) = 0
     OR p_event_type IS NULL
     OR p_event_type NOT IN ('email.delivered', 'email.bounced') THEN
    RETURN false;
  END IF;

  SELECT d.campaign_id
    INTO v_campaign_id
  FROM public.email_deliveries d
  WHERE d.resend_message_id = p_message_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.resend_webhook_events (event_id, event_type)
  VALUES (p_event_id, p_event_type)
  ON CONFLICT (event_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_event_type = 'email.delivered' THEN
    UPDATE public.email_deliveries
    SET status = 'delivered',
        delivered_at = COALESCE(delivered_at, now()),
        last_error = NULL,
        updated_at = now()
    WHERE resend_message_id = p_message_id
      AND status <> 'bounced';
  ELSIF p_event_type = 'email.bounced' THEN
    UPDATE public.email_deliveries
    SET status = 'bounced',
        last_error = left(COALESCE(p_error, 'Message bounced'), 1000),
        updated_at = now()
    WHERE resend_message_id = p_message_id;
  END IF;

  IF v_campaign_id IS NOT NULL THEN
    PERFORM public.refresh_email_campaign_stats_from_webhook(v_campaign_id);
  END IF;

  RETURN true;
END;
$$;

-- Lock down internal processing tables.
ALTER TABLE public.order_processing_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_processing_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.order_processing_claims TO service_role;

ALTER TABLE public.order_inventory_deductions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_inventory_deductions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.order_inventory_deductions TO service_role;

ALTER TABLE public.resend_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resend_webhook_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.resend_webhook_events TO service_role;

GRANT EXECUTE ON FUNCTION public.claim_transactional_email(text, text, text, text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.claim_transactional_email(text, text, text, text, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_order_processing(text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.claim_order_processing(text, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_order_processing(text, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.complete_order_processing(text, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.release_order_processing(text, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.release_order_processing(text, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.deduct_inventory_once(text, bigint, numeric) TO service_role;
REVOKE ALL ON FUNCTION public.deduct_inventory_once(text, bigint, numeric) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.deduct_inventory_batch_once(text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.deduct_inventory_batch_once(text, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.refresh_email_campaign_stats_from_webhook(text) TO service_role;
REVOKE ALL ON FUNCTION public.refresh_email_campaign_stats_from_webhook(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_resend_email_event(text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.record_resend_email_event(text, text, text, text) FROM PUBLIC, anon, authenticated;

COMMIT;
