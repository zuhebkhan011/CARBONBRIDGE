import { useEffect, useState } from 'react';
import { shipmentsApi } from '../../api/shipments';
import { formatStatus, getShipmentStatus, formatTonnage, formatBatchPurity } from '../../utils/formatters';

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
