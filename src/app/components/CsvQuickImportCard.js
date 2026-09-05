'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '../page';
import { useToast } from './ToastContext';
import { IconRefresh, IconChevronRight, IconWarning, IconSuccess } from './Icons';

const HINT_DISMISSED_KEY = 'recovr_csv_hint_dismissed';

/**
 * Compact CSV import card for the simulator page. Reuses the existing
 * dataset APIs end to end (/api/dataset/parse, /api/dataset/run) — no
 * duplicated validation or agent logic lives in this component.
 */
export function CsvQuickImportCard() {
  const router = useRouter();
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [stage, setStage] = useState('idle'); // idle | parsing | preview | running | done | error
  const [csvText, setCsvText] = useState(null);
  const [filename, setFilename] = useState(null);
  const [parseResult, setParseResult] = useState(null);
  const [runResult, setRunResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(HINT_DISMISSED_KEY)) setShowHint(true);
    } catch { /* localStorage unavailable — skip the hint, not critical */ }
  }, []);

  function dismissHint() {
    setShowHint(false);
    try { localStorage.setItem(HINT_DISMISSED_KEY, '1'); } catch { /* ignore */ }
  }

  async function handleFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Only .csv files are accepted');
      return;
    }
    dismissHint();
    setStage('parsing');
    setErrorMsg(null);
    try {
      const text = await file.text();
      setCsvText(text);
      setFilename(file.name);
      const res = await fetch('/api/dataset/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText: text, filename: file.name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to parse CSV');
      setParseResult(json);
      setStage('preview');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to read/parse the file');
      setStage('error');
    }
  }

  async function runAgent() {
    setStage('running');
    toast.info('Processing revenue events through the recovery agent...');
    try {
      const res = await fetch('/api/dataset/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvText, filename, datasetName: filename,
          columnMapping: parseResult?.suggestedMapping,
          skipInvalidRows: (parseResult?.validation?.summary?.invalidRows || 0) > 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Dataset run failed');
      setRunResult(json);
      setStage('done');
      toast.success(`Processed ${json.metrics?.totalRecords || 0} events — ${formatCurrency(json.metrics?.recoveredAmount)} recovered`);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to run the dataset through the agent');
      setStage('error');
    }
  }

  function reset() {
    setStage('idle'); setCsvText(null); setFilename(null);
    setParseResult(null); setRunResult(null); setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="card" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div>
          <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff', margin: 0 }}>📄 Revenue Recovery Dataset</h4>
          <p style={{ fontSize: '11.5px', color: '#8e9ba9', margin: '2px 0 0' }}>Upload recovery events and let the AI agent process them.</p>
        </div>
        <span className="badge muted" style={{ fontSize: '9.5px' }}>Sample Dataset</span>
      </div>

      {stage === 'idle' && (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            <a href="/api/dataset/sample" className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center' }}>
              <span>↓ Download Sample CSV</span>
            </a>
          </div>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFile(e.dataTransfer.files?.[0]); }}
            style={{
              border: `1.5px dashed ${dragActive ? '#00FFF5' : '#3B3E47'}`,
              borderRadius: '8px', padding: '18px 12px', textAlign: 'center', cursor: 'pointer',
              background: dragActive ? 'rgba(0,255,245,0.05)' : 'transparent', transition: 'all 0.15s',
            }}
          >
            <div style={{ fontSize: '12.5px', color: '#cbd5e1', fontWeight: 600 }}>↑ Upload CSV</div>
            <div style={{ fontSize: '11px', color: '#5f6d7e', marginTop: '2px' }}>Drag & drop or click to browse — .csv only</div>
            <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files?.[0])} />
          </div>

          {showHint && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '11.5px', color: '#00FFF5' }}>
              <span aria-hidden="true" className="csv-hint-hand">👋</span>
              <span>Try the sample dataset →</span>
              <button onClick={dismissHint} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#5f6d7e', cursor: 'pointer', fontSize: '11px' }}>Dismiss</button>
            </div>
          )}
        </>
      )}

      {stage === 'parsing' && (
        <div style={{ textAlign: 'center', padding: '16px', fontSize: '12.5px', color: '#8e9ba9' }}>Validating {filename}...</div>
      )}

      {stage === 'preview' && parseResult && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            {parseResult.validation?.valid ? <IconSuccess size={14} color="#00FFF5" /> : <IconWarning size={14} color="#fbbf24" />}
            <strong style={{ fontSize: '12.5px', color: '#fff' }}>CSV Validation {parseResult.validation?.valid ? 'Passed' : 'Found Issues'}</strong>
          </div>
          <div style={{ fontSize: '12px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '10px' }}>
            <span>Rows: <strong style={{ color: '#fff' }}>{parseResult.validation?.summary?.totalRows}</strong></span>
            <span>Valid: <strong style={{ color: '#00FFF5' }}>{parseResult.validation?.summary?.validRows}</strong></span>
            {parseResult.validation?.summary?.invalidRows > 0 && (
              <span>Invalid: <strong style={{ color: '#fb7185' }}>{parseResult.validation.summary.invalidRows}</strong></span>
            )}
            <span>Revenue at risk: <strong style={{ color: '#fff' }}>{formatCurrency(parseResult.summary?.revenueAtRisk)}</strong></span>
            <span>Unique customers: <strong style={{ color: '#fff' }}>{parseResult.summary?.uniqueCustomerCount}</strong></span>
          </div>

          <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid #3B3E47', borderRadius: '6px', marginBottom: '10px' }}>
            <table style={{ width: '100%', fontSize: '10.5px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-elevated)' }}>
                  <th style={{ padding: '4px 6px', textAlign: 'left' }}>Customer</th>
                  <th style={{ padding: '4px 6px', textAlign: 'left' }}>Amount</th>
                  <th style={{ padding: '4px 6px', textAlign: 'left' }}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {parseResult.previewRows?.slice(0, 8).map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #232833' }}>
                    <td style={{ padding: '4px 6px', color: '#cbd5e1' }}>{r.customer_name}</td>
                    <td style={{ padding: '4px 6px', color: '#cbd5e1' }}>{formatCurrency(r.amount)}</td>
                    <td style={{ padding: '4px 6px', color: '#cbd5e1' }}>{r.failure_reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary btn-sm" onClick={reset} style={{ flex: 1 }}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={runAgent} style={{ flex: 1 }}>
              <span>Run Recovery Agent</span>
            </button>
          </div>
        </div>
      )}

      {stage === 'running' && (
        <div style={{ textAlign: 'center', padding: '20px 8px' }}>
          <div className="agent-spin-icon" style={{ fontSize: '22px', color: '#00FFF5', marginBottom: '8px' }}>⟳</div>
          <p style={{ fontSize: '12.5px', color: '#cbd5e1' }}>Processing revenue events through the LangGraph agent...</p>
          <p style={{ fontSize: '11px', color: '#5f6d7e', marginTop: '4px' }}>Each row runs the full detect → analyze → decide → policy → execute loop — this can take a few seconds for larger files.</p>
        </div>
      )}

      {stage === 'done' && runResult && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <IconSuccess size={14} color="#00FFF5" />
            <strong style={{ fontSize: '13px', color: '#fff' }}>Processing Complete</strong>
            <span className="badge muted" style={{ fontSize: '9px' }}>Simulated Recovery</span>
          </div>
          <div className="grid-cols-2" style={{ gap: '8px', marginBottom: '10px' }}>
            <div style={{ background: 'var(--surface-elevated)', borderRadius: '6px', padding: '8px 10px' }}>
              <div style={{ fontSize: '10px', color: '#8e9ba9' }}>Recovered</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#00FFF5' }}>{formatCurrency(runResult.metrics?.recoveredAmount)}</div>
            </div>
            <div style={{ background: 'var(--surface-elevated)', borderRadius: '6px', padding: '8px 10px' }}>
              <div style={{ fontSize: '10px', color: '#8e9ba9' }}>At Risk</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#fb7185' }}>{formatCurrency(runResult.metrics?.revenueAtRisk)}</div>
            </div>
            <div style={{ background: 'var(--surface-elevated)', borderRadius: '6px', padding: '8px 10px' }}>
              <div style={{ fontSize: '10px', color: '#8e9ba9' }}>Cases</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>{runResult.metrics?.totalRecords}</div>
            </div>
            <div style={{ background: 'var(--surface-elevated)', borderRadius: '6px', padding: '8px 10px' }}>
              <div style={{ fontSize: '10px', color: '#8e9ba9' }}>Recovery Rate</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>{runResult.metrics?.recoveryRate?.toFixed(1)}%</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary btn-sm" onClick={reset} style={{ flex: 1 }}>Import Another</button>
            {runResult.cases?.[0]?.caseId && (
              <button className="btn btn-primary btn-sm" onClick={() => router.push(`/cases/${runResult.cases[0].caseId}`)} style={{ flex: 1 }}>
                <span>View a Case</span><IconChevronRight size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      {stage === 'error' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fb7185', marginBottom: '6px' }}>
            <IconWarning size={14} /> <strong style={{ fontSize: '12.5px' }}>Import failed</strong>
          </div>
          <p style={{ fontSize: '11.5px', color: '#8e9ba9', marginBottom: '10px' }}>{errorMsg}</p>
          <button className="btn btn-secondary btn-sm" onClick={reset}>
            <IconRefresh size={13} /> <span>Retry</span>
          </button>
        </div>
      )}
    </div>
  );
}
