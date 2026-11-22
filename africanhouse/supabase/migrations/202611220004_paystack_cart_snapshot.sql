BEGIN;

CREATE TABLE IF NOT EXISTS public.paystack_order_snapshots (
  paystack_reference text PRIMARY KEY,
  cart_items jsonb NOT NULL,
  server_total numeric NOT NULL,
  discount_amount numeric NOT NULL DEFAULT 0,
  promotion_id bigint,
  paid_amount_kobo bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.paystack_order_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.paystack_order_snapshots FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.paystack_order_snapshots TO service_role;

CREATE OR REPLACE FUNCTION public.bind_paystack_cart_snapshot(
  p_paystack_reference text,
  p_cart_items jsonb,
  p_server_total numeric,
  p_discount_amount numeric,
  p_promotion_id bigint,
  p_paid_amount_kobo bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.paystack_order_snapshots%ROWTYPE;
BEGIN
  IF p_paystack_reference IS NULL OR length(btrim(p_paystack_reference)) = 0
     OR p_cart_items IS NULL
     OR jsonb_typeof(p_cart_items) <> 'array'
     OR jsonb_array_length(p_cart_items) = 0
     OR p_server_total IS NULL
     OR p_server_total < 0
     OR p_discount_amount IS NULL
     OR p_discount_amount < 0
     OR p_paid_amount_kobo IS NULL
     OR p_paid_amount_kobo <= 0 THEN
    RAISE EXCEPTION 'Invalid Paystack cart snapshot';
  END IF;

  INSERT INTO public.paystack_order_snapshots (
    paystack_reference,
    cart_items,
    server_total,
    discount_amount,
    promotion_id,
    paid_amount_kobo
  ) VALUES (
    p_paystack_reference,
    p_cart_items,
    p_server_total,
    p_discount_amount,
    p_promotion_id,
    p_paid_amount_kobo
  )
  ON CONFLICT (paystack_reference) DO NOTHING;

  SELECT * INTO v_existing
  FROM public.paystack_order_snapshots
  WHERE paystack_reference = p_paystack_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Could not establish Paystack cart snapshot';
  END IF;

  IF v_existing.cart_items IS DISTINCT FROM p_cart_items
     OR v_existing.server_total IS DISTINCT FROM p_server_total
     OR v_existing.discount_amount IS DISTINCT FROM p_discount_amount
     OR v_existing.promotion_id IS DISTINCT FROM p_promotion_id
     OR v_existing.paid_amount_kobo IS DISTINCT FROM p_paid_amount_kobo THEN
    RETURN jsonb_build_object(
      'matched', false,
      'reason', 'Paystack reference is associated with a different cart or payment snapshot'
    );
  END IF;

  RETURN jsonb_build_object(
    'matched', true,
    'snapshot_created', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bind_paystack_cart_snapshot(text, jsonb, numeric, numeric, bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bind_paystack_cart_snapshot(text, jsonb, numeric, numeric, bigint, bigint) TO service_role;

COMMIT;
