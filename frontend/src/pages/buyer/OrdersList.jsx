import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ordersApi } from '../../api/orders';
import { formatQuantity, formatMoney, formatStatus } from '../../utils/formatters';

export function OrdersList() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const res = await ordersApi.list();
        setOrders(res?.data || res || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    }
    load();
  }, []);

  const items = Array.isArray(orders) ? orders : [];

  return (
    <div className="page-enter">
      <div className="page-header"><h2>My Orders</h2></div>
      {loading ? (
        <div className="skeleton" style={{ height: '300px' }} />
      ) : items.length === 0 ? (
        <div className="card empty-state"><h3>No orders yet</h3><p>Procure CO₂ to see your orders here.</p></div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr><th>Order ID</th><th>Quantity</th><th>Total Price</th><th>Type</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {items.map(o => {
                const status = o.overallStatus || o.status || 'CONFIRMED';
                return (
                  <tr key={o.id}>
                    <td className="text-mono" style={{ fontSize: 'var(--text-xs)' }}>{o.id.slice(0, 12)}...</td>
                    <td><strong>{formatQuantity(o.totalQuantity)}</strong></td>
                    <td className="text-mono">{formatMoney(o.totalPrice)}</td>
                    <td><span className="badge badge-neutral">{formatStatus(o.orderType)}</span></td>
                    <td><span className={`badge ${status === 'CONFIRMED' || status === 'DELIVERED' || status === 'RECEIVED' ? 'badge-success' : 'badge-warning'}`}>{formatStatus(status)}</span></td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => navigate(`/orders/${o.id}`)}>View</button></td>
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
