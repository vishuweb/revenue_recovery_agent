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
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    let query = `SELECT rc.*, c.name, c.email, c.company FROM recovery_cases rc JOIN customers c ON rc.customer_id = c.id WHERE 1=1`
    let countQuery = `SELECT COUNT(*) as count FROM recovery_cases rc JOIN customers c ON rc.customer_id = c.id WHERE 1=1`
    const params = []

    if (status) {
      query += ` AND rc.status = ?`
      countQuery += ` AND rc.status = ?`
      params.push(status)
    }
    if (priority) {
      query += ` AND rc.priority = ?`
      countQuery += ` AND rc.priority = ?`
      params.push(priority)
    }
    if (search) {
      query += ` AND c.name LIKE ?`
      countQuery += ` AND c.name LIKE ?`
      params.push(`%${search}%`)
    }

    const allowedSort = ['priority_score', 'amount_at_risk', 'opened_at', 'recovery_probability']
    const sortField = allowedSort.includes(sortBy) ? sortBy : 'opened_at'
    const sortOrder = order === 'ASC' ? 'ASC' : 'DESC'

    query += ` ORDER BY rc.${sortField} ${sortOrder} LIMIT ? OFFSET ?`
    
    const db = getDb()
    const cases = db.prepare(query).all(...params, limit, offset)
    const totalRow = db.prepare(countQuery).get(...params.slice(0, params.length))

    return NextResponse.json({
      cases,
      total: totalRow.count,
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
