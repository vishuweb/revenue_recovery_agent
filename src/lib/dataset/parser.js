/**
 * CSV Parser & Intelligent Column Normalizer
 * Provides flexible column mapping, schema classification, and row normalization
 * for any business dataset uploaded by a judge or user.
 */

// Canonical fields supported by the AI Revenue Recovery engine
export const CANONICAL_FIELDS = {
  // Customer identity & segment
  customer_id: {
    label: 'Customer ID',
    required: false,
    category: 'customer',
    description: 'Unique identifier for the customer/account',
    aliases: ['customer_id', 'customerid', 'user_id', 'userid', 'client_id', 'clientid', 'account_id', 'accountid', 'cust_id', 'id', 'customer_ref']
  },
  customer_name: {
    label: 'Customer Name',
    required: false,
    category: 'customer',
    description: 'Full name of customer or account',
    aliases: ['customer_name', 'customername', 'name', 'full_name', 'fullname', 'client_name', 'user_name', 'contact_name', 'account_name', 'buyer_name']
  },
  customer_email: {
    label: 'Email',
    required: false,
    category: 'customer',
    description: 'Customer contact email address',
    aliases: ['customer_email', 'customeremail', 'email', 'mail', 'contact_email', 'user_email', 'billing_email']
  },
  customer_company: {
    label: 'Company',
    required: false,
    category: 'customer',
    description: 'Business or organization name',
    aliases: ['company', 'organization', 'org', 'business_name', 'client_company', 'company_name']
  },
  customer_segment: {
    label: 'Segment / Plan',
    required: false,
    category: 'customer',
    description: 'Account tier (starter, growth, enterprise)',
    aliases: ['customer_segment', 'segment', 'plan', 'tier', 'plan_name', 'subscription_plan', 'tier_name', 'plan_tier', 'account_type', 'membership']
  },
  lifetime_value: {
    label: 'Lifetime Value (LTV)',
    required: false,
    category: 'customer',
    description: 'Historical customer lifetime spend',
    aliases: ['lifetime_value', 'lifetimevalue', 'ltv', 'customer_ltv', 'total_spend', 'clv', 'historic_spend', 'cumulative_revenue', 'total_revenue']
  },
  mrr: {
    label: 'MRR / Monthly Spend',
    required: false,
    category: 'customer',
    description: 'Monthly recurring revenue or recurring billing',
    aliases: ['mrr', 'monthly_recurring_revenue', 'monthly_spend', 'monthly_amount', 'subscription_amount', 'recurring_value', 'plan_amount']
  },
  discount_affinity: {
    label: 'Discount Affinity',
    required: false,
    category: 'customer_behavior',
    description: 'Propensity to convert on promotional incentives (0.0 - 1.0)',
    aliases: ['discount_affinity', 'discountaffinity', 'price_sensitivity', 'promo_affinity', 'discount_propensity', 'coupon_affinity', 'price_elasticity']
  },
  previous_successful_payments: {
    label: 'Prior Successful Payments',
    required: false,
    category: 'customer_behavior',
    description: 'Count of lifetime successful charges',
    aliases: ['previous_successful_payments', 'successful_payments', 'past_successes', 'paid_count', 'successful_txns', 'prior_successes', 'successful_orders']
  },
  previous_failed_payments: {
    label: 'Prior Failed Payments',
    required: false,
    category: 'customer_behavior',
    description: 'Count of lifetime failed/declined attempts',
    aliases: ['previous_failed_payments', 'failed_payments', 'past_failures', 'decline_count', 'failed_txns', 'prior_failures', 'failed_orders']
  },
  opted_out: {
    label: 'Opted Out / DND',
    required: false,
    category: 'customer_behavior',
    description: 'Customer communication preference (0 or 1)',
    aliases: ['opted_out', 'opt_out', 'unsubscribe', 'dnd', 'do_not_disturb', 'unsubscribed', 'optout']
  },

  // Transaction / Risk Data
  transaction_id: {
    label: 'Transaction ID',
    required: false,
    category: 'transaction',
    description: 'Unique identifier for the transaction/order',
    aliases: ['transaction_id', 'transactionid', 'payment_id', 'paymentid', 'txn_id', 'txnid', 'order_id', 'orderid', 'invoice_id', 'ref_id', 'charge_id']
  },
  amount: {
    label: 'Amount / Revenue at Risk',
    required: true,
    category: 'transaction',
    description: 'Transaction value, invoice amount, or order total',
    aliases: ['amount', 'transaction_amount', 'payment_amount', 'order_value', 'value', 'amount_due', 'invoice_amount', 'price', 'cart_value', 'total', 'bill_amount', 'gross_amount']
  },
  currency: {
    label: 'Currency',
    required: false,
    category: 'transaction',
    description: 'Currency code (INR, USD, EUR)',
    aliases: ['currency', 'currency_code', 'curr']
  },
  payment_method: {
    label: 'Payment Method',
    required: false,
    category: 'transaction',
    description: 'Payment rail (card, upi, netbanking, ach, invoice)',
    aliases: ['payment_method', 'paymentmethod', 'method', 'payment_type', 'gateway', 'card_type', 'pay_method', 'instrument', 'channel']
  },
  payment_status: {
    label: 'Payment Status',
    required: false,
    category: 'payment',
    description: 'Status (failed, declined, overdue, abandoned, pending, success)',
    aliases: ['payment_status', 'paymentstatus', 'status', 'txn_status', 'state', 'trans_status', 'charge_status', 'order_status']
  },
  failure_reason: {
    label: 'Decline / Error Reason',
    required: false,
    category: 'payment',
    description: 'Error code or decline reason from gateway/bank',
    aliases: ['failure_reason', 'failurereason', 'error_code', 'reason', 'decline_reason', 'failure_code', 'error_message', 'decline_code', 'error', 'declined_reason', 'decline_message', 'sub_status']
  },
  retry_count: {
    label: 'Retry / Attempt Count',
    required: false,
    category: 'payment',
    description: 'Previous retry attempts made',
    aliases: ['retry_count', 'retrycount', 'attempts', 'retry_attempts', 'retries_made', 'attempts_made', 'attempt_number']
  },

  // Checkout / Event Data
  checkout_status: {
    label: 'Checkout / Cart Status',
    required: false,
    category: 'checkout',
    description: 'Abandonment state (abandoned, timeout, active)',
    aliases: ['checkout_status', 'checkoutstatus', 'cart_status', 'abandoned', 'is_abandoned', 'dropoff_stage', 'abandonment_stage', 'funnel_step']
  },
  subscription_status: {
    label: 'Subscription Status',
    required: false,
    category: 'subscription',
    description: 'State of subscription (active, past_due, unpaid, renewing)',
    aliases: ['subscription_status', 'sub_status', 'renewal_status', 'plan_status', 'subscription_state']
  },
  invoice_status: {
    label: 'Invoice Status',
    required: false,
    category: 'invoice',
    description: 'Status of invoice (unpaid, overdue, paid, open)',
    aliases: ['invoice_status', 'invoicestatus', 'inv_status', 'due_status', 'invoice_state']
  },
  invoice_age: {
    label: 'Invoice Age (Days)',
    required: false,
    category: 'invoice',
    description: 'Days since invoice due date',
    aliases: ['invoice_age', 'invoiceage', 'days_overdue', 'age_days', 'overdue_days', 'days_past_due']
  }
};

/**
 * Parses raw CSV string into an array of object rows respecting RFC 4180
 */
export function parseCSV(csvText) {
  if (!csvText || typeof csvText !== 'string') {
    return { headers: [], rows: [] };
  }

  const cleanText = csvText.replace(/^\uFEFF/, '').trim();
  if (!cleanText) return { headers: [], rows: [] };

  const lines = [];
  let currentField = '';
  let inQuotes = false;
  let currentRow = [];

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \r\n
      }
      currentRow.push(currentField.trim());
      if (currentRow.some(val => val !== '')) {
        lines.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(val => val !== '')) {
      lines.push(currentRow);
    }
  }

  if (lines.length === 0) return { headers: [], rows: [] };

  const rawHeaders = lines[0].map(h => h.replace(/^["']|["']$/g, '').trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i];
    const rowObj = {};
    for (let h = 0; h < rawHeaders.length; h++) {
      const headerName = rawHeaders[h];
      let val = values[h] !== undefined ? values[h] : '';
      val = val.replace(/^["']|["']$/g, '').trim();
      rowObj[headerName] = val;
    }
    rows.push(rowObj);
  }

  return { headers: rawHeaders, rows };
}

/**
 * Automatically infers mapping from CSV headers to canonical field names
 */
export function autoMapColumns(headers) {
  const mapping = {};
  const usedCanonical = new Set();

  headers.forEach(header => {
    const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

    let bestMatch = null;
    let highestPriority = -1;

    for (const [canonicalKey, fieldDef] of Object.entries(CANONICAL_FIELDS)) {
      if (usedCanonical.has(canonicalKey)) continue;

      // Exact match with key
      if (normalizedHeader === canonicalKey) {
        bestMatch = canonicalKey;
        highestPriority = 100;
        break;
      }

      // Exact match with alias
      for (const alias of fieldDef.aliases) {
        const normAlias = alias.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        if (normalizedHeader === normAlias) {
          if (highestPriority < 90) {
            bestMatch = canonicalKey;
            highestPriority = 90;
          }
          break;
        }

        // Substring / fuzzy match
        if (normalizedHeader.includes(normAlias) || normAlias.includes(normalizedHeader)) {
          if (highestPriority < 50) {
            bestMatch = canonicalKey;
            highestPriority = 50;
          }
        }
      }
    }

    if (bestMatch && highestPriority >= 50) {
      mapping[header] = bestMatch;
      usedCanonical.add(bestMatch);
    } else {
      mapping[header] = null;
    }
  });

  return mapping;
}

/**
 * Classifies the dataset archetype based on mapped rows
 */
export function detectDatasetArchetype(mappedRows) {
  let paymentFailureCount = 0;
  let checkoutAbandonmentCount = 0;
  let subscriptionCount = 0;
  let invoiceCount = 0;

  for (const row of mappedRows.slice(0, 50)) {
    const failureReason = (row.failure_reason || '').toLowerCase();
    const status = (row.payment_status || row.checkout_status || row.invoice_status || '').toLowerCase();

    if (failureReason.includes('abandon') || status.includes('abandon') || row.checkout_status) {
      checkoutAbandonmentCount++;
    } else if (failureReason.includes('sub') || row.subscription_status) {
      subscriptionCount++;
    } else if (row.invoice_status || row.invoice_age || failureReason.includes('invoice')) {
      invoiceCount++;
    } else if (failureReason || status.includes('fail') || status.includes('decline')) {
      paymentFailureCount++;
    }
  }

  if (checkoutAbandonmentCount > paymentFailureCount && checkoutAbandonmentCount > 10) {
    return {
      type: 'checkout_abandonment',
      label: 'E-Commerce / Checkout Abandonment',
      description: 'High concentration of dropped carts, pricing friction, and checkout timeouts.'
    };
  }

  if (subscriptionCount > paymentFailureCount && subscriptionCount > 10) {
    return {
      type: 'subscriptions',
      label: 'SaaS Recurring Subscriptions',
      description: 'Subscription billing renewals, recurring card declines, and plan churn.'
    };
  }

  if (invoiceCount > paymentFailureCount && invoiceCount > 10) {
    return {
      type: 'invoices',
      label: 'B2B Overdue Invoices',
      description: 'Accounts receivable aging, delayed wire payments, and enterprise dispute resolution.'
    };
  }

  if (paymentFailureCount > 0) {
    return {
      type: 'payment_failures',
      label: 'Payment Gateway Declines',
      description: 'Bank declines, card timeouts, insufficient funds, and network gateway outages.'
    };
  }

  return {
    type: 'mixed',
    label: 'Mixed Revenue Events',
    description: 'Heterogeneous mix of payment failures, dropoffs, and billing retries.'
  };
}

/**
 * Normalizes a single raw row according to column mapping and defaults
 */
export function normalizeRow(rawRow, columnMapping, rowIndex = 0) {
  const normalized = {
    _raw: rawRow,
    _rowIndex: rowIndex,
    _warnings: []
  };

  // Extract mapped fields
  for (const [rawHeader, canonicalKey] of Object.entries(columnMapping)) {
    if (canonicalKey && rawRow[rawHeader] !== undefined) {
      normalized[canonicalKey] = rawRow[rawHeader];
    }
  }

  // Generate fallback customer_id if missing
  if (!normalized.customer_id) {
    if (normalized.customer_email) {
      normalized.customer_id = 'cust_' + normalized.customer_email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '_');
    } else if (normalized.customer_name) {
      normalized.customer_id = 'cust_' + normalized.customer_name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_').substring(0, 15);
    } else {
      normalized.customer_id = `cust_row_${rowIndex + 1}`;
      normalized._warnings.push('Generated fallback Customer ID');
    }
  }

  // Customer Name
  if (!normalized.customer_name) {
    if (normalized.customer_email) {
      const prefix = normalized.customer_email.split('@')[0];
      normalized.customer_name = prefix.charAt(0).toUpperCase() + prefix.slice(1).replace(/[._]/g, ' ');
    } else {
      normalized.customer_name = `Customer #${normalized.customer_id.replace('cust_', '').substring(0, 8)}`;
    }
  }

  // Customer Email
  if (!normalized.customer_email) {
    normalized.customer_email = `${normalized.customer_id.toLowerCase()}@example.com`;
  }

  // Amount parsing (handles currency symbols, commas, decimals, converts to paise)
  let rawAmount = normalized.amount;
  if (rawAmount !== undefined && rawAmount !== null && rawAmount !== '') {
    const cleanedAmount = String(rawAmount).replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleanedAmount);
    if (!isNaN(num) && num > 0) {
      normalized.amount = Math.round(num * 100);
      normalized.amount_in_rupees = num;
    } else {
      normalized.amount = 150000;
      normalized.amount_in_rupees = 1500;
      normalized._warnings.push('Invalid amount formatted; used default ₹1,500');
    }
  } else {
    normalized.amount = 250000;
    normalized.amount_in_rupees = 2500;
    normalized._warnings.push('Missing amount; used standard ₹2,500');
  }

  // Plan / Segment
  let segment = (normalized.customer_segment || '').toLowerCase();
  if (['enterprise', 'growth', 'starter'].includes(segment)) {
    normalized.customer_segment = segment;
  } else if (segment.includes('enter') || segment.includes('vip') || segment.includes('tier1')) {
    normalized.customer_segment = 'enterprise';
  } else if (segment.includes('grow') || segment.includes('pro') || segment.includes('plus')) {
    normalized.customer_segment = 'growth';
  } else {
    if (normalized.amount_in_rupees >= 30000) normalized.customer_segment = 'enterprise';
    else if (normalized.amount_in_rupees >= 10000) normalized.customer_segment = 'growth';
    else normalized.customer_segment = 'starter';
  }

  // LTV & MRR
  if (normalized.lifetime_value) {
    const num = parseFloat(String(normalized.lifetime_value).replace(/[^0-9.-]/g, ''));
    normalized.lifetime_value = isNaN(num) ? normalized.amount * 5 : Math.round(num * 100);
  } else {
    const mult = normalized.customer_segment === 'enterprise' ? 12 : normalized.customer_segment === 'growth' ? 8 : 4;
    normalized.lifetime_value = normalized.amount * mult;
  }

  if (normalized.mrr) {
    const num = parseFloat(String(normalized.mrr).replace(/[^0-9.-]/g, ''));
    normalized.mrr = isNaN(num) ? normalized.amount : Math.round(num * 100);
  } else {
    normalized.mrr = normalized.amount;
  }

  // Discount Affinity (0.0 to 1.0)
  if (normalized.discount_affinity !== undefined && normalized.discount_affinity !== '') {
    let aff = parseFloat(String(normalized.discount_affinity).replace(/[^0-9.-]/g, ''));
    if (!isNaN(aff)) {
      if (aff > 1.0 && aff <= 100.0) aff = aff / 100.0;
      normalized.discount_affinity = Math.max(0.0, Math.min(1.0, aff));
    } else {
      normalized.discount_affinity = 0.5;
    }
  } else {
    normalized.discount_affinity = normalized.customer_segment === 'starter' ? 0.65 : normalized.customer_segment === 'growth' ? 0.45 : 0.20;
  }

  // Historical payments
  const succ = parseInt(String(normalized.previous_successful_payments || '12'), 10);
  const fail = parseInt(String(normalized.previous_failed_payments || '1'), 10);
  normalized.previous_successful_payments = isNaN(succ) ? 10 : succ;
  normalized.previous_failed_payments = isNaN(fail) ? 1 : fail;

  // Failure Reason Normalization
  let reason = (normalized.failure_reason || '').toLowerCase().trim();
  const status = (normalized.payment_status || normalized.checkout_status || normalized.invoice_status || '').toLowerCase().trim();

  if (!reason) {
    if (status.includes('abandon')) reason = 'checkout_abandoned';
    else if (status.includes('time')) reason = 'payment_timed_out';
    else if (status.includes('overdue')) reason = 'invoice_overdue';
    else if (status.includes('expire')) reason = 'card_expired';
    else if (status.includes('fail') || status.includes('decline')) reason = 'card_declined';
    else reason = 'insufficient_funds';
  } else {
    if (reason.includes('insufficient') || reason.includes('funds') || reason.includes('low_balance')) reason = 'insufficient_funds';
    else if (reason.includes('timeout') || reason.includes('timed_out')) reason = 'payment_timed_out';
    else if (reason.includes('gateway') || reason.includes('500') || reason.includes('502')) reason = 'gateway_error';
    else if (reason.includes('bank') || reason.includes('down')) reason = 'bank_server_down';
    else if (reason.includes('network') || reason.includes('connection')) reason = 'network_error';
    else if (reason.includes('auth') || reason.includes('otp') || reason.includes('3ds')) reason = 'authentication_failed';
    else if (reason.includes('cancel') || reason.includes('cancelled')) reason = 'payment_cancelled';
    else if (reason.includes('expire') || reason.includes('expired')) reason = 'card_expired';
    else if (reason.includes('abandon') || reason.includes('cart')) reason = 'checkout_abandoned';
    else if (reason.includes('invoice') || reason.includes('overdue') || reason.includes('unpaid')) reason = 'invoice_overdue';
    else if (reason.includes('sub') || reason.includes('renewal')) reason = 'subscription_failed';
    else if (reason.includes('invalid') || reason.includes('not_allowed')) reason = 'invalid_card';
    else if (reason.includes('decline')) reason = 'card_declined';
  }
  normalized.failure_reason = reason;

  // Payment Method
  let method = (normalized.payment_method || 'card').toLowerCase();
  if (method.includes('upi')) method = 'upi';
  else if (method.includes('net') || method.includes('bank')) method = 'netbanking';
  else if (method.includes('ach') || method.includes('wire')) method = 'wire';
  else method = 'card';
  normalized.payment_method = method;

  // Retry count
  const retries = parseInt(String(normalized.retry_count || '0'), 10);
  normalized.retry_count = isNaN(retries) ? 0 : retries;

  // Opted out
  const opt = String(normalized.opted_out || '0').toLowerCase();
  normalized.opted_out = (opt === '1' || opt === 'true' || opt === 'yes') ? 1 : 0;

  return normalized;
}

/**
 * Validates and analyzes parsed dataset before execution
 */
export function analyzeDatasetSummary(normalizedRows) {
  let totalVolume = 0;
  let revenueAtRisk = 0;
  let failedPaymentsCount = 0;
  let abandonedCheckoutsCount = 0;
  let overdueInvoicesCount = 0;
  const uniqueCustomers = new Set();
  const failureReasonCounts = {};
  const segmentCounts = {};

  for (const row of normalizedRows) {
    uniqueCustomers.add(row.customer_id);
    totalVolume += row.amount;

    const reason = row.failure_reason || '';
    if (reason === 'checkout_abandoned' || reason === 'checkout_timeout') {
      abandonedCheckoutsCount++;
      revenueAtRisk += row.amount;
    } else if (reason === 'invoice_overdue') {
      overdueInvoicesCount++;
      revenueAtRisk += row.amount;
    } else {
      failedPaymentsCount++;
      revenueAtRisk += row.amount;
    }

    failureReasonCounts[reason] = (failureReasonCounts[reason] || 0) + 1;
    const seg = row.customer_segment || 'starter';
    segmentCounts[seg] = (segmentCounts[seg] || 0) + 1;
  }

  return {
    totalRecords: normalizedRows.length,
    uniqueCustomerCount: uniqueCustomers.size,
    totalVolume,
    revenueAtRisk,
    failedPaymentsCount,
    abandonedCheckoutsCount,
    overdueInvoicesCount,
    recordsRequiringIntervention: normalizedRows.length,
    failureReasonCounts,
    segmentCounts
  };
}
