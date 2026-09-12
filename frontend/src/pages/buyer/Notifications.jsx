import { useEffect, useState } from 'react';
import { notificationsApi } from '../../api/notifications';

export function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = async () => {
    try {
      const res = await notificationsApi.list();
      setNotifications(res?.data || res || []);
    } catch (e) {
      console.error('Failed to load notifications:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const handleMarkRead = async (id) => {
    try {
      await notificationsApi.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true, read: true } : n))
      );
      window.dispatchEvent(new CustomEvent('notifications-updated'));
    } catch (e) {
      console.error('Failed to mark notification as read:', e);
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await notificationsApi.markAllAsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true, read: true }))
      );
      window.dispatchEvent(new CustomEvent('notifications-updated'));
    } catch (e) {
      console.error('Failed to mark all as read:', e);
    } finally {
      setMarkingAll(false);
    }
  };

  const items = Array.isArray(notifications) ? notifications : [];
  const unreadCount = items.filter((n) => !(n.isRead ?? n.read)).length;

  return (
    <div className="page-enter">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Notifications</h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'All caught up'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            className="btn btn-outline btn-sm"
            onClick={handleMarkAllRead}
            disabled={markingAll}
          >
            {markingAll ? 'Marking...' : 'Mark All Read'}
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: '72px' }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="card empty-state">
          <h3>No notifications</h3>
          <p>You're all caught up!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {items.map((n) => {
            const isRead = Boolean(n.isRead ?? n.read);
            return (
              <div
                key={n.id}
                className="card"
                style={{
                  padding: 'var(--space-4) var(--space-5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-4)',
                  background: isRead ? 'var(--color-surface)' : 'rgba(16, 185, 129, 0.04)',
                  borderLeft: isRead ? '3px solid transparent' : '3px solid var(--color-primary)',
                  transition: 'background-color 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    {!isRead && (
                      <span
                        className="badge badge-primary"
                        style={{ fontSize: '10px', padding: '1px 6px', fontWeight: 600 }}
                      >
                        NEW
                      </span>
                    )}
                    <p
                      style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: isRead ? 400 : 600,
                        color: isRead ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
                        margin: 0,
                        maxWidth: 'none',
                      }}
                    >
                      {n.message || n.title}
                    </p>
                  </div>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    {n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}
                  </span>
                </div>
                {!isRead ? (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleMarkRead(n.id)}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    Mark Read
                  </button>
                ) : (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                    Read
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
