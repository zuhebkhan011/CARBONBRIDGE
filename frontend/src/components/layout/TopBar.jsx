import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '../../api/notifications';
import './TopBar.css';

export function TopBar({ onMenuClick, onCollapseClick, collapsed }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnread = useCallback(async () => {
    const token = sessionStorage.getItem('cb_token');
    if (!user || !token) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await notificationsApi.getUnreadCount();
      const count = res?.data?.unreadCount ?? (typeof res?.unreadCount === 'number' ? res.unreadCount : 0);
      setUnreadCount(Number(count) || 0);
    } catch {
      // Keep existing count on transient failure
    }
  }, [user]);

  useEffect(() => {
    fetchUnread();

    const handleUpdate = () => {
      fetchUnread();
    };

    window.addEventListener('notifications-updated', handleUpdate);
    window.addEventListener('focus', handleUpdate);

    return () => {
      window.removeEventListener('notifications-updated', handleUpdate);
      window.removeEventListener('focus', handleUpdate);
    };
  }, [fetchUnread]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="topbar-menu-btn mobile-only" onClick={onMenuClick}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <button className="topbar-collapse-btn desktop-only" onClick={onCollapseClick} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
            <polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>
          </svg>
        </button>
        {user?.company?.name && (
          <span className="topbar-company">{user.company.name}</span>
        )}
      </div>
      <div className="topbar-right">
        <button
          className="btn btn-ghost btn-sm topbar-bell-btn"
          onClick={() => navigate('/notifications')}
          style={{ position: 'relative' }}
          title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'Notifications'}
          aria-label="Notifications"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 01-3.46 0"/>
          </svg>
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '5px',
                right: '5px',
                width: '8px',
                height: '8px',
                backgroundColor: 'var(--color-danger, #ef4444)',
                borderRadius: '50%',
                border: '1.5px solid var(--color-surface, #ffffff)',
                pointerEvents: 'none',
              }}
            />
          )}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}
