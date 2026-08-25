import { NextResponse } from 'next/server';
import { getDb, auditLog } from '@/lib/db/database';
import { processEvent } from '@/lib/engine/orchestrator';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request) {
  try {
    const { event_type, customer_id, amount, source, metadata } = await request.json();
    
    if (!event_type || !customer_id) {
      return NextResponse.json({ error: 'event_type and customer_id are required' }, { status: 400 });
    }

    const db = getDb();
    
    const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(customer_id);
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const eventId = uuidv4();
    db.prepare(`
      INSERT INTO events (id, event_type, customer_id, source, amount, metadata, processed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))
    `).run(eventId, event_type, customer_id, source || 'api', amount || 0, metadata ? JSON.stringify(metadata) : null);

    let caseResult = null;
    const revenueRiskTypes = ['checkout_abandoned', 'checkout_timeout', 'near_expiry_inventory'];
    if (revenueRiskTypes.includes(event_type)) {
      caseResult = await processEvent(eventId);
    }

    const eventRecord = db.prepare(`SELECT * FROM events WHERE id = ?`).get(eventId);

    return NextResponse.json({ success: true, event: eventRecord, case: caseResult });
  } catch (error) {
    console.error('Events POST Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const event_type = searchParams.get('event_type');
    const customer_id = searchParams.get('customer_id');
    const processed = searchParams.get('processed');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const db = getDb();
    
    let query = 'SELECT * FROM events WHERE 1=1';
    const params = [];

    if (event_type) {
      query += ' AND event_type = ?';
      params.push(event_type);
    }
    if (customer_id) {
      query += ' AND customer_id = ?';
      params.push(customer_id);
    }
    if (processed !== null && processed !== undefined) {
      query += ' AND processed = ?';
      params.push(processed === 'true' || processed === '1' ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const events = db.prepare(query).all(...params);

    return NextResponse.json({ events });
  } catch (error) {
    console.error('Events GET Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
