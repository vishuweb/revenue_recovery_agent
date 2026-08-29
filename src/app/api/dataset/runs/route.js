import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/database';

export async function GET() {
  try {
    const db = getDb();
    const runs = db.prepare(`
      SELECT * FROM dataset_runs 
      ORDER BY created_at DESC 
      LIMIT 50
    `).all();

    const parsedRuns = runs.map(r => ({
      ...r,
      run_summary: r.run_summary ? JSON.parse(r.run_summary) : null
    }));

    return NextResponse.json({
      success: true,
      runs: parsedRuns
    });
  } catch (error) {
    console.error('Dataset Runs GET Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
