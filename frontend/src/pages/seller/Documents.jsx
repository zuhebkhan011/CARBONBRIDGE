import { useEffect, useState, useRef } from 'react';
import { batchesApi } from '../../api/batches';
import { documentsApi } from '../../api/documents';
import { aiApi } from '../../api/ai';
import { formatBatchPurity } from '../../utils/formatters';

export function Documents() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState('');
  const [analyzingBatchId, setAnalyzingBatchId] = useState('');
  const [viewingPdfBatchId, setViewingPdfBatchId] = useState('');
  const [activeAnalysisBatch, setActiveAnalysisBatch] = useState(null);
  const [activeExtraction, setActiveExtraction] = useState(null);
  const [loadingExtraction, setLoadingExtraction] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const fileInputRef = useRef(null);
  const [selectedBatch, setSelectedBatch] = useState('');

  const normalizeExtraction = (data) => {
    if (!data) return null;
    const ext = data.extraction || {};
    const cross = data.crossCheck || {};
    return {
      ...data,
      ...ext,
      ...cross,
      status: data.status || ext.status,
      co2PurityPercent: data.co2PurityPercent ?? ext.co2PurityPercent ?? null,
      moisturePercent: data.moisturePercent ?? ext.moisturePercent ?? null,
      testDate: data.testDate ?? ext.testDate ?? null,
      batchReference: data.batchReference ?? ext.batchReference ?? null,
      laboratoryName: data.laboratoryName ?? ext.laboratoryName ?? null,
      qualityParameters: data.qualityParameters || ext.qualityParameters || [],
      contaminants: data.contaminants || ext.contaminants || [],
      hasDiscrepancy: data.hasDiscrepancy ?? cross.hasDiscrepancy ?? false,
      batchReferenceMatch: data.batchReferenceMatch ?? cross.batchReferenceMatch ?? null,
      purityMatch: data.purityMatch ?? cross.purityMatch ?? null,
      purityDifference: data.purityDifference ?? cross.purityDifference ?? null,
      crossCheckSummary: data.crossCheckSummary || cross.summary || data.summary || null,
    };
  };

  const loadBatches = async () => {
    try {
      const res = await batchesApi.list();
      setBatches(res?.data || res || []);
    } catch (e) {
      console.error('Failed to load batches:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBatches();
  }, []);

  const handleUpload = (batchId) => {
    setSelectedBatch(batchId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedBatch) return;
    setUploading(selectedBatch);
    setActionError('');
    setActionSuccess('');
    try {
      await documentsApi.uploadCoA(selectedBatch, file);
      setActionSuccess('Certificate uploaded successfully. AI analysis can now be run.');
      await loadBatches();
    } catch (err) {
      console.error(err);
      setActionError(err.message || 'Upload failed');
    } finally {
      setUploading('');
      e.target.value = '';
    }
  };

  const handleViewPdf = async (batchId) => {
    setViewingPdfBatchId(batchId);
    setActionError('');
    try {
      await documentsApi.viewCoA(batchId);
    } catch (err) {
      console.error('Failed to view PDF:', err);
      setActionError(err.message || 'Failed to view original PDF. Authentication required.');
    } finally {
      setViewingPdfBatchId('');
    }
  };

  const handleRunAiAnalysis = async (batchId, isRetry = false) => {
    if (analyzingBatchId) return; // Prevent duplicate clicks while processing
    setAnalyzingBatchId(batchId);
    setActionError('');
    setActionSuccess('');
    try {
      const res = await aiApi.extractCoA(batchId, isRetry);
      const data = res?.data || res;
      
      const normalized = normalizeExtraction(data);

      if (normalized?.status === 'FAILED') {
        setActionError(normalized.crossCheckSummary || 'AI CoA analysis could not be completed.');
        if (activeAnalysisBatch?.id === batchId) {
          setActiveExtraction(normalized);
        }
      } else if (normalized?.status === 'PROCESSING') {
        setActionSuccess('CoA analysis is currently processing. Please wait a moment.');
        if (activeAnalysisBatch?.id === batchId) {
          setActiveExtraction(normalized);
        }
      } else {
        setActionSuccess('CoA AI analysis completed successfully.');
        if (activeAnalysisBatch?.id === batchId) {
          setActiveExtraction(normalized);
        }
      }
      await loadBatches();
    } catch (err) {
      console.error('AI CoA analysis failed:', err);
      setActionError(err.message || 'AI CoA analysis could not be completed.');
      await loadBatches();
    } finally {
      setAnalyzingBatchId('');
    }
  };

  const handleViewAnalysis = async (batch) => {
    setActiveAnalysisBatch(batch);
    setActionError('');
    setActionSuccess('');
    
    setLoadingExtraction(true);
    try {
      const res = await aiApi.getCoAExtraction(batch.id);
      const data = res?.data || res;
      if (data) {
        setActiveExtraction(normalizeExtraction(data));
      } else if (batch.certificate?.extraction) {
        setActiveExtraction(normalizeExtraction(batch.certificate.extraction));
      } else {
        setActiveExtraction(null);
      }
    } catch (err) {
      console.error('Failed to fetch CoA extraction:', err);
      if (batch.certificate?.extraction) {
        setActiveExtraction(normalizeExtraction(batch.certificate.extraction));
      } else {
        setActiveExtraction(null);
      }
    } finally {
      setLoadingExtraction(false);
    }
  };

  const items = Array.isArray(batches) ? batches : [];

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <div className="eyebrow">Quality & Compliance</div>
          <h2>Certificates of Analysis (CoA)</h2>
        </div>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
        accept=".pdf"
      />

      {actionError && (
        <div className="card" style={{ marginBottom: 'var(--space-4)', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid var(--color-danger)', color: 'var(--color-danger)' }}>
          {actionError}
        </div>
      )}

      {actionSuccess && (
        <div className="card" style={{ marginBottom: 'var(--space-4)', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid var(--color-success)', color: 'var(--color-success)' }}>
          {actionSuccess}
        </div>
      )}

      {loading ? (
        <div className="skeleton" style={{ height: '300px' }} />
      ) : items.length === 0 ? (
        <div className="card empty-state">
          <h3>No batches found</h3>
          <p>Register a CO₂ production batch first to upload and analyze certificates.</p>
        </div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Batch Number / ID</th>
                <th>Quantity</th>
                <th>Declared Purity</th>
                <th>Certificate Document</th>
                <th>CoA AI Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => {
                const cert = b.certificate;
                const extraction = cert?.extraction;
                const isAnalyzing = analyzingBatchId === b.id;
                const isViewing = viewingPdfBatchId === b.id;

                return (
                  <tr key={b.id}>
                    <td>
                      <div>
                        <strong>{b.batchNumber || 'Batch'}</strong>
                        <div className="text-mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                          {b.id.slice(0, 8)}...
                        </div>
                      </div>
                    </td>
                    <td>{Number(b.capturedQuantity)} T</td>
                    <td>{formatBatchPurity(b)}</td>
                    <td>
                      {cert ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <span className="badge badge-success">Uploaded</span>
                          <button
                            type="button"
                            onClick={() => handleViewPdf(b.id)}
                            className="btn btn-ghost btn-xs"
                            title="View original PDF document in new tab"
                            disabled={isViewing}
                          >
                            {isViewing ? 'Opening...' : 'PDF'}
                          </button>
                        </div>
                      ) : (
                        <span className="badge badge-neutral">Missing</span>
                      )}
                    </td>
                    <td>
                      {isAnalyzing ? (
                        <span className="badge badge-info">Analyzing certificate...</span>
                      ) : extraction ? (
                        extraction.hasDiscrepancy ? (
                          <span
                            className="badge badge-warning"
                            title="Discrepancy detected between certificate and registered batch"
                            style={{ cursor: 'pointer' }}
                            onClick={() => handleViewAnalysis(b)}
                          >
                            ⚠ Review Required
                          </span>
                        ) : extraction.status === 'FAILED' ? (
                          <span className="badge badge-neutral" title="AI analysis unavailable">
                            Extraction Unavailable
                          </span>
                        ) : (
                          <span
                            className="badge badge-success"
                            style={{ cursor: 'pointer' }}
                            onClick={() => handleViewAnalysis(b)}
                          >
                            AI Extracted from CoA
                          </span>
                        )
                      ) : cert ? (
                        <span className="badge badge-neutral">CoA Not Analyzed</span>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                        {cert ? (
                          <>
                            {extraction ? (
                              <>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => handleViewAnalysis(b)}
                                >
                                  {extraction.status === 'FAILED' ? 'View AI Summary' : 'View Details'}
                                </button>
                                {extraction.status === 'FAILED' && (
                                  <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => handleRunAiAnalysis(b.id, true)}
                                    disabled={Boolean(analyzingBatchId)}
                                    title="Retry AI CoA analysis"
                                  >
                                    {isAnalyzing ? 'Analyzing certificate...' : 'Try Again'}
                                  </button>
                                )}
                              </>
                            ) : (
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => handleRunAiAnalysis(b.id)}
                                disabled={Boolean(analyzingBatchId)}
                              >
                                {isAnalyzing ? 'Analyzing certificate...' : 'Run CoA AI Analysis'}
                              </button>
                            )}
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleUpload(b.id)}
                              disabled={uploading === b.id}
                              title="Replace certificate with a new file"
                            >
                              {uploading === b.id ? 'Replacing...' : 'Replace'}
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleUpload(b.id)}
                            disabled={uploading === b.id}
                          >
                            {uploading === b.id ? 'Uploading...' : 'Upload CoA'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* AI Document Summary Modal */}
      {activeAnalysisBatch && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 'var(--space-4)',
          }}
          onClick={() => setActiveAnalysisBatch(null)}
        >
          <div
            className="card"
            style={{
              maxWidth: '740px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <h3 style={{ margin: 0 }}>AI Document Summary</h3>
                {activeExtraction && activeExtraction.status !== 'FAILED' && (
                  <span
                    className={`badge ${activeExtraction.hasDiscrepancy ? 'badge-warning' : 'badge-success'}`}
                    style={{ fontSize: 'var(--text-xs)' }}
                  >
                    {activeExtraction.hasDiscrepancy ? 'Review Required' : 'AI Extracted from CoA'}
                  </span>
                )}
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setActiveAnalysisBatch(null)}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-secondary)',
                padding: 'var(--space-3)',
                background: 'var(--neutral-75)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-4)',
              }}
            >
              <strong>Notice:</strong> The PostgreSQL batch record remains the authoritative source of truth. AI analysis extracts documented certificate parameters and cross-checks them against declared specifications to flag discrepancies for human review without modifying batch data.
            </div>

            {loadingExtraction ? (
              <div className="skeleton" style={{ height: '200px' }} />
            ) : !activeExtraction || activeExtraction.status === 'FAILED' ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
                <div
                  style={{
                    padding: 'var(--space-4)',
                    background: activeExtraction?.status === 'FAILED' ? 'rgba(239, 68, 68, 0.08)' : 'var(--neutral-50)',
                    border: activeExtraction?.status === 'FAILED' ? '1px solid var(--color-danger)' : '1px solid var(--neutral-150)',
                    borderRadius: 'var(--radius-md)',
                    color: activeExtraction?.status === 'FAILED' ? 'var(--color-danger)' : 'var(--color-text-muted)',
                    marginBottom: 'var(--space-4)',
                  }}
                >
                  <strong>
                    {activeExtraction?.status === 'FAILED'
                      ? 'AI CoA analysis could not be completed.'
                      : 'No completed AI extraction available for this certificate.'}
                  </strong>
                  <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                    {activeExtraction?.status === 'FAILED'
                      ? activeExtraction.crossCheckSummary || 'The AI extraction service encountered an issue or rate limit. The original PDF certificate remains securely stored and fully accessible.'
                      : 'Run AI analysis on the uploaded certificate to extract purity, moisture, and quality parameters.'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => handleRunAiAnalysis(activeAnalysisBatch.id, activeExtraction?.status === 'FAILED')}
                    disabled={Boolean(analyzingBatchId)}
                  >
                    {analyzingBatchId === activeAnalysisBatch.id
                      ? 'Analyzing certificate...'
                      : activeExtraction?.status === 'FAILED'
                      ? 'Try Again'
                      : 'Run CoA AI Analysis'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleViewPdf(activeAnalysisBatch.id)}
                    disabled={viewingPdfBatchId === activeAnalysisBatch.id}
                  >
                    {viewingPdfBatchId === activeAnalysisBatch.id ? 'Opening PDF...' : 'View Original PDF'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {/* Discrepancy Alert */}
                {activeExtraction.hasDiscrepancy && (
                  <div
                    style={{
                      padding: 'var(--space-3)',
                      background: 'rgba(245, 158, 11, 0.1)',
                      border: '1px solid #f59e0b',
                      borderRadius: 'var(--radius-md)',
                      color: '#b45309',
                      marginBottom: 'var(--space-4)',
                      fontSize: 'var(--text-sm)',
                    }}
                  >
                    <strong>⚠ Discrepancy Flagged:</strong>
                    <ul style={{ margin: 'var(--space-1) 0 0 var(--space-4)', padding: 0 }}>
                      {activeExtraction.batchReferenceMatch === false && (
                        <li>Batch reference in certificate does not match registered batch identifier.</li>
                      )}
                      {activeExtraction.purityMatch === false && (
                        <li>
                          Tested purity ({activeExtraction.co2PurityPercent}%) differs from registered purity ({activeAnalysisBatch.purityPercentage}%) by {activeExtraction.purityDifference != null ? `${Math.abs(activeExtraction.purityDifference).toFixed(2)}%` : 'a significant margin'}.
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Cross-Check Comparison Grid */}
                <h4 style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>
                  Registered Specification vs Certificate Extraction
                </h4>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 'var(--space-3)',
                    marginBottom: 'var(--space-4)',
                  }}
                >
                  <div style={{ padding: 'var(--space-3)', background: 'var(--neutral-75)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Batch Reference</div>
                    <div style={{ fontWeight: 600, marginTop: '2px' }}>
                      Registered: {activeAnalysisBatch.batchNumber || activeAnalysisBatch.id.slice(0, 8)}
                    </div>
                    <div style={{ fontSize: 'var(--text-sm)', color: activeExtraction.batchReferenceMatch ? 'var(--color-success)' : '#b45309', marginTop: '2px' }}>
                      Doc: {activeExtraction.batchReference || 'Not reported'} {activeExtraction.batchReferenceMatch ? '✓ Match' : '⚠ Discrepancy'}
                    </div>
                  </div>

                  <div style={{ padding: 'var(--space-3)', background: 'var(--neutral-75)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>CO₂ Purity</div>
                    <div style={{ fontWeight: 600, marginTop: '2px' }}>
                      Registered: {Number(activeAnalysisBatch.purityPercentage).toFixed(2)}%
                    </div>
                    <div style={{ fontSize: 'var(--text-sm)', color: activeExtraction.purityMatch ? 'var(--color-success)' : '#b45309', marginTop: '2px' }}>
                      Doc: {activeExtraction.co2PurityPercent != null ? `${Number(activeExtraction.co2PurityPercent).toFixed(2)}%` : 'Not reported'} {activeExtraction.purityMatch ? '✓ Match' : '⚠ Discrepancy'}
                    </div>
                  </div>

                  <div style={{ padding: 'var(--space-3)', background: 'var(--neutral-75)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Moisture Content</div>
                    <div style={{ fontWeight: 600, marginTop: '2px' }}>
                      {activeExtraction.moisturePercent != null ? `${activeExtraction.moisturePercent}%` : 'Not reported in CoA'}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                      Tested in laboratory
                    </div>
                  </div>

                  <div style={{ padding: 'var(--space-3)', background: 'var(--neutral-75)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Testing Laboratory</div>
                    <div style={{ fontWeight: 600, marginTop: '2px' }}>
                      {activeExtraction.laboratoryName || 'Not reported in CoA'}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                      Test Date: {activeExtraction.testDate ? new Date(activeExtraction.testDate).toLocaleDateString() : 'Not reported'}
                    </div>
                  </div>
                </div>

                {/* Additional Quality Parameters */}
                {Array.isArray(activeExtraction.qualityParameters) && activeExtraction.qualityParameters.length > 0 && (
                  <div style={{ marginBottom: 'var(--space-4)' }}>
                    <h4 style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>
                      Detailed Certificate Test Parameters
                    </h4>
                    <table className="data-table" style={{ fontSize: 'var(--text-xs)' }}>
                      <thead>
                        <tr>
                          <th>Parameter</th>
                          <th>Tested Value</th>
                          <th>Unit</th>
                          <th>Specification</th>
                          <th>Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeExtraction.qualityParameters.map((p, idx) => (
                          <tr key={idx}>
                            <td><strong>{p.name}</strong></td>
                            <td>{p.value != null ? p.value : '—'}</td>
                            <td>{p.unit || '—'}</td>
                            <td>{p.specification || '—'}</td>
                            <td>
                              <span className={`badge ${p.status === 'PASS' ? 'badge-success' : p.status === 'FAIL' ? 'badge-danger' : 'badge-neutral'}`}>
                                {p.status || 'Reported'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Modal Footer Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-6)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--neutral-150)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    AI Model: {activeExtraction.modelName || 'Gemini Flash'} ({activeExtraction.latencyMs ? `${activeExtraction.latencyMs}ms` : 'completed'})
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleViewPdf(activeAnalysisBatch.id)}
                      disabled={viewingPdfBatchId === activeAnalysisBatch.id}
                    >
                      {viewingPdfBatchId === activeAnalysisBatch.id ? 'Opening PDF...' : 'View Original PDF'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => handleRunAiAnalysis(activeAnalysisBatch.id)}
                      disabled={Boolean(analyzingBatchId)}
                    >
                      {analyzingBatchId === activeAnalysisBatch.id ? 'Analyzing certificate...' : 'Re-run Analysis'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
