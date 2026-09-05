/**
 * CSV dataset validation — deliberately separate from parser.js's
 * normalizeRow(), which fills sensible defaults for a genuinely missing
 * field (that's a *display/preview* convenience). This module answers a
 * different question: is this row financially trustworthy enough to hand
 * to the recovery agent at all? A row that could not be normalized into a
 * real amount, or that collides with another row's transaction id, is a
 * data-quality problem the uploader needs to see and fix — not something
 * to silently paper over with a default and process anyway.
 */

const MAX_ROWS = 5000;

/**
 * @param {object[]} rawRows - raw CSV rows (before normalizeRow)
 * @param {object[]} normalizedRows - same rows after normalizeRow()
 * @returns {{ valid: boolean, errors: {row:number, field:string, message:string}[], validRowIndexes: number[], summary: object }}
 */
export function validateDataset(rawRows, normalizedRows) {
  const errors = [];
  const seenTransactionIds = new Map(); // transaction_id -> first row index
  const invalidRowIndexes = new Set();

  if (rawRows.length > MAX_ROWS) {
    errors.push({ row: null, field: 'file', message: `Dataset has ${rawRows.length} rows, which exceeds the ${MAX_ROWS}-row limit for a single import.` });
  }

  normalizedRows.forEach((row, idx) => {
    const rowNum = idx + 1; // 1-indexed, matches a spreadsheet's row numbering (header excluded)
    const raw = rawRows[idx] || {};

    // An amount that couldn't be parsed at all (not just "missing" — parser.js
    // already defaults a genuinely absent amount to a labeled placeholder;
    // this catches a present-but-garbage value, e.g. "N/A" or "TBD", which
    // normalizeRow() also falls back on rather than rejecting).
    if (row._warnings?.some((w) => w.includes('Invalid amount'))) {
      errors.push({ row: rowNum, field: 'amount', message: 'Amount could not be parsed as a number.' });
      invalidRowIndexes.add(idx);
    }

    // Duplicate transaction_id within the SAME file is always a data
    // problem (two rows claiming to be the same payment) — separate from
    // cross-run idempotency, which lib/agent/graph.js's runRecoveryAgent
    // already handles via payment_id.
    if (row.transaction_id) {
      const firstSeenAt = seenTransactionIds.get(row.transaction_id);
      if (firstSeenAt !== undefined) {
        errors.push({ row: rowNum, field: 'transaction_id', message: `Duplicate transaction_id '${row.transaction_id}' (first seen at row ${firstSeenAt}).` });
        invalidRowIndexes.add(idx);
      } else {
        seenTransactionIds.set(row.transaction_id, rowNum);
      }
    }

    // A row with no amount, no failure signal, and no customer identity at
    // all is not a usable revenue-risk event — every value here would be a
    // guess.
    const hasAnyRealIdentity = Boolean((raw.customer_id || raw.customerId || raw.customer_email || raw.email || raw.customer_name || raw.customerName || '').toString().trim());
    if (!hasAnyRealIdentity) {
      errors.push({ row: rowNum, field: 'customer_id', message: 'No customer identifier, email, or name found — cannot attribute this event to a customer.' });
      invalidRowIndexes.add(idx);
    }
  });

  const validRowIndexes = normalizedRows.map((_, idx) => idx).filter((idx) => !invalidRowIndexes.has(idx));

  return {
    valid: errors.length === 0,
    errors,
    validRowIndexes,
    summary: {
      totalRows: normalizedRows.length,
      invalidRows: invalidRowIndexes.size,
      validRows: validRowIndexes.length,
      missingCustomerId: errors.filter((e) => e.field === 'customer_id').length,
      invalidAmounts: errors.filter((e) => e.field === 'amount').length,
      duplicateTransactionIds: errors.filter((e) => e.field === 'transaction_id').length,
    },
  };
}
