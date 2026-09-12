import { useState, useCallback, useEffect, useRef } from 'react';

export function useApi(apiCall, { immediate = false, deps = [] } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const execute = useCallback(async (...args) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall(...args);
      if (mountedRef.current) {
        setData(result?.data !== undefined ? result.data : result);
      }
      return result;
    } catch (err) {
      if (mountedRef.current) {
        const isNetwork = err.status === 0 || err.status === undefined;
        if (isNetwork) {
          console.error('[NETWORK ERROR]', {
            url: err.url || 'Unknown URL',
            possibleCause: 'Backend not running, CORS misconfiguration, or network issue',
          });
        } else {
          console.error('[API ERROR]', {
            method: err.method || 'REQUEST',
            url: err.url || 'Unknown URL',
            status: err.status,
            responseBody: err.data || null,
          });
        }
        setError(err.message || 'Something went wrong');
      }
      throw err;
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [apiCall]);

  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [immediate, ...deps]);

  return { data, loading, error, execute, setData };
}
