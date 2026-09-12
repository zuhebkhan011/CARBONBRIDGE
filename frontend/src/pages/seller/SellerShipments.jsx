import { useEffect, useState } from 'react';
import { shipmentsApi } from '../../api/shipments';
import { formatStatus, getShipmentStatus, formatTonnage, formatBatchPurity } from '../../utils/formatters';

const STATUS_ORDER = ['ALLOCATED', 'DISPATCH_PENDING', 'IN_TRANSIT', 'DELIVERED', 'RECEIVED'];
const NEXT_STATUS = {
  ALLOCATED: 'DISPATCH_PENDING',
  DISPATCH_PENDING: 'IN_TRANSIT',
  IN_TRANSIT: 'DELIVERED',
};

export function SellerShipments() {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  const loadShipments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await shipmentsApi.list();
      setShipments(res?.data || res || []);
    } catch (err) {
      console.error('Failed to load seller shipments:', err);
      setError('Unable to load shipments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShipments();
  }, []);

  const handleUpdateStatus = async (shipmentId, newStatus) => {
    if (!shipmentId) return;
    setUpdatingId(shipmentId);
    try {
      await shipmentsApi.updateStatus(shipmentId, { status: newStatus });
      const res = await shipmentsApi.list();
      setShipments(res?.data || res || []);
    } catch (err) {
      console.error('Failed to update shipment status:', err);
    } finally {
      setUpdatingId(null);
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
        <h2>Shipment Management</h2>
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
          <h3>No shipments</h3>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-2)' }}>
            No active or past shipments found.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {items.map((ship, idx) => {
            const rawStatus = getShipmentStatus(ship);
            const status = rawStatus || 'ALLOCATED';
            const statusIdx = STATUS_ORDER.indexOf(status);
            const nextStatus = NEXT_STATUS[status];
            const quantityDisplay = formatTonnage(
              ship.allocation?.allocatedQuantity ?? ship.allocation?.quantity
            );
            const purityDisplay = formatBatchPurity(ship.allocation?.batch);
            const batchNum = ship.allocation?.batch?.batchNumber || '—';
            const buyerName = ship.buyer?.name || '—';
            const destination = ship.buyer?.address || (ship.destinationLat && ship.destinationLng ? `${ship.destinationLat}, ${ship.destinationLng}` : '—');
            const displayId = ship.id ? `${ship.id.slice(0, 12)}...` : '—';

            return (
              <div className="card" key={ship.id || `ship-${idx}`}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 'var(--space-4)',
                    flexWrap: 'wrap',
                    gap: 'var(--space-3)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span
                        className="text-mono"
                        style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}
                      >
                        {displayId}
                      </span>
                      {batchNum !== '—' && (
                        <span
                          className="badge"
                          style={{
                            fontSize: '11px',
                            background: 'rgba(255, 255, 255, 0.06)',
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          Batch: {batchNum}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontWeight: 600,
                        marginTop: 'var(--space-1)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                      }}
                    >
                      <span>Qty: {quantityDisplay}</span>
                      <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>|</span>
                      <span>Purity: {purityDisplay}</span>
                    </div>
                    <div
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-text-muted)',
                        marginTop: 'var(--space-1)',
                      }}
                    >
                      Buyer: <strong>{buyerName}</strong> • Destination: {destination}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
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
                    {nextStatus && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={updatingId === ship.id}
                        onClick={() => handleUpdateStatus(ship.id, nextStatus)}
                      >
                        {updatingId === ship.id
                          ? 'Updating...'
                          : nextStatus === 'DISPATCH_PENDING'
                          ? 'Prepare Dispatch'
                          : nextStatus === 'IN_TRANSIT'
                          ? 'Mark In Transit'
                          : 'Mark Delivered'}
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 0 }}>
                  {STATUS_ORDER.map((s, i) => (
                    <div
                      key={s}
                      style={{
                        flex: 1,
                        height: '4px',
                        borderRadius: '2px',
                        background:
                          statusIdx >= 0 && i <= statusIdx
                            ? 'var(--color-success)'
                            : 'var(--neutral-200)',
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
