import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const entity_type = searchParams.get('entity_type')
    const entity_id = searchParams.get('entity_id')
    const event_type = searchParams.get('event_type')
    const actor = searchParams.get('actor')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '100', 10) || 100))
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0)

    let query = `SELECT * FROM audit_log WHERE 1=1`
    let countQuery = `SELECT COUNT(*) as count FROM audit_log WHERE 1=1`
    const params = []

    if (entity_type) {
      query += ` AND entity_type = ?`
      countQuery += ` AND entity_type = ?`
      params.push(entity_type)
    }
    if (entity_id) {
      query += ` AND entity_id = ?`
      countQuery += ` AND entity_id = ?`
      params.push(entity_id)
    }
    if (event_type) {
      query += ` AND event_type = ?`
      countQuery += ` AND event_type = ?`
      params.push(event_type)
    }
    if (actor) {
      query += ` AND actor = ?`
      countQuery += ` AND actor = ?`
      params.push(actor)
    }
    if (from) {
      query += ` AND created_at >= ?`
      countQuery += ` AND created_at >= ?`
      params.push(from)
    }
    if (to) {
      query += ` AND created_at <= ?`
      countQuery += ` AND created_at <= ?`
      params.push(to)
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`
    
    const db = getDb()
    const entries = await db.prepare(query).all(...params, limit, offset)
    const totalRow = await db.prepare(countQuery).get(...params)

    return NextResponse.json({
      entries: entries || [],
      total: totalRow?.count || 0,
      limit,
      offset
    })
  } catch (error) {
    console.error('Audit GET Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
