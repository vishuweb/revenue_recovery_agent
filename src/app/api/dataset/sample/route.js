import { NextResponse } from 'next/server';
import { DEMO_DATASETS } from '@/lib/dataset/demo-datasets';

/**
 * GET /api/dataset/sample — downloads the recommended demo CSV as a real
 * file, so a judge can: download sample -> upload it back -> run it
 * through the same LangGraph agent, with no manual data preparation.
 */
export async function GET() {
  const dataset = DEMO_DATASETS.find((d) => d.id === 'revenue_recovery_sample') || DEMO_DATASETS[0];

  return new NextResponse(dataset.csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="sample_revenue_dataset.csv"',
    },
  });
}
