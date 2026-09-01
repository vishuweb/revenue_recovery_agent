import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/database';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const db = getDb();

    const run = await db.prepare('SELECT * FROM dataset_runs WHERE id = ?').get(id);
    if (!run) {
      return NextResponse.json({ error: 'Dataset run not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      run: {
        ...run,
        run_summary: run.run_summary ? JSON.parse(run.run_summary) : null
      }
    });
  } catch (error) {
    console.error('Dataset Run Detail GET Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
