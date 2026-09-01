import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'
import { processFailedPayment } from '@/lib/engine/orchestrator'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')
    const search = searchParams.get('search')
    const sortBy = searchParams.get('sortBy') || 'opened_at'
    const order = (searchParams.get('order') || 'desc').toUpperCase()
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50))
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0)

    let query = `SELECT rc.*, c.name, c.email, c.company FROM recovery_cases rc JOIN customers c ON rc.customer_id = c.id WHERE 1=1`
    let countQuery = `SELECT COUNT(*) as count FROM recovery_cases rc JOIN customers c ON rc.customer_id = c.id WHERE 1=1`
    const params = []

    if (status) {
      query += ` AND rc.status = ?`
      countQuery += ` AND rc.status = ?`
      params.push(status)
    }
    if (priority) {
      const thresholds = { high: 70, medium: 40, low: 0 }
      if (!(priority in thresholds)) return NextResponse.json({ error: 'priority must be high, medium, or low' }, { status: 400 })
      if (priority === 'high') {
        query += ` AND rc.priority_score >= 70`; countQuery += ` AND rc.priority_score >= 70`
      } else if (priority === 'medium') {
        query += ` AND rc.priority_score >= 40 AND rc.priority_score < 70`; countQuery += ` AND rc.priority_score >= 40 AND rc.priority_score < 70`
      } else {
        query += ` AND rc.priority_score < 40`; countQuery += ` AND rc.priority_score < 40`
      }
    }
    if (search) {
      query += ` AND (LOWER(c.name) LIKE LOWER(?) OR LOWER(c.email) LIKE LOWER(?) OR LOWER(COALESCE(c.company, '')) LIKE LOWER(?) OR LOWER(rc.id) LIKE LOWER(?))`
      countQuery += ` AND (LOWER(c.name) LIKE LOWER(?) OR LOWER(c.email) LIKE LOWER(?) OR LOWER(COALESCE(c.company, '')) LIKE LOWER(?) OR LOWER(rc.id) LIKE LOWER(?))`
      const searchParam = `%${search}%`
      params.push(searchParam, searchParam, searchParam, searchParam)
    }

    const allowedSort = ['priority_score', 'amount_at_risk', 'opened_at', 'recovery_probability']
    const sortField = allowedSort.includes(sortBy) ? sortBy : 'opened_at'
    const sortOrder = order === 'ASC' ? 'ASC' : 'DESC'

    query += ` ORDER BY rc.${sortField} ${sortOrder} LIMIT ? OFFSET ?`
    
    const db = getDb()
    const cases = await db.prepare(query).all(...params, limit, offset)
    const totalRow = await db.prepare(countQuery).get(...params.slice(0, params.length))

    return NextResponse.json({
      cases: cases || [],
      total: totalRow?.count || 0,
      limit,
      offset
    })
  } catch (error) {
    console.error('Cases GET Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const { paymentId } = await request.json()
    if (!paymentId) return NextResponse.json({ error: 'paymentId required' }, { status: 400 })

    const result = await processFailedPayment(paymentId)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Cases POST Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
