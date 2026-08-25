import { NextResponse } from 'next/server';
import { processPendingAutomations } from '@/lib/engine/orchestrator';

export async function GET() {
  try {
    const results = await processPendingAutomations();
    return NextResponse.json({ success: true, results });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
