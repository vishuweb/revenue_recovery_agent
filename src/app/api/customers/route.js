import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const sortBy = searchParams.get('sortBy') || 'risk_score'
    const order = (searchParams.get('order') || 'desc').toUpperCase()
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50))
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0)

    let query = `SELECT * FROM customers WHERE 1=1`
    let countQuery = `SELECT COUNT(*) as count FROM customers WHERE 1=1`
    const params = []

    if (search) {
      const like = `%${search}%`
      query += ` AND (name LIKE ? OR email LIKE ? OR company LIKE ?)`
      countQuery += ` AND (name LIKE ? OR email LIKE ? OR company LIKE ?)`
      params.push(like, like, like)
    }

    const allowedSort = ['risk_score', 'mrr', 'lifetime_value', 'failed_payments']
    const sortField = allowedSort.includes(sortBy) ? sortBy : 'risk_score'
    const sortOrder = order === 'ASC' ? 'ASC' : 'DESC'

    query += ` ORDER BY ${sortField} ${sortOrder} LIMIT ? OFFSET ?`
    
    const db = getDb()
    const customers = await db.prepare(query).all(...params, limit, offset)
    const totalRow = await db.prepare(countQuery).get(...params.slice(0, params.length))

    for (const c of (customers || [])) {
      const stats = await db.prepare(`
        SELECT COUNT(*) as activeCases, SUM(amount_at_risk) as activeRiskAmount
        FROM recovery_cases 
        WHERE customer_id = ? AND status IN ('open', 'in_progress')
      `).get(c.id)
      c.activeCases = stats?.activeCases || 0
      c.activeRiskAmount = stats?.activeRiskAmount || 0
    }

    return NextResponse.json({
      customers: customers || [],
      total: totalRow?.count || 0,
      limit,
      offset
    })
  } catch (error) {
    console.error('Customers GET Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
