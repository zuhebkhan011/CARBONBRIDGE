import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ordersApi } from '../../api/orders';
import { useAuth } from '../../context/AuthContext';
import {
  formatBatchPurity,
  formatQuantity,
  formatMoney,
  formatStatus,
  getShipmentStatus,
} from '../../utils/formatters';

export function TransactionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await ordersApi.getById(id);
        setOrder(res?.data || res);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="page-enter">
        <div className="skeleton" style={{ height: '300px' }} />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="page-enter">
        <div className="card empty-state">
          <h3>Order not found</h3>
          <button className="btn btn-primary" onClick={() => navigate(-1)}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const allocations = Array.isArray(order.allocations) ? order.allocations : [];

  // Calculate totals from allocations if order-level totals are missing
  const calculatedTotalQty = allocations.reduce(
    (sum, a) => sum + Number(a.allocatedQuantity ?? a.quantity ?? 0),
    0
  );
  const totalQty = order.totalQuantity != null ? order.totalQuantity : calculatedTotalQty;

  const calculatedTotalPrice = allocations.reduce(
    (sum, a) =>
      sum +
      Number(a.allocatedQuantity ?? a.quantity ?? 0) *
        Number(a.pricePerTon ?? a.pricePerUnit ?? 0),
    0
  );
  const totalPrice = order.totalPrice != null ? order.totalPrice : calculatedTotalPrice;

  const orderStatus = order.overallStatus || order.status || 'CONFIRMED';
  const orderTypeDisplay = order.orderType ? formatStatus(order.orderType) : '—';
  const shipmentsPath = user?.role === 'SELLER' ? '/seller/shipments' : '/shipments';

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate(-1)}
            style={{ marginBottom: 'var(--space-2)' }}
          >
            ← Back
          </button>
          <h2>Order Details</h2>
        </div>
        <span
          className={`badge ${
            orderStatus === 'CONFIRMED' || orderStatus === 'DELIVERED' || orderStatus === 'RECEIVED'
              ? 'badge-success'
              : 'badge-warning'
          }`}
          style={{ fontSize: 'var(--text-sm)', padding: 'var(--space-2) var(--space-4)' }}
        >
          {formatStatus(orderStatus)}
        </span>
      </div>

      <div className="grid grid-4 dashboard-metrics" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="metric-card">
          <div className="metric-label">Total Quantity</div>
          <div className="metric-value">{formatQuantity(totalQty)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Total Price</div>
          <div className="metric-value">{formatMoney(totalPrice)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Suppliers</div>
          <div className="metric-value">{allocations.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Type</div>
          <div className="metric-value" style={{ fontSize: 'var(--text-lg)' }}>
            {orderTypeDisplay}
          </div>
        </div>
      </div>

      {allocations.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Allocations</h3>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Quantity</th>
                <th>Purity</th>
                <th>Price/T</th>
                <th>Shipment</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a, i) => {
                const supplierName =
                  a.seller?.name ||
                  a.batch?.company?.name ||
                  a.listing?.batch?.company?.name ||
                  '—';
                const allocQty = a.allocatedQuantity ?? a.quantity;
                const purity = formatBatchPurity(a.batch || a.listing?.batch || a);
                const pricePerTon = a.pricePerTon ?? a.pricePerUnit;
                const rawShipmentStatus = getShipmentStatus(a.shipment) || 'ALLOCATED';

                return (
                  <tr key={a.id || i}>
                    <td>
                      <strong>{supplierName}</strong>
                    </td>
                    <td>{formatQuantity(allocQty)}</td>
                    <td>{purity}</td>
                    <td className="text-mono">{formatMoney(pricePerTon)}</td>
                    <td>
                      {a.shipment ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => navigate(shipmentsPath)}
                        >
                          <span
                            className={`badge ${
                              rawShipmentStatus === 'RECEIVED' || rawShipmentStatus === 'DELIVERED'
                                ? 'badge-success'
                                : rawShipmentStatus === 'IN_TRANSIT'
                                ? 'badge-info'
                                : 'badge-neutral'
                            }`}
                          >
                            {formatStatus(rawShipmentStatus)}
                          </span>
                        </button>
                      ) : (
                        <span className="badge badge-neutral">Pending</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
