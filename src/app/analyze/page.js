'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency } from '../page';
import { ProbabilityBar } from '../components/Charts';
import { CustomerAvatar } from '../components/CustomerAvatar';
import { useToast } from '../components/ToastContext';
import {
  IconRupee,
  IconWarning,
  IconSuccess,
  IconTrendUp,
  IconTrendDown,
  IconRefresh,
  IconCases,
  IconDiscount,
  IconCopy,
  IconChevronRight,
  IconZap,
  IconShield,
  IconAnalytics,
  IconSearch,
  IconFilter,
  IconFile,
  IconUser,
  IconCard,
  IconInvoice,
  IconClock,
  IconCoins,
  IconClose
} from '../components/Icons';

export default function AnalyzePage() {
  const router = useRouter();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('upload');

  const [csvInput, setCsvInput] = useState('');
  const [fileName, setFileName] = useState('');
  const [selectedDemoId, setSelectedDemoId] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState(null);
  const [columnMapping, setColumnMapping] = useState({});

  const [executing, setExecuting] = useState(false);
  const [execProgress, setExecProgress] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [streamedCases, setStreamedCases] = useState([]);
  const [runResult, setRunResult] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [segmentFilter, setSegmentFilter] = useState('all');
  const [selectedCaseModal, setSelectedCaseModal] = useState(null);

  const [runHistory, setRunHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fileInputRef = useRef(null);

  const pipelineSteps = [
    { title: 'Customer Context & Historical Ingestion', desc: 'Loading customer payment history, LTV, MRR, and tenure...' },
    { title: 'Decline Classification & Root Cause Analysis', desc: 'Categorizing temporary vs permanent vs behavioral decline codes...' },
    { title: 'Multidimensional Risk & Priority Scoring', desc: 'Evaluating composite impact score and assigning P0-P3 tiers...' },
    { title: 'Predictive Multi-Factor Recovery Probability', desc: 'Computing decay rates, elasticity, and likelihood of settlement...' },
    { title: 'Action Candidate Formulation', desc: 'Synthesizing tailored interventions (retry delay, payment link, discount, escalation)...' },
    { title: 'Guardrails & Business Policy Verification', desc: 'Checking max attempts, margin protection, 10% discount cap, opt-outs...' },
    { title: 'Autonomous Execution & Settlement Simulation', desc: 'Simulating gateway retry pulses and self-serve link dispatch...' },
    { title: 'Adaptive Affinity Calibration & Audit Logging', desc: 'Updating customer discount propensity and recording immutable audit entries...' }
  ];

  const fetchRunHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/dataset/runs');
      if (res.ok) {
        const data = await res.json();
        setRunHistory(data.runs || []);
      }
    } catch {
      toast.error('Failed to load dataset run history');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchRunHistory();
    }
  }, [activeTab]);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      toast.error('Please upload a valid .csv file');
      return;
    }

    setFileName(file.name);
    setSelectedDemoId('');
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      setCsvInput(text || '');
      triggerParse(text, null, file.name);
    };
    reader.readAsText(file);
  };

  const triggerParse = async (text, demoId = null, name = 'custom_dataset.csv') => {
    setParsing(true);
    toast.info('Parsing dataset headers and inferring schema...');
    try {
      const res = await fetch('/api/dataset/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText: text, demoId, filename: name })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to parse CSV');

      setParseResult(data);
      setColumnMapping(data.suggestedMapping || {});
      setFileName(data.filename);
      toast.success(`Detected ${data.totalRawRows} records! Schema: ${data.archetype.label}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setParsing(false);
    }
  };

  const handleSelectDemo = (demoId, demoName) => {
    setSelectedDemoId(demoId);
    setFileName(`${demoId}.csv`);
    triggerParse(null, demoId, `${demoName}.csv`);
  };

  const handleMappingChange = (csvHeader, canonicalField) => {
    setColumnMapping((prev) => ({
      ...prev,
      [csvHeader]: canonicalField || null
    }));
  };

  const handleRunPipeline = async () => {
    if (!parseResult) {
      toast.error('Please upload or select a dataset first.');
      return;
    }

    setExecuting(true);
    setActiveTab('execution');
    setExecProgress(5);
    setCurrentStepIndex(0);
    setStreamedCases([]);

    let currentStep = 0;
    const stepInterval = setInterval(() => {
      currentStep++;
      if (currentStep < pipelineSteps.length) {
        setCurrentStepIndex(currentStep);
        setExecProgress(Math.min(90, Math.round((currentStep / pipelineSteps.length) * 85)));
      }
    }, 450);

    try {
      const res = await fetch('/api/dataset/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvText: csvInput,
          demoId: selectedDemoId || undefined,
          columnMapping,
          datasetName: fileName || 'Custom Business Dataset',
          filename: fileName
        })
      });

      const data = await res.json();
      clearInterval(stepInterval);

      if (!res.ok) throw new Error(data.error || 'Engine execution failed');

      setExecProgress(100);
      setCurrentStepIndex(pipelineSteps.length - 1);
      setRunResult(data);

      const allCases = data.cases || [];
      const batchSize = Math.max(1, Math.floor(allCases.length / 8));
      let idx = 0;

      const caseStreamInterval = setInterval(() => {
        idx += batchSize;
        setStreamedCases(allCases.slice(0, idx));
        if (idx >= allCases.length) {
          clearInterval(caseStreamInterval);
          setExecuting(false);
          setActiveTab('results');
          toast.success(`Pipeline Execution Completed! Recovered ${formatCurrency(data.metrics.recoveredAmount)} (${data.metrics.recoveryRate}% rate)`);
        }
      }, 80);

    } catch (err) {
      clearInterval(stepInterval);
      setExecuting(false);
      toast.error(`Execution failed: ${err.message}`);
    }
  };

  const handleDownloadSample = () => {
    const sampleCsv = `customer_id,customer_name,email,company,plan,amount,payment_method,failure_reason,retry_count,previous_successful_payments,previous_failed_payments,discount_affinity
cust_101,Vikram Sharma,vikram@acmecorp.com,Acme Corp,enterprise,120000,card,gateway_error,0,18,0,0.15
cust_102,Priya Patel,priya@designhub.io,DesignHub,growth,45000,card,insufficient_funds,1,12,1,0.40
cust_103,Amit Singh,amit@techstack.in,TechStack,starter,8500,upi,payment_timed_out,0,8,0,0.70
cust_104,Neha Rao,neha@retailflow.co,RetailFlow,enterprise,210000,card,bank_server_down,0,24,0,0.10
cust_105,Karan Gupta,karan@cloudscale.net,CloudScale,growth,38000,card,card_expired,0,9,2,0.50
cust_106,Swati Verma,swati@growthpulse.ai,GrowthPulse,starter,6200,upi,checkout_abandoned,0,5,1,0.85`;

    const blob = new Blob([sampleCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'recovr_sample_dataset.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Sample CSV template downloaded');
  };

  const filteredCases = runResult?.cases?.filter((c) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = c.customerName?.toLowerCase().includes(q);
      const matchEmail = c.customerEmail?.toLowerCase().includes(q);
      const matchCompany = c.customerCompany?.toLowerCase().includes(q);
      const matchReason = c.failureReason?.toLowerCase().includes(q);
      if (!matchName && !matchEmail && !matchCompany && !matchReason) return false;
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'recovered' && c.status !== 'recovered') return false;
      if (statusFilter === 'open' && c.status !== 'open') return false;
      if (statusFilter === 'stopped' && c.status !== 'stopped') return false;
    }

    if (actionFilter !== 'all') {
      if (c.recommendedAction !== actionFilter) return false;
    }

    if (segmentFilter !== 'all') {
      if (c.segment !== segmentFilter) return false;
    }

    return true;
  });

  return (
    <div className="animate-fade-in">
      <div className="dashboard-hero">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            Interactive Engine Evaluation
          </div>
          <h1 className="hero-title">
            Run Your <em>Business Dataset</em>
          </h1>
          <p className="hero-subtitle">
            Upload your custom payment decline or cart dropoff dataset. Watch the autonomous engine classify failure codes, formulate customer-specific recovery strategies, enforce business guardrails, and calculate verified financial yield.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary btn-sm" onClick={handleDownloadSample}>
            <IconFile size={14} />
            <span>Sample Template</span>
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'history' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('history')}
          >
            <IconClock size={14} />
            <span>Run History ({runHistory.length})</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', background: 'rgba(0,0,0,0.3)', padding: '6px', borderRadius: '10px' }}>
        <button
          onClick={() => setActiveTab('upload')}
          style={{
            flex: 1,
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'upload' ? 'var(--primary-accent)' : 'transparent',
            color: activeTab === 'upload' ? '#fff' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          <IconFile size={15} />
          <span>1. Ingest & Map Columns</span>
          {parseResult && (
            <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.2)', padding: '1px 6px', borderRadius: '10px' }}>
              {parseResult.totalRawRows} rows
            </span>
          )}
        </button>

        <button
          onClick={() => {
            if (!parseResult) toast.warning('Upload or select a dataset first.');
            else setActiveTab('execution');
          }}
          style={{
            flex: 1,
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'execution' ? 'var(--primary-accent)' : 'transparent',
            color: activeTab === 'execution' ? '#fff' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: '13px',
            cursor: parseResult ? 'pointer' : 'not-allowed',
            opacity: parseResult ? 1 : 0.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          <IconZap size={15} />
          <span>2. Live Engine Execution</span>
          {executing && <span className="status-dot" style={{ background: '#60a5fa' }} />}
        </button>

        <button
          onClick={() => {
            if (!runResult) toast.warning('Run the pipeline first to view results.');
            else setActiveTab('results');
          }}
          style={{
            flex: 1,
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'results' ? 'var(--primary-accent)' : 'transparent',
            color: activeTab === 'results' ? '#fff' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: '13px',
            cursor: runResult ? 'pointer' : 'not-allowed',
            opacity: runResult ? 1 : 0.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          <IconAnalytics size={15} />
          <span>3. Recovery Yield & Funnel</span>
          {runResult && (
            <span style={{ fontSize: '10px', background: 'rgba(52, 211, 153, 0.25)', color: '#34d399', padding: '1px 6px', borderRadius: '10px', fontWeight: 700 }}>
              {runResult.metrics?.recoveryRate}%
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('history')}
          style={{
            flex: 1,
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'history' ? 'var(--primary-accent)' : 'transparent',
            color: activeTab === 'history' ? '#fff' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          <IconClock size={15} />
          <span>4. Run History</span>
        </button>
      </div>

      {activeTab === 'upload' && (
        <div>
          <div className="card" style={{ marginBottom: '20px', padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <IconZap size={16} color="#60a5fa" />
                  <span>Try 1-Click Judge Datasets</span>
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                  Pre-configured realistic enterprise scenarios with real bank decline codes and customer behaviors.
                </p>
              </div>
            </div>

            <div className="grid-cols-4" style={{ gap: '10px' }}>
              {[
                { id: 'saas_subscriptions', title: 'SaaS Subscriptions', badge: '120 Records • B2B', risk: '₹28.4L', desc: 'Recurring card declines, bank downtime, expired cards' },
                { id: 'ecommerce_dropoffs', title: 'E-Commerce Dropoffs', badge: '90 Records • High LTV', risk: '₹14.2L', desc: 'Cart abandonments, price sensitivity, checkout timeouts' },
                { id: 'b2b_invoices', title: 'Overdue Invoices', badge: '110 Records • Invoicing', risk: '₹62.5L', desc: 'Delayed corporate receivables, payment links, dispute triage' },
                { id: 'mixed_gateways', title: 'Fintech Gateway Mix', badge: '150 Records • Multi-Rail', risk: '₹34.6L', desc: 'Razorpay, UPI timeouts, OTP failures, card declines' }
              ].map((d) => (
                <div
                  key={d.id}
                  onClick={() => handleSelectDemo(d.id, d.title)}
                  style={{
                    background: selectedDemoId === d.id ? 'rgba(59, 130, 246, 0.15)' : 'var(--surface-color)',
                    border: `1px solid ${selectedDemoId === d.id ? '#3b82f6' : 'var(--glass-border)'}`,
                    borderRadius: '8px',
                    padding: '12px',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>{d.title}</span>
                    <span className="badge muted" style={{ fontSize: '10px' }}>{d.badge}</span>
                  </div>
                  <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', margin: '0 0 8px 0', lineHeight: 1.4 }}>{d.desc}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                    <span style={{ color: 'var(--text-dim)' }}>Vol at Risk:</span>
                    <span className="font-mono" style={{ color: '#fb7185', fontWeight: 700 }}>{d.risk}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid-cols-2" style={{ marginBottom: '20px' }}>
            <div
              className="card"
              style={{
                border: '2px dashed var(--glass-border)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '36px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'rgba(255,255,255,0.01)'
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept=".csv,text/csv"
                onChange={handleFileUpload}
              />
              <div className="stat-icon-wrapper" style={{ width: '48px', height: '48px', marginBottom: '12px' }}>
                <IconFile size={24} color="#60a5fa" />
              </div>
              <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {fileName ? fileName : 'Upload Custom Business CSV'}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '320px', marginTop: '4px' }}>
                Drag and drop your spreadsheet here or click to browse. Handles custom column names automatically.
              </p>
              <span className="badge primary" style={{ marginTop: '10px' }}>
                Supports up to 5MB CSV
              </span>
            </div>

            <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-header" style={{ paddingBottom: '8px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Or Paste Raw CSV Data</h4>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => triggerParse(csvInput, null, 'pasted_data.csv')}
                  disabled={parsing || !csvInput.trim()}
                >
                  <IconRefresh size={13} />
                  <span>Parse Text</span>
                </button>
              </div>
              <textarea
                className="input font-mono"
                style={{ flex: 1, minHeight: '120px', resize: 'vertical', fontSize: '11.5px' }}
                placeholder="customer_id,name,amount,failure_reason&#10;cust_01,Rohan Verma,14500,insufficient_funds&#10;cust_02,Priya Sharma,42000,card_expired"
                value={csvInput}
                onChange={(e) => setCsvInput(e.target.value)}
              />
            </div>
          </div>

          {parseResult && (
            <div className="card card-elevated" style={{ marginBottom: '20px' }}>
              <div className="card-header">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 className="card-title">
                      <IconShield size={16} color="#60a5fa" />
                      <span>Dataset Schema & Column Mapping</span>
                    </h3>
                    <span className="badge success">{parseResult.archetype?.label}</span>
                  </div>
                  <p className="card-subtitle">{parseResult.archetype?.description}</p>
                </div>

                <button
                  className="btn btn-primary"
                  onClick={handleRunPipeline}
                  disabled={executing}
                  style={{ padding: '8px 20px', fontSize: '13.5px', fontWeight: 700 }}
                >
                  <IconZap size={16} />
                  <span>Run Recovery Engine ({parseResult.totalRawRows} Cases) →</span>
                </button>
              </div>

              <div className="grid-cols-4" style={{ marginBottom: '18px', background: 'var(--surface-color)', padding: '14px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Records Ingested</div>
                  <div className="font-mono" style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                    {parseResult.totalRawRows}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Across {parseResult.summary?.uniqueCustomerCount} unique accounts</div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Volume Represented</div>
                  <div className="font-mono" style={{ fontSize: '20px', fontWeight: 700, color: '#93c5fd', marginTop: '2px' }}>
                    {formatCurrency(parseResult.summary?.totalVolume)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Gross pipeline revenue</div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Revenue At Risk</div>
                  <div className="font-mono" style={{ fontSize: '20px', fontWeight: 700, color: '#fb7185', marginTop: '2px' }}>
                    {formatCurrency(parseResult.summary?.revenueAtRisk)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Payment failures & dropoffs</div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Actionable Intervention Queue</div>
                  <div className="font-mono" style={{ fontSize: '20px', fontWeight: 700, color: '#fbbf24', marginTop: '2px' }}>
                    {parseResult.summary?.recordsRequiringIntervention}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Eligible for recovery strategy</div>
                </div>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Column Mapping & Canonical Field Resolution
                </div>
                <div className="table-container" style={{ maxHeight: '220px', overflowY: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Uploaded CSV Column</th>
                        <th>Sample Values</th>
                        <th>Mapped Canonical Engine Field</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parseResult.columnAnalysis?.map((col) => {
                        const mappedField = columnMapping[col.header];
                        return (
                          <tr key={col.header}>
                            <td>
                              <span className="font-mono" style={{ fontWeight: 600, color: '#93c5fd' }}>
                                {col.header}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontSize: '11.5px', color: 'var(--text-dim)' }}>
                                {col.sampleValues?.slice(0, 2).join(', ') || '—'}
                              </span>
                            </td>
                            <td>
                              <select
                                className="select"
                                style={{ width: '240px', fontSize: '12px', padding: '4px 8px' }}
                                value={mappedField || ''}
                                onChange={(e) => handleMappingChange(col.header, e.target.value)}
                              >
                                <option value="">— Ignore / Unmapped —</option>
                                <optgroup label="Core Identifiers & Risk">
                                  <option value="amount">Amount / Transaction Value *</option>
                                  <option value="failure_reason">Failure / Decline Reason</option>
                                  <option value="payment_status">Payment Status</option>
                                  <option value="payment_method">Payment Method / Rail</option>
                                  <option value="retry_count">Retry / Attempt Count</option>
                                </optgroup>
                                <optgroup label="Customer Portfolio">
                                  <option value="customer_id">Customer ID</option>
                                  <option value="customer_name">Customer Name</option>
                                  <option value="customer_email">Customer Email</option>
                                  <option value="customer_company">Company Name</option>
                                  <option value="customer_segment">Plan / Customer Segment</option>
                                  <option value="lifetime_value">Lifetime Value (LTV)</option>
                                  <option value="mrr">MRR / Subscription Amount</option>
                                  <option value="discount_affinity">Discount Affinity (0-1)</option>
                                  <option value="previous_successful_payments">Prior Successful Payments</option>
                                  <option value="previous_failed_payments">Prior Failed Payments</option>
                                </optgroup>
                                <optgroup label="Events & Invoices">
                                  <option value="checkout_status">Checkout Status / Abandoned</option>
                                  <option value="invoice_status">Invoice Status</option>
                                  <option value="invoice_age">Invoice Age (Days Overdue)</option>
                                </optgroup>
                              </select>
                            </td>
                            <td>
                              {mappedField ? (
                                <span className="badge success" style={{ fontSize: '10.5px' }}>
                                  ✓ Auto-Mapped
                                </span>
                              ) : (
                                <span className="badge muted" style={{ fontSize: '10.5px' }}>
                                  Optional / Skipped
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Normalized Ingestion Preview (First {parseResult.previewRows?.length} Rows)
                </div>
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Segment</th>
                        <th>Amount</th>
                        <th>Decline Code</th>
                        <th>LTV</th>
                        <th>Past Successes</th>
                        <th>Discount Affinity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parseResult.previewRows?.map((r, i) => (
                        <tr key={i}>
                          <td>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.customer_name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{r.customer_email}</div>
                          </td>
                          <td>
                            <span className="badge primary" style={{ fontSize: '10.5px' }}>{r.customer_segment}</span>
                          </td>
                          <td>
                            <span className="font-mono" style={{ fontWeight: 600, color: '#fb7185' }}>
                              {formatCurrency(r.amount)}
                            </span>
                          </td>
                          <td>
                            <span className="badge warning" style={{ fontSize: '10.5px' }}>
                              {r.failure_reason?.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="font-mono">{formatCurrency(r.lifetime_value)}</td>
                          <td>{r.previous_successful_payments} orders</td>
                          <td>{Math.round((r.discount_affinity || 0.5) * 100)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'execution' && (
        <div>
          <div className="card card-elevated" style={{ marginBottom: '20px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <span className="eyebrow">
                  <span className="eyebrow-dot" />
                  Autonomous Pipeline Telemetry
                </span>
                <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '4px 0 0 0', color: 'var(--text-primary)' }}>
                  Processing {parseResult?.totalRawRows || 0} Revenue-Risk Events...
                </h2>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="font-mono" style={{ fontSize: '26px', fontWeight: 800, color: '#60a5fa' }}>
                  {execProgress}%
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                  {streamedCases.length} / {parseResult?.totalRawRows || 0} analyzed
                </div>
              </div>
            </div>

            <div style={{ height: '8px', width: '100%', background: 'rgba(255,255,255,0.08)', borderRadius: '9999px', overflow: 'hidden', marginBottom: '24px' }}>
              <div
                style={{
                  height: '100%',
                  width: `${execProgress}%`,
                  background: 'linear-gradient(90deg, #3b82f6 0%, #34d399 100%)',
                  transition: 'width 0.3s ease-in-out'
                }}
              />
            </div>

            <div className="grid-cols-2" style={{ gap: '12px' }}>
              {pipelineSteps.map((step, idx) => {
                const isCompleted = idx < currentStepIndex || execProgress === 100;
                const isCurrent = idx === currentStepIndex && execProgress < 100;
                return (
                  <div
                    key={idx}
                    style={{
                      background: isCurrent ? 'rgba(59, 130, 246, 0.12)' : isCompleted ? 'rgba(52, 211, 153, 0.08)' : 'var(--surface-color)',
                      border: `1px solid ${isCurrent ? '#3b82f6' : isCompleted ? 'rgba(52, 211, 153, 0.3)' : 'var(--glass-border)'}`,
                      borderRadius: '8px',
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px'
                    }}
                  >
                    <div style={{ marginTop: '2px' }}>
                      {isCompleted ? (
                        <IconSuccess size={16} color="#34d399" />
                      ) : isCurrent ? (
                        <IconRefresh size={16} color="#60a5fa" className="spin" />
                      ) : (
                        <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '1px solid var(--text-dim)' }} />
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: '12.5px', fontWeight: 700, color: isCurrent ? '#93c5fd' : isCompleted ? 'var(--text-primary)' : 'var(--text-dim)' }}>
                        {step.title}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {step.desc}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <IconZap size={16} color="#60a5fa" />
                <span>Live Decision Stream</span>
              </h3>
              <span className="badge primary">{streamedCases.length} decisions formulated</span>
            </div>

            <div className="grid-cols-3" style={{ maxHeight: '380px', overflowY: 'auto' }}>
              {streamedCases.slice(0, 12).map((c) => (
                <div
                  key={c.caseId}
                  style={{
                    background: 'var(--surface-color)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '8px',
                    padding: '12px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{c.customerName}</span>
                    <span className="font-mono" style={{ fontSize: '12px', fontWeight: 700, color: '#fb7185' }}>
                      {formatCurrency(c.amountAtRisk)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                    <span className="badge muted" style={{ fontSize: '10px' }}>{c.failureReason?.replace('_', ' ')}</span>
                    <span className="badge primary" style={{ fontSize: '10px' }}>{c.recommendedAction}</span>
                  </div>

                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {c.aiReasoning?.substring(0, 85)}...
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'results' && runResult && (
        <div className="animate-fade-in">
          <div className="card card-elevated" style={{ marginBottom: '20px', padding: '24px', background: 'linear-gradient(180deg, rgba(16, 24, 39, 0.95) 0%, rgba(10, 14, 23, 0.98) 100%)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <span className="eyebrow">
                  <span className="eyebrow-dot" />
                  Verified Recovery Yield
                </span>
                <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '4px 0 0 0', color: 'var(--text-primary)' }}>
                  {runResult.runName}
                </h2>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Archetype: <strong style={{ color: '#93c5fd' }}>{runResult.datasetType?.label}</strong> • {runResult.metrics?.totalRecords} events analyzed
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setActiveTab('upload');
                    toast.info('Ready for next dataset upload.');
                  }}
                >
                  <IconRefresh size={14} />
                  <span>Test Another Dataset</span>
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr', alignItems: 'center', gap: '16px', background: 'var(--surface-color)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)', marginBottom: '20px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  BEFORE INTERVENTION
                </div>
                <div className="font-mono" style={{ fontSize: '26px', fontWeight: 800, color: '#fb7185', margin: '4px 0' }}>
                  {formatCurrency(runResult.metrics?.revenueAtRisk)}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                  100% Unrecovered Risk
                </div>
              </div>

              <div style={{ color: '#60a5fa', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <IconZap size={24} />
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>AI ENGINE</span>
              </div>

              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  AFTER RECOVERY
                </div>
                <div className="font-mono" style={{ fontSize: '26px', fontWeight: 800, color: '#34d399', margin: '4px 0' }}>
                  {formatCurrency(runResult.metrics?.recoveredAmount)}
                </div>
                <div style={{ fontSize: '12px', color: '#34d399', fontWeight: 600 }}>
                  {runResult.metrics?.recoveryRate}% Conversion Rate
                </div>
              </div>

              <div style={{ color: 'var(--text-dim)', fontSize: '18px' }}>=</div>

              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  NET RECOVERED PROFIT
                </div>
                <div className="font-mono" style={{ fontSize: '26px', fontWeight: 800, color: '#93c5fd', margin: '4px 0' }}>
                  {formatCurrency(runResult.metrics?.netRecovered)}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                  After {formatCurrency(runResult.metrics?.interventionCost)} concessions
                </div>
              </div>
            </div>

            <div className="grid-cols-4" style={{ gap: '12px' }}>
              <div className="card stat-card">
                <div className="stat-header">
                  <span className="stat-label">Interventions Executed</span>
                  <div className="stat-icon-wrapper">
                    <IconZap size={16} />
                  </div>
                </div>
                <span className="stat-value">{runResult.metrics?.interventionsCount}</span>
                <div className="stat-footer">
                  <span>Across {runResult.metrics?.uniqueCustomers} accounts</span>
                </div>
              </div>

              <div className="card stat-card">
                <div className="stat-header">
                  <span className="stat-label">Remaining Risk</span>
                  <div className="stat-icon-wrapper" style={{ color: '#fb7185', background: 'var(--danger-soft)' }}>
                    <IconWarning size={16} />
                  </div>
                </div>
                <span className="stat-value" style={{ color: '#fb7185' }}>
                  {formatCurrency(runResult.metrics?.remainingRisk)}
                </span>
                <div className="stat-footer">
                  <span>Unresolved / Hard stops</span>
                </div>
              </div>

              <div className="card stat-card">
                <div className="stat-header">
                  <span className="stat-label">Analyst Escalations</span>
                  <div className="stat-icon-wrapper">
                    <IconUser size={16} />
                  </div>
                </div>
                <span className="stat-value" style={{ color: '#fbbf24' }}>{runResult.metrics?.escalationsCount}</span>
                <div className="stat-footer">
                  <span>P0 High-LTV Accounts</span>
                </div>
              </div>

              <div className="card stat-card">
                <div className="stat-header">
                  <span className="stat-label">Hard Stops Enforced</span>
                  <div className="stat-icon-wrapper">
                    <IconShield size={16} />
                  </div>
                </div>
                <span className="stat-value">{runResult.metrics?.stoppedCount}</span>
                <div className="stat-footer">
                  <span>Guardrails bounded</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header">
              <div>
                <h3 className="card-title">
                  <IconAnalytics size={16} color="#60a5fa" />
                  <span>6-Stage Autonomous Recovery Funnel</span>
                </h3>
                <p className="card-subtitle">Exact progression of uploaded records through the decision pipeline</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px' }}>
              {[
                { stage: 'Uploaded Records', count: runResult.funnel?.uploadedRecords, color: '#94a3b8' },
                { stage: 'Revenue-Risk Events', count: runResult.funnel?.revenueRiskEvents, color: '#fb7185' },
                { stage: 'Eligible for Recovery', count: runResult.funnel?.eligibleForRecovery, color: '#fbbf24' },
                { stage: 'Agent Decisions', count: runResult.funnel?.agentDecisions, color: '#60a5fa' },
                { stage: 'Actions Executed', count: runResult.funnel?.actionsExecuted, color: '#818cf8' },
                { stage: 'Successful Recoveries', count: runResult.funnel?.successfulRecoveries, color: '#34d399' }
              ].map((f, i) => (
                <div
                  key={i}
                  style={{
                    background: 'var(--surface-color)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '8px',
                    padding: '14px 12px',
                    textAlign: 'center',
                    position: 'relative'
                  }}
                >
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', minHeight: '26px' }}>
                    {f.stage}
                  </div>
                  <div className="font-mono" style={{ fontSize: '22px', fontWeight: 800, color: f.color, margin: '6px 0' }}>
                    {f.count}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                    {i === 0 ? '100% of input' : `${Math.round((f.count / (runResult.funnel?.uploadedRecords || 1)) * 100)}% of total`}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">
                  <IconZap size={16} color="#60a5fa" />
                  <span>Case-by-Case Explainable Decision Explorer</span>
                </h3>
                <p className="card-subtitle">Click any individual case to inspect AI reasoning, guardrail checks, and audit history</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
              <div className="search-wrapper" style={{ flex: 1, minWidth: '240px' }}>
                <span className="search-icon-inside">
                  <IconSearch size={14} />
                </span>
                <input
                  type="text"
                  className="input search-input"
                  placeholder="Search customer, email, or decline reason..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <select className="select" style={{ width: '150px' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All Outcomes</option>
                <option value="recovered">Recovered</option>
                <option value="open">Open / In Progress</option>
                <option value="stopped">Policy Stopped</option>
              </select>

              <select className="select" style={{ width: '160px' }} value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
                <option value="all">All Actions</option>
                <option value="retry">Smart Retry</option>
                <option value="payment_link">Payment Link</option>
                <option value="discount">Courtesy Discount</option>
                <option value="cart_reminder">Cart Reminder</option>
                <option value="email">Personalized Email</option>
                <option value="escalate">Support Escalation</option>
              </select>

              <select className="select" style={{ width: '140px' }} value={segmentFilter} onChange={(e) => setSegmentFilter(e.target.value)}>
                <option value="all">All Segments</option>
                <option value="enterprise">Enterprise</option>
                <option value="growth">Growth</option>
                <option value="starter">Starter</option>
              </select>
            </div>

            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Priority</th>
                    <th>Customer Account</th>
                    <th>Amount At Risk</th>
                    <th>Decline Code</th>
                    <th>Recovery Probability</th>
                    <th>Prescribed Action</th>
                    <th>Policy & Guardrail</th>
                    <th>Outcome</th>
                    <th style={{ textAlign: 'right' }}>Audit</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCases?.map((c) => (
                    <tr
                      key={c.caseId}
                      onClick={() => setSelectedCaseModal(c)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <span
                          className={`badge ${c.priorityTier === 'critical' ? 'danger' : c.priorityTier === 'high' ? 'warning' : 'primary'}`}
                          style={{ fontSize: '10.5px' }}
                        >
                          {c.priorityTier?.toUpperCase()} • {Math.round(c.priorityScore)}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <CustomerAvatar name={c.customerName} size={28} />
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.customerName}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                              {c.customerCompany || c.customerEmail}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="font-mono" style={{ fontWeight: 700, color: '#fb7185' }}>
                          {formatCurrency(c.amountAtRisk)}
                        </span>
                      </td>
                      <td>
                        <span className="badge muted" style={{ fontSize: '10.5px' }}>
                          {c.failureReason?.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ width: '130px' }}>
                        <ProbabilityBar value={c.recoveryProbability} />
                      </td>
                      <td>
                        <span className="badge primary" style={{ fontSize: '11px' }}>
                          {c.recommendedAction}
                        </span>
                      </td>
                      <td>
                        {c.policyAdjusted ? (
                          <span className="badge warning" style={{ fontSize: '10px' }}>
                            Policy Clamped
                          </span>
                        ) : c.guardrailAllowed ? (
                          <span className="badge success" style={{ fontSize: '10px' }}>
                            ✓ Approved
                          </span>
                        ) : (
                          <span className="badge danger" style={{ fontSize: '10px' }}>
                            Blocked
                          </span>
                        )}
                      </td>
                      <td>
                        {c.status === 'recovered' ? (
                          <span className="font-mono" style={{ fontWeight: 700, color: '#34d399', fontSize: '12px' }}>
                            +{formatCurrency(c.recoveredAmount)}
                          </span>
                        ) : c.status === 'stopped' ? (
                          <span className="badge muted" style={{ fontSize: '10.5px' }}>Stopped</span>
                        ) : (
                          <span className="badge warning" style={{ fontSize: '10.5px' }}>Pending</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '3px 8px', fontSize: '11px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCaseModal(c);
                          }}
                        >
                          <span>Inspect →</span>
                        </button>
                      </td>
                    </tr>
                  ))}

                  {(!filteredCases || filteredCases.length === 0) && (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                        No cases matching selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">
                <IconClock size={16} color="#60a5fa" />
                <span>Dataset Run & Benchmark History</span>
              </h3>
              <p className="card-subtitle">Retrospective audit of historical dataset evaluations and recovery rates</p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={fetchRunHistory}>
              <IconRefresh size={14} />
              <span>Refresh</span>
            </button>
          </div>

          {loadingHistory ? (
            <div className="skeleton" style={{ height: '240px' }} />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Run Name / File</th>
                    <th>Archetype</th>
                    <th>Records</th>
                    <th>Revenue At Risk</th>
                    <th>Recovered Amount</th>
                    <th>Recovery Rate</th>
                    <th>Interventions</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {runHistory.map((run) => (
                    <tr key={run.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{run.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{run.filename || 'dataset.csv'}</div>
                      </td>
                      <td>
                        <span className="badge primary" style={{ fontSize: '10.5px' }}>{run.dataset_type}</span>
                      </td>
                      <td>{run.total_records} rows</td>
                      <td>
                        <span className="font-mono" style={{ color: '#fb7185', fontWeight: 600 }}>
                          {formatCurrency(run.revenue_at_risk)}
                        </span>
                      </td>
                      <td>
                        <span className="font-mono" style={{ color: '#34d399', fontWeight: 700 }}>
                          {formatCurrency(run.recovered_amount)}
                        </span>
                      </td>
                      <td>
                        <span className="badge success" style={{ fontWeight: 700 }}>
                          {run.recovery_rate}%
                        </span>
                      </td>
                      <td>{run.interventions_count} actions</td>
                      <td style={{ color: 'var(--text-dim)', fontSize: '11.5px' }}>
                        {new Date(run.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}

                  {runHistory.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                        No previous dataset runs logged. Upload your first dataset to generate benchmarks.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selectedCaseModal && (
        <div className="modal-overlay" onClick={() => setSelectedCaseModal(null)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '780px', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <CustomerAvatar name={selectedCaseModal.customerName} size={42} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                      {selectedCaseModal.customerName}
                    </h3>
                    <span className="badge primary">{selectedCaseModal.segment?.toUpperCase()}</span>
                    {selectedCaseModal.status === 'recovered' ? (
                      <span className="badge success">Recovered</span>
                    ) : selectedCaseModal.status === 'stopped' ? (
                      <span className="badge muted">Stopped</span>
                    ) : (
                      <span className="badge warning">Open</span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {selectedCaseModal.customerCompany} • {selectedCaseModal.customerEmail}
                  </div>
                </div>
              </div>

              <button
                className="btn btn-secondary btn-sm"
                style={{ padding: '4px 8px' }}
                onClick={() => setSelectedCaseModal(null)}
              >
                <IconClose size={16} />
              </button>
            </div>

            <div className="grid-cols-3" style={{ gap: '10px', marginBottom: '16px' }}>
              <div style={{ background: 'var(--surface-color)', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Amount At Risk</div>
                <div className="font-mono" style={{ fontSize: '18px', fontWeight: 800, color: '#fb7185', marginTop: '2px' }}>
                  {formatCurrency(selectedCaseModal.amountAtRisk)}
                </div>
              </div>

              <div style={{ background: 'var(--surface-color)', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Recovery Probability</div>
                <div className="font-mono" style={{ fontSize: '18px', fontWeight: 800, color: '#34d399', marginTop: '2px' }}>
                  {Math.round(selectedCaseModal.recoveryProbability * 100)}%
                </div>
              </div>

              <div style={{ background: 'var(--surface-color)', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Decline Reason</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#fbbf24', marginTop: '2px' }}>
                  {selectedCaseModal.failureReason?.replace('_', ' ')}
                </div>
              </div>
            </div>

            <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <div style={{ fontSize: '11px', color: '#93c5fd', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Prescribed Strategy: {selectedCaseModal.recommendedAction?.toUpperCase()}
                </div>
                {selectedCaseModal.discountPercent && (
                  <span className="badge warning" style={{ fontSize: '10.5px' }}>
                    {selectedCaseModal.discountPercent}% Discount Incentive
                  </span>
                )}
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--text-primary)', lineHeight: 1.5, margin: 0 }}>
                {selectedCaseModal.aiReasoning}
              </p>

              {selectedCaseModal.policyNote && (
                <div style={{ marginTop: '10px', padding: '8px 10px', background: 'rgba(251, 191, 36, 0.15)', borderRadius: '6px', border: '1px solid rgba(251, 191, 36, 0.3)', fontSize: '11.5px', color: '#fbbf24' }}>
                  <strong>Guardrail Notice:</strong> {selectedCaseModal.policyNote}
                </div>
              )}
            </div>

            <div>
              <h4 style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <IconClock size={14} color="#60a5fa" />
                <span>Chronological Case Audit Trail</span>
              </h4>

              <div className="timeline" style={{ paddingLeft: '4px' }}>
                {selectedCaseModal.auditTimeline?.map((item, idx) => (
                  <div key={idx} className="timeline-item">
                    <div className="timeline-indicator">
                      <div className="timeline-dot" style={{ background: '#3b82f6' }}>
                        <IconZap size={10} color="#fff" />
                      </div>
                      <div className="timeline-line" />
                    </div>
                    <div className="timeline-content" style={{ paddingBottom: '12px' }}>
                      <div style={{ background: 'var(--surface-color)', border: '1px solid var(--glass-border)', borderRadius: '6px', padding: '10px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#93c5fd' }}>{item.event}</span>
                          <span className="badge muted" style={{ fontSize: '10px' }}>{item.actor}</span>
                        </div>
                        <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', margin: '2px 0 0 0', lineHeight: 1.4 }}>
                          {item.detail}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedCaseModal(null)}>
                Close Diagnostic
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
