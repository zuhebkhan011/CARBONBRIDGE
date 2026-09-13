import { useEffect, useState } from 'react';
import { shipmentsApi } from '../../api/shipments';
import { formatStatus, getShipmentStatus, formatTonnage, formatBatchPurity } from '../../utils/formatters';
import { calculateEstimatedProgress } from '../../utils/geo';

const STATUS_ORDER = ['ALLOCATED', 'DISPATCH_PENDING', 'IN_TRANSIT', 'DELIVERED', 'RECEIVED'];

export function ShipmentTracking() {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);

  const loadShipments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await shipmentsApi.list();
      setShipments(res?.data || res || []);
    } catch (err) {
      console.error('Failed to load buyer shipments:', err);
      setError('Unable to load shipments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShipments();
  }, []);

  const handleConfirmReceived = async (shipmentId) => {
    if (!shipmentId) return;
    setConfirmingId(shipmentId);
    try {
      await shipmentsApi.updateStatus(shipmentId, { status: 'RECEIVED' });
      const res = await shipmentsApi.list();
      setShipments(res?.data || res || []);
    } catch (err) {
      console.error('Failed to confirm shipment delivery:', err);
    } finally {
      setConfirmingId(null);
    }
  };

  const items = Array.isArray(shipments) ? shipments : [];

  if (loading) {
    return (
      <div className="page-enter">
        <div className="skeleton" style={{ height: '300px' }} />
      </div>
    );
  }

  return (
    <div className="page-enter">
      <div className="page-header">
        <h2>Shipments</h2>
      </div>

      {error ? (
        <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
          <p style={{ color: 'var(--color-error)', marginBottom: 'var(--space-4)', fontWeight: 500 }}>
            {error}
          </p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={loadShipments}>
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="card empty-state">
          <h3>No shipments yet</h3>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-2)' }}>
            Once you procure CO₂, shipments will appear here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {items.map((ship, idx) => {
            const rawStatus = getShipmentStatus(ship);
            const status = rawStatus || 'ALLOCATED';
            const statusIdx = STATUS_ORDER.indexOf(status);
            const sellerName = ship.seller?.name || ship.allocation?.batch?.sellerId || 'Seller';
            const quantityDisplay = formatTonnage(
              ship.allocation?.allocatedQuantity ?? ship.allocation?.quantity
            );
            const purityDisplay = formatBatchPurity(ship.allocation?.batch);
            const batchNum = ship.allocation?.batch?.batchNumber || '—';
            const displayId = ship.id ? `${ship.id.slice(0, 12)}...` : '—';

            return (
              <div className="card" key={ship.id || `ship-${idx}`}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 'var(--space-5)',
                    flexWrap: 'wrap',
                    gap: 'var(--space-3)',
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-text-muted)',
                        fontFamily: 'var(--font-family-mono)',
                      }}
                    >
                      {displayId}
                    </span>
                    <div style={{ fontWeight: 600, marginTop: 'var(--space-1)' }}>
                      {sellerName} • {quantityDisplay}
                      {purityDisplay !== '—' && (
                        <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, marginLeft: '8px' }}>
                          ({purityDisplay} CO₂)
                        </span>
                      )}
                    </div>
                    {batchNum !== '—' && (
                      <div
                        style={{
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-text-muted)',
                          marginTop: 'var(--space-1)',
                        }}
                      >
                        Batch Number: {batchNum}
                      </div>
                    )}
                  </div>
                  <span
                    className={`badge ${
                      status === 'RECEIVED'
                        ? 'badge-success'
                        : status === 'IN_TRANSIT'
                        ? 'badge-info'
                        : status === 'DELIVERED'
                        ? 'badge-success'
                        : 'badge-warning'
                    }`}
                  >
                    {formatStatus(status)}
                  </span>
                </div>

                {/* Timeline */}
                <div style={{ display: 'flex', gap: 0, marginBottom: 'var(--space-4)' }}>
                  {STATUS_ORDER.map((s, i) => {
                    const isCompleted = statusIdx >= 0 && i < statusIdx;
                    const isActive = statusIdx >= 0 && i === statusIdx;
                    return (
                      <div
                        key={s}
                        style={{
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                        }}
                      >
                        <div
                          style={{
                            width: '100%',
                            height: '4px',
                            borderRadius: '2px',
                            background:
                              isCompleted || isActive
                                ? 'var(--color-success)'
                                : 'var(--neutral-200)',
                            marginBottom: 'var(--space-2)',
                          }}
                        />
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: isActive ? 700 : 500,
                            color: isActive
                              ? 'var(--color-primary)'
                              : isCompleted
                              ? 'var(--color-success)'
                              : 'var(--color-text-muted)',
                            textAlign: 'center',
                          }}
                        >
                          {formatStatus(s)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* In-Transit Estimated Progress Section */}
                {status === 'IN_TRANSIT' && (() => {
                  const progress =
                    ship.estimatedProgress ||
                    calculateEstimatedProgress({
                      dispatchedAt: ship.dispatchedAt,
                      durationHours: ship.durationHours,
                      distanceKm: ship.distanceKm,
                    });

                  return (
                    <div
                      style={{
                        margin: 'var(--space-4) 0',
                        padding: 'var(--space-4)',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '8px',
                          flexWrap: 'wrap',
                          gap: '6px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '1.1rem' }}>🚚</span>
                          <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                            Estimated Shipment Progress
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#92400e',
                            background: '#fef3c7',
                            border: '1px solid #fde68a',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontWeight: 600,
                          }}
                        >
                          GPS tracking unavailable
                        </span>
                      </div>

                      {progress?.isCalculable ? (
                        <>
                          {/* Progress track with indicator */}
                          <div style={{ position: 'relative', margin: '14px 0 8px 0' }}>
                            <div
                              style={{
                                height: '8px',
                                width: '100%',
                                background: '#e2e8f0',
                                borderRadius: '4px',
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  height: '100%',
                                  width: `${progress.progressPercentage}%`,
                                  background: 'linear-gradient(90deg, #10b981, #059669)',
                                  borderRadius: '4px',
                                  transition: 'width 0.4s ease',
                                }}
                              />
                            </div>
                            <div
                              style={{
                                position: 'absolute',
                                top: '50%',
                                left: `${progress.progressPercentage}%`,
                                transform: 'translate(-50%, -50%)',
                                width: '14px',
                                height: '14px',
                                borderRadius: '50%',
                                background: '#059669',
                                border: '2px solid #ffffff',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                              }}
                            />
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: '11px',
                              color: 'var(--color-text-muted)',
                              marginBottom: '10px',
                            }}
                          >
                            <span>0%</span>
                            <span style={{ fontWeight: 700, color: '#059669' }}>
                              {progress.progressPercentage}%
                            </span>
                            <span>100%</span>
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: '8px',
                              fontSize: 'var(--text-xs)',
                            }}
                          >
                            <div>
                              {progress.distanceCoveredKm != null ? (
                                <span>
                                  <strong>~{progress.distanceCoveredKm} km covered</strong> &middot;{' '}
                                  <span>~{progress.distanceRemainingKm} km remaining</span>
                                </span>
                              ) : (
                                <span>Progress: {progress.progressPercentage}% estimated</span>
                              )}
                            </div>
                            <div>
                              <span>Estimated arrival: </span>
                              <strong style={{ color: '#0f172a' }}>{progress.etaText}</strong>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: 'var(--color-text-muted)',
                            marginTop: '6px',
                          }}
                        >
                          <span>Estimated progress unavailable &middot; ETA unavailable</span>
                        </div>
                      )}

                      <div
                        style={{
                          marginTop: '8px',
                          fontSize: '11px',
                          color: '#64748b',
                          borderTop: '1px dashed #e2e8f0',
                          paddingTop: '6px',
                        }}
                      >
                        Position estimated from dispatch timestamp and planned road route. No live GPS telematics.
                      </div>
                    </div>
                  );
                })()}

                {status === 'DELIVERED' && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={confirmingId === ship.id}
                      onClick={() => handleConfirmReceived(ship.id)}
                    >
                      {confirmingId === ship.id ? 'Confirming...' : 'Confirm Received'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
