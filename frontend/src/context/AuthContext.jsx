import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../api/auth.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    const token = sessionStorage.getItem('cb_token');

    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const res = await authApi.getMe();
      setUser(res.data || res);
    } catch {
      sessionStorage.removeItem('cb_token');
      sessionStorage.removeItem('cb_refresh');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = async (email, password) => {
    const res = await authApi.login(email, password);
    const data = res?.data?.data || res?.data || res;
    const access = data?.tokens?.accessToken || data?.accessToken;
    const refresh = data?.tokens?.refreshToken || data?.refreshToken;

    if (access) {
      sessionStorage.setItem('cb_token', access);
    }
    if (refresh) {
      sessionStorage.setItem('cb_refresh', refresh);
    }

    await fetchUser();
    return data;
  };

  const register = async (data) => {
    const res = await authApi.register(data);
    return res;
  };

  const logout = () => {
    sessionStorage.removeItem('cb_token');
    sessionStorage.removeItem('cb_refresh');
    localStorage.removeItem('cb_token');
    localStorage.removeItem('cb_refresh');
    setUser(null);
  };

  const switchUser = async (email, password) => {
    sessionStorage.removeItem('cb_token');
    sessionStorage.removeItem('cb_refresh');
    setUser(null);
    return login(email, password);
  };

  const updateUser = (updatedData) => {
    if (!updatedData) return;
    setUser(prev => {
      if (!prev) return updatedData;
      return {
        ...prev,
        ...updatedData,
        company: updatedData.company
          ? { ...(prev.company || {}), ...updatedData.company }
          : prev.company,
      };
    });
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, switchUser, fetchUser, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
