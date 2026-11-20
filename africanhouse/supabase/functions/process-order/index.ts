import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const body = await req.json();
    const {
      paystackReference,
      customerName,
      customerPhone,
      location,
      deliveryNote,
      cartItems,
      promotionId,
      customerId,
    }: {
      paystackReference: string;
      customerName: string;
      customerPhone: string;
      location: string;
      deliveryNote?: string;
      cartItems: Array<{ fabricId: string; yards: number }>;
      promotionId?: number | null;
      customerId?: string | null;
    } = body;

    if (!paystackReference || !customerName || !customerPhone || !location || !cartItems?.length) {
      return json({ error: 'Missing required fields' }, 400);
    }

    const paystackSecret = Deno.env.get('PAYSTACK_SECRET_KEY');
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceKey     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!paystackSecret) {
      return json({ error: 'Payment configuration error' }, 500);
    }

    // 1. Verify payment with Paystack
    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(paystackReference)}`,
      { headers: { Authorization: `Bearer ${paystackSecret}` } }
    );
    const verifyData = await verifyRes.json();

    if (!verifyRes.ok || verifyData?.data?.status !== 'success') {
      return json({ error: 'Payment verification failed. Please contact support.' }, 402);
    }

    const paidAmountKobo = verifyData.data.amount as number;

    // 2. Fetch current fabric prices and inventory from DB (server-side — client prices are never trusted)
    const db = createClient(supabaseUrl, serviceKey);

    const fabricIds = cartItems.map(i => Number(i.fabricId));

    const { data: fabrics, error: fabricErr } = await db
      .from('fabrics')
      .select('id, name, price_per_yard, available_yards, min_yard, in_stock, material, category, image_url, subcategory')
      .in('id', fabricIds);

    if (fabricErr || !fabrics) {
      return json({ error: 'Could not load fabric data' }, 500);
    }

    // 3. Validate inventory and compute server-side total
    let serverTotal = 0;
    for (const cartItem of cartItems) {
      const fabric = fabrics.find((f: { id: number }) => String(f.id) === cartItem.fabricId) as any;
      if (!fabric) {
        return json({ error: `Fabric not found: ${cartItem.fabricId}` }, 400);
      }
      if (!fabric.in_stock || Number(fabric.available_yards) < cartItem.yards) {
        return json({ error: `Insufficient stock for "${fabric.name}". Only ${fabric.available_yards} yards available.` }, 409);
      }
      if (cartItem.yards % Number(fabric.min_yard) !== 0) {
        return json({ error: `Invalid yard quantity for "${fabric.name}".` }, 400);
      }
      serverTotal += Number(fabric.price_per_yard) * cartItem.yards;
    }

    // 4. Apply active promotion (server-side only)
    let discountAmount = 0;
    let appliedPromotionId: number | null = null;

    const { data: promoRows } = await db
      .from('promotions')
      .select('id, discount_type, discount_value, min_order_amount, applies_to_categories')
      .eq('active', true)
      .lte('starts_at', new Date().toISOString())
      .gte('ends_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    const promo = (promoRows as any[])?.[0];
    if (promo && serverTotal >= Number(promo.min_order_amount ?? 0)) {
      if (promo.discount_type === 'percentage') {
        discountAmount = Math.round((serverTotal * Number(promo.discount_value) / 100) * 100) / 100;
      } else {
        discountAmount = Math.min(Number(promo.discount_value), serverTotal);
      }
      appliedPromotionId = promo.id;
    }

    const finalTotal = Math.round((serverTotal - discountAmount) * 100) / 100;

    // 5. Verify paid amount matches server-calculated total (1 pesewa tolerance for rounding)
    const expectedKobo = Math.round(finalTotal * 100);
    if (Math.abs(paidAmountKobo - expectedKobo) > 1) {
      return json({
        error: `Payment amount mismatch. Paid: GH₵${(paidAmountKobo / 100).toFixed(2)}, Expected: GH₵${finalTotal.toFixed(2)}`,
      }, 402);
    }

    // 6. Prevent duplicate paystack_reference
    const { data: existingOrder } = await db
      .from('orders')
      .select('id')
      .eq('paystack_reference', paystackReference)
      .maybeSingle();

    if (existingOrder) {
      return json({ error: 'This payment reference has already been used.' }, 409);
    }

    // 7. Fetch fabric costs server-side (service role — never exposed to browser)
    const { data: costsRows } = await db
      .from('fabric_costs')
      .select('fabric_id, full_piece_cost')
      .in('fabric_id', fabricIds);

    const costsMap = new Map<number, number>();
    for (const row of (costsRows as any[]) ?? []) {
      costsMap.set(Number(row.fabric_id), Number(row.full_piece_cost ?? 0));
    }

   // 8. Deduct inventory atomically via existing RPC
    for (const cartItem of cartItems) {
      const { data: rpcData, error: rpcErr } = await db.rpc('deduct_inventory', {
        p_fabric_id: Number(cartItem.fabricId),
        p_yards:     cartItem.yards,
      });
      if (rpcErr || (rpcData as any)?.success === false) {
  console.error('INVENTORY DEDUCTION FAILED:', rpcErr, rpcData);

  return json({
    error: (rpcData as any)?.message ?? 'Inventory error. Please try again.'
  }, 409);
}
    }

    // 9. Build order items with server-side prices and historical cost snapshot
    const getFabric = (id: string) => fabrics.find((f: { id: number }) => String(f.id) === id)! as any;
    const orderItems = cartItems.map(item => {
      const f = getFabric(item.fabricId);
      const fullPieceCost = costsMap.get(Number(item.fabricId)) ?? 0;
      return {
        fabric_id:             item.fabricId,
        fabric_name:           f.name,
        image_url:             f.image_url ?? '',
        material:              f.material,
        category:              f.category,
        yards:                 item.yards,
        price_per_yard:        Number(f.price_per_yard),
        subtotal:              Number(f.price_per_yard) * item.yards,
        cost_per_yard_at_sale: fullPieceCost > 0 ? fullPieceCost / 12 : 0,
      };
    });

    // 10. Insert order — generate tracking_token explicitly so it is never NULL
    const trackingToken = crypto.randomUUID();

    const { data: inserted, error: insertErr } = await db
      .from('orders')
      .insert({
        customer_name:      customerName,
        customer_phone:     customerPhone,
        location,
        delivery_note:      deliveryNote ?? '',
        paystack_reference: paystackReference,
        total_amount:       finalTotal,
        discount_amount:    discountAmount,
        promotion_id:       appliedPromotionId,
        status:             'payment_confirmed',
        items:              orderItems,
        tracking_token:     trackingToken,
        customer_id:        customerId ?? null,
      })
      .select('id, tracking_token')
      .single();

  if (insertErr || !inserted) {
  console.error('ORDER INSERT FAILED:', insertErr);

  return json({
    error: 'Failed to save order. Please contact support with your payment reference.'
  }, 500);
}

    return json({
      orderId:       (inserted as any).id,
      trackingToken: (inserted as any).tracking_token,
    });

  } catch (err) {
    console.error('process-order error:', err);
    return json({ error: 'Unexpected server error. Please contact support.' }, 500);
  }
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
