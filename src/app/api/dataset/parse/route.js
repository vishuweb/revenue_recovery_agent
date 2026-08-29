import { NextResponse } from 'next/server';
import { parseCSV, autoMapColumns, normalizeRow, analyzeDatasetSummary, detectDatasetArchetype, CANONICAL_FIELDS } from '@/lib/dataset/parser';
import { DEMO_DATASETS } from '@/lib/dataset/demo-datasets';

export async function POST(request) {
  try {
    const body = await request.json();
    let { csvText, demoId, filename } = body;

    if (demoId) {
      const foundDemo = DEMO_DATASETS.find(d => d.id === demoId);
      if (!foundDemo) {
        return NextResponse.json({ error: 'Demo dataset not found' }, { status: 404 });
      }
      csvText = foundDemo.csv;
      filename = `${foundDemo.id}.csv`;
    }

    if (!csvText || typeof csvText !== 'string' || !csvText.trim()) {
      return NextResponse.json({ error: 'No CSV data provided' }, { status: 400 });
    }

    if (csvText.length > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'CSV file exceeds maximum allowed size (5MB)' }, { status: 413 });
    }

    const { headers, rows } = parseCSV(csvText);

    if (headers.length === 0 || rows.length === 0) {
      return NextResponse.json({ error: 'Failed to parse CSV or file is empty' }, { status: 400 });
    }

    const suggestedMapping = autoMapColumns(headers);

    const normalizedPreview = rows.map((row, idx) => normalizeRow(row, suggestedMapping, idx));
    const summary = analyzeDatasetSummary(normalizedPreview);
    const archetype = detectDatasetArchetype(normalizedPreview);

    const columnAnalysis = headers.map(header => {
      const mappedTo = suggestedMapping[header];
      const sampleVals = rows.slice(0, 3).map(r => r[header]).filter(Boolean);
      return {
        header,
        mappedTo,
        canonicalInfo: mappedTo ? CANONICAL_FIELDS[mappedTo] : null,
        sampleValues: sampleVals
      };
    });

    const mappedCanonicalKeys = new Set(Object.values(suggestedMapping).filter(Boolean));
    const missingCanonicalFields = Object.entries(CANONICAL_FIELDS)
      .filter(([key]) => !mappedCanonicalKeys.has(key))
      .map(([key, def]) => ({ key, ...def }));

    return NextResponse.json({
      success: true,
      filename: filename || 'uploaded_dataset.csv',
      totalRawRows: rows.length,
      headers,
      suggestedMapping,
      columnAnalysis,
      missingCanonicalFields,
      canonicalFieldDefs: CANONICAL_FIELDS,
      archetype,
      summary,
      previewRows: normalizedPreview.slice(0, 8),
      rawSampleRows: rows.slice(0, 8)
    });
  } catch (error) {
    console.error('Dataset Parse Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to process CSV' }, { status: 500 });
  }
}
