import { NextResponse } from 'next/server.js';
import { getRazorpayProvider } from '../../../../lib/providers/razorpay.js';
import { getDb, auditLog } from '../../../../lib/db/database.js';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request) {
  try {
    const body = await request.json();
    const { amount, currency = 'INR', customerId, caseId, description } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Valid amount is required' }, { status: 400 });
    }

    const db = getDb();
    let customer = null;
    if (customerId) {
      customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    }

    const provider = getRazorpayProvider();

    // Check if Razorpay keys are present
    if (provider.isConfigured()) {
      const order = await provider.createOrder({
        amount,
        currency,
        receipt: `rcpt_${caseId ? caseId.substring(0, 8) : uuidv4().substring(0, 8)}`,
        notes: {
          case_id: caseId || '',
          customer_id: customerId || '',
          customer_name: customer?.name || 'Customer',
          description: description || 'Revenue Recovery Settlement'
        }
      });

      auditLog({
        entityType: 'razorpay',
        entityId: order.orderId,
        eventType: 'razorpay_order_created',
        actor: 'user',
        description: `Created Razorpay Order ${order.orderId} for ₹${(amount / 100).toFixed(0)}`,
        details: { caseId, customerId, orderId: order.orderId },
        amount
      });

      return NextResponse.json({
        success: true,
        orderId: order.orderId,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        isLiveCheckout: true
      });
    } else {
      // Fallback for simulation / mock testing when env vars are not set
      const mockOrderId = `order_mock_${uuidv4().substring(0, 10)}`;
      return NextResponse.json({
        success: true,
        orderId: mockOrderId,
        amount: Math.round(amount),
        currency,
        keyId: 'rzp_test_mock_key',
        isLiveCheckout: false,
        warning: 'Running in simulated mode. Set RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET for live gateway.'
      });
    }
  } catch (error) {
    console.error('Razorpay Order Creation Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
