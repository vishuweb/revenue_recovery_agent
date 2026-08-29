import { NextResponse } from 'next/server';
import { parseCSV, normalizeRow } from '@/lib/dataset/parser';
import { executeDatasetPipeline } from '@/lib/dataset/pipeline';
import { DEMO_DATASETS } from '@/lib/dataset/demo-datasets';

export async function POST(request) {
  try {
    const body = await request.json();
    let { csvText, demoId, columnMapping, datasetName, filename } = body;

    if (demoId) {
      const foundDemo = DEMO_DATASETS.find(d => d.id === demoId);
      if (foundDemo) {
        csvText = foundDemo.csv;
        filename = `${foundDemo.id}.csv`;
        datasetName = foundDemo.name;
      }
    }

    if (!csvText || typeof csvText !== 'string') {
      return NextResponse.json({ error: 'No CSV content provided' }, { status: 400 });
    }

    const { headers, rows } = parseCSV(csvText);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'CSV dataset has no records' }, { status: 400 });
    }

    const mapping = columnMapping || {};
    const normalizedRows = rows.map((row, idx) => normalizeRow(row, mapping, idx));

    const result = await executeDatasetPipeline(normalizedRows, {
      name: datasetName || filename || 'Uploaded Dataset Run',
      filename: filename || 'custom_upload.csv'
    });

    return NextResponse.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Dataset Run Pipeline Error:', error);
    return NextResponse.json({ error: error.message || 'Execution error in recovery engine' }, { status: 500 });
  }
}
