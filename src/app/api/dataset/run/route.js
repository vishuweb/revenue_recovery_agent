import { NextResponse } from 'next/server';
import { parseCSV, normalizeRow } from '@/lib/dataset/parser';
import { validateDataset } from '@/lib/dataset/validator';
import { executeDatasetPipeline } from '@/lib/dataset/pipeline';
import { DEMO_DATASETS } from '@/lib/dataset/demo-datasets';

export async function POST(request) {
  try {
    const body = await request.json();
    let { csvText, demoId, columnMapping, datasetName, filename, skipInvalidRows } = body;

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
    let normalizedRows = rows.map((row, idx) => normalizeRow(row, mapping, idx));

    // Validate before running anything through the agent — a batch that
    // contains unparseable amounts or duplicate transaction ids should not
    // silently proceed. The caller must explicitly opt in (skipInvalidRows)
    // to run only the valid subset instead.
    const validation = validateDataset(rows, normalizedRows);
    if (!validation.valid) {
      if (!skipInvalidRows) {
        return NextResponse.json({
          error: 'CSV validation failed',
          validation: { valid: false, summary: validation.summary, errors: validation.errors.slice(0, 200) },
        }, { status: 422 });
      }
      const validSet = new Set(validation.validRowIndexes);
      normalizedRows = normalizedRows.filter((_, idx) => validSet.has(idx));
      if (normalizedRows.length === 0) {
        return NextResponse.json({ error: 'No valid rows remained after excluding invalid ones', validation: { valid: false, summary: validation.summary, errors: validation.errors.slice(0, 200) } }, { status: 422 });
      }
    }

    const result = await executeDatasetPipeline(normalizedRows, {
      name: datasetName || filename || 'Uploaded Dataset Run',
      filename: filename || 'custom_upload.csv'
    });
    result.validation = { summary: validation.summary, skippedInvalidRows: validation.summary.invalidRows };

    return NextResponse.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Dataset Run Pipeline Error:', error);
    return NextResponse.json({ error: error.message || 'Execution error in recovery engine' }, { status: 500 });
  }
}
