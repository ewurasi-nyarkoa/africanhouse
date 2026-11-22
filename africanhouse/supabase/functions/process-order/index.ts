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

    if (!paystackReference || !customerName || !customerPhone || !location) {
      return json({ error: 'Missing required fields' }, 400);
    }

    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return json({ error: 'Cart must contain at least one valid item' }, 400);
    }

    const aggregatedCart = new Map<string, number>();
    for (const [index, item] of cartItems.entries()) {
      if (!item || typeof item !== 'object') {
        return json({ error: `Invalid cart item at position ${index + 1}` }, 400);
      }

      const rawFabricId = (item as any).fabricId;
      const fabricIdText = typeof rawFabricId === 'number'
        ? String(rawFabricId)
        : typeof rawFabricId === 'string'
          ? rawFabricId.trim()
          : '';

      if (!/^\d+$/.test(fabricIdText)) {
        return json({ error: `Invalid fabric ID at cart position ${index + 1}` }, 400);
      }

      const fabricId = Number(fabricIdText);
      if (!Number.isSafeInteger(fabricId) || fabricId <= 0) {
        return json({ error: `Invalid fabric ID at cart position ${index + 1}` }, 400);
      }

      const yards = (item as any).yards;
      if (typeof yards !== 'number'
        || !Number.isFinite(yards)
        || !Number.isInteger(yards)
        || yards <= 0
        || !Number.isSafeInteger(yards)) {
        return json({ error: `Invalid yard quantity at cart position ${index + 1}` }, 400);
      }

      const combinedYards = (aggregatedCart.get(String(fabricId)) ?? 0) + yards;
      if (!Number.isSafeInteger(combinedYards) || combinedYards <= 0) {
        return json({ error: `Invalid combined yard quantity for fabric ${fabricId}` }, 400);
      }

      aggregatedCart.set(String(fabricId), combinedYards);
    }

    const validatedCartItems = Array.from(aggregatedCart.entries())
      .map(([fabricId, yards]) => ({ fabricId, yards }))
      .sort((a, b) => Number(a.fabricId) - Number(b.fabricId));

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
    const paystackEmail = typeof verifyData.data.customer?.email === 'string'
      ? verifyData.data.customer.email.trim().toLowerCase()
      : '';
    const placeholderEmail = `${customerPhone}@africanhouse.com`.toLowerCase();
    const verifiedCustomerEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paystackEmail)
      && paystackEmail !== placeholderEmail
      ? paystackEmail
      : null;

    const db = createClient(supabaseUrl, serviceKey);

    // 2. Fetch current fabric prices and inventory from DB (server-side — client prices are never trusted)
    const fabricIds = validatedCartItems.map(i => Number(i.fabricId));

    const { data: fabrics, error: fabricErr } = await db
      .from('fabrics')
      .select('id, name, price_per_yard, available_yards, min_yard, in_stock, material, category, image_url, subcategory')
      .in('id', fabricIds);

    if (fabricErr || !fabrics) {
      return json({ error: 'Could not load fabric data' }, 500);
    }

    // 3. Validate individual and aggregated inventory and compute server-side total
    let serverTotal = 0;

    for (const cartItem of cartItems) {
      const fabricId = String(Number((cartItem as any).fabricId));
      const yards = (cartItem as any).yards as number;
      const fabric = fabrics.find((f: { id: number }) => String(f.id) === fabricId) as any;
      if (!fabric) {
        return json({ error: `Fabric not found: ${fabricId}` }, 400);
      }

      const minimumYards = Number(fabric.min_yard);
      if (!Number.isFinite(minimumYards) || minimumYards <= 0) {
        return json({ error: `Invalid minimum yard quantity for "${fabric.name}".` }, 409);
      }
      if (yards < minimumYards) {
        return json({ error: `Invalid yard quantity for "${fabric.name}". Minimum is ${minimumYards} yards.` }, 409);
      }
      if (yards % minimumYards !== 0) {
        return json({ error: `Invalid yard quantity for "${fabric.name}".` }, 409);
      }
    }

    for (const cartItem of validatedCartItems) {
      const fabric = fabrics.find((f: { id: number }) => String(f.id) === cartItem.fabricId) as any;
      if (!fabric) {
        return json({ error: `Fabric not found: ${cartItem.fabricId}` }, 400);
      }

      const minimumYards = Number(fabric.min_yard);
      if (!Number.isFinite(minimumYards) || minimumYards <= 0) {
        return json({ error: `Invalid minimum yard quantity for "${fabric.name}".` }, 409);
      }

      if (!fabric.in_stock || Number(fabric.available_yards) < cartItem.yards) {
        return json({ error: `Insufficient stock for "${fabric.name}". Only ${fabric.available_yards} yards available.` }, 409);
      }
      if (cartItem.yards < minimumYards) {
        return json({ error: `Invalid yard quantity for "${fabric.name}". Minimum is ${minimumYards} yards.` }, 409);
      }
      if (cartItem.yards % minimumYards !== 0) {
        return json({ error: `Invalid yard quantity for "${fabric.name}".` }, 409);
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

    // Bind the server-calculated cart and payment snapshot to this Paystack reference.
    const cartSnapshotItems = validatedCartItems.map(item => ({
      fabric_id: Number(item.fabricId),
      yards: item.yards,
    }));

    const { data: snapshotResult, error: snapshotError } = await db.rpc('bind_paystack_cart_snapshot', {
      p_paystack_reference: paystackReference,
      p_cart_items: cartSnapshotItems,
      p_server_total: finalTotal,
      p_discount_amount: discountAmount,
      p_promotion_id: appliedPromotionId,
      p_paid_amount_kobo: paidAmountKobo,
    });

    const snapshotData = Array.isArray(snapshotResult) ? snapshotResult[0] : snapshotResult;
    if (snapshotError) {
      console.error('PAYSTACK CART SNAPSHOT FAILED:', snapshotError.message);
      return json({ error: 'Could not verify this payment reference safely' }, 500);
    }
    if (!snapshotData || (snapshotData as any).matched !== true) {
      return json({
        error: (snapshotData as any)?.reason ?? 'Paystack reference is associated with a different cart',
      }, 409);
    }

    const { data: existingOrder, error: existingOrderError } = await db
      .from('orders')
      .select('id, tracking_token')
      .eq('paystack_reference', paystackReference)
      .maybeSingle();
    if (existingOrderError) return json({ error: 'Could not verify existing payment order' }, 500);

    if (existingOrder) {
      await sendOrderConfirmation(supabaseUrl, serviceKey, existingOrder.id);
      return json({ orderId: existingOrder.id, trackingToken: existingOrder.tracking_token });
    }

    const { data: claimRows, error: claimError } = await db.rpc('claim_order_processing', {
      p_paystack_reference: paystackReference,
      p_lease_seconds: 600,
    });
    if (claimError) {
      console.error('Payment reference claim failed:', claimError.message);
      return json({ error: 'Could not claim this payment reference' }, 500);
    }
    const orderClaim = Array.isArray(claimRows) ? claimRows[0] : null;
    if (!orderClaim?.claimed || !orderClaim.claim_token) {
      return json({ error: 'This payment is already being processed. Please retry shortly.' }, 409);
    }
    const claimToken = orderClaim.claim_token as string;

    // 7. Fetch fabric costs server-side (service role — never exposed to browser)
    const { data: costsRows } = await db
      .from('fabric_costs')
      .select('fabric_id, full_piece_cost')
      .in('fabric_id', fabricIds);

    const costsMap = new Map<number, number>();
    for (const row of (costsRows as any[]) ?? []) {
      costsMap.set(Number(row.fabric_id), Number(row.full_piece_cost ?? 0));
    }

    // 8. Deduct the complete cart atomically via existing RPC
    const batchItems = validatedCartItems.map(item => ({
      fabric_id: Number(item.fabricId),
      yards: item.yards,
    }));

    const { data: batchResult, error: batchError } = await db.rpc('deduct_inventory_batch_once', {
      p_paystack_reference: paystackReference,
      p_items: batchItems,
    });

    const batchData = Array.isArray(batchResult) ? batchResult[0] : batchResult;
    if (batchError || !batchData || (batchData as any).success !== true) {
      const inventoryError = batchError?.message
        ?? (batchData as any)?.message
        ?? 'Inventory deduction failed';
      console.error('INVENTORY BATCH DEDUCTION FAILED:', inventoryError);
      await releaseProcessingClaim(
        db,
        paystackReference,
        claimToken,
        'Inventory deduction failed',
      );

      return json({
        error: inventoryError,
      }, 409);
    }

    // 9. Build order items with server-side prices and historical cost snapshot
    const getFabric = (id: string) => fabrics.find((f: { id: number }) => String(f.id) === id)! as any;
    const orderItems = validatedCartItems.map(item => {
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
        customer_email:     verifiedCustomerEmail,
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
      await releaseProcessingClaim(
        db,
        paystackReference,
        claimToken,
        'Order insertion failed',
      );

      return json({
        error: 'Failed to save order. Please contact support with your payment reference.'
      }, 500);
    }

    const { error: completeError } = await db.rpc('complete_order_processing', {
      p_paystack_reference: paystackReference,
      p_claim_token: claimToken,
      p_order_id: String((inserted as any).id),
    });
    if (completeError) console.error('Order processing completion update failed:', completeError.message);

    if (verifiedCustomerEmail) await sendOrderConfirmation(supabaseUrl, serviceKey, (inserted as any).id);

    return json({
      orderId:       (inserted as any).id,
      trackingToken: (inserted as any).tracking_token,
    });

  } catch (err) {
    console.error('process-order error:', err);
    return json({ error: 'Unexpected server error. Please contact support.' }, 500);
  }
});

async function sendOrderConfirmation(supabaseUrl: string, serviceKey: string, orderId: number | string): Promise<void> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-order-confirmation`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orderId }),
    });
    if (!response.ok) console.error('Order confirmation function returned:', response.status);
  } catch (error) {
    console.error('Order confirmation function request failed:', error);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function releaseProcessingClaim(
  db: any,
  paystackReference: string,
  claimToken: string,
  processingError: string,
): Promise<void> {
  try {
    const { data, error } = await db.rpc('release_order_processing', {
      p_paystack_reference: paystackReference,
      p_claim_token: claimToken,
      p_error: processingError,
    });

    if (error || data !== true) {
      console.error('PROCESSING CLAIM RELEASE FAILED:', error?.message ?? 'RPC did not confirm release');
      return;
    }
  } catch (error) {
    console.error('PROCESSING CLAIM RELEASE FAILED:', error instanceof Error ? error.message : 'Unexpected release error');
  }
}
