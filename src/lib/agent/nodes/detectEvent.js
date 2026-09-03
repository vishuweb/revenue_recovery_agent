/**
 * detect_event — entry node.
 * Validates the normalized event already attached to state and stamps the
 * detection timestamp. The actual normalization (webhook vs simulator ->
 * common shape) happens once, before the graph runs, in eventNormalizer.js.
 */
export async function detectEvent(state) {
  const { event } = state;
  if (!event || !event.eventType) {
    throw new Error('detect_event: state.event is missing or malformed (expected a NormalizedEvent)');
  }

  return {
    failure_reason: event.failureReason || null,
    amount_at_risk: event.amount || 0,
    timestamps: { detectedAt: new Date().toISOString() },
    audit_trail: [{ phase: 'detect_event', at: new Date().toISOString(), summary: `Detected ${event.eventType} for payment ${event.paymentId || 'n/a'}` }],
  };
}
