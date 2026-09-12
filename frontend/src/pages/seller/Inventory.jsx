import { useEffect, useState } from 'react';
import { batchesApi } from '../../api/batches';
import { formatBatchPurity } from '../../utils/formatters';

export function Inventory() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await batchesApi.list();
        setBatches(res?.data || res || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    }
    load();
  }, []);

  const items = Array.isArray(batches) ? batches : [];

  return (
    <div className="page-enter">
      <div className="page-header"><h2>Batch Inventory</h2></div>
      {loading ? <div className="skeleton" style={{ height: '300px' }} /> : items.length === 0 ? (
        <div className="card empty-state"><h3>No batches registered</h3></div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Batch Number</th>
                <th>Captured</th>
                <th>Allocated</th>
                <th>Available</th>
                <th>Listed</th>
                <th>Purity</th>
                <th>Location</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map(b => (
                <tr key={b.id}>
                  <td className="text-mono" style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                    {b.batchNumber || `${b.id.slice(0, 10)}...`}
                  </td>
                  <td><strong>{Number(b.capturedQuantity)} T</strong></td>
                  <td>{Number(b.allocatedQuantity || 0)} T</td>
                  <td>
                    <span style={{ color: Number(b.availableQuantity) > 0 ? 'var(--color-success)' : 'var(--color-text-muted)', fontWeight: 700 }}>
                      {Number(b.availableQuantity)} T
                    </span>
                  </td>
                  <td>
                    <span style={{ color: Number(b.totalListedQuantity || 0) > 0 ? 'var(--color-primary)' : 'var(--color-text-muted)', fontWeight: 500 }}>
                      {Number(b.totalListedQuantity || 0)} T
                    </span>
                  </td>
                  <td>{formatBatchPurity(b)}</td>
                  <td>{b.storageLocationCity ? `${b.storageLocationCity}, ${b.storageLocationState}` : 'Depot / Plant'}</td>
                  <td>
                    <span className={`badge ${b.status === 'ACTIVE' || b.status === 'AVAILABLE' ? 'badge-success' : b.status === 'PARTIALLY_ALLOCATED' ? 'badge-warning' : 'badge-neutral'}`}>
                      {b.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
