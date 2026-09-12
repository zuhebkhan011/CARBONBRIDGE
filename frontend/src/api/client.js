const API_BASE = '/api/v1';

class ApiError extends Error {
  constructor(message, status, data, method, url) {
    super(message);
    this.status = status;
    this.data = data;
    this.method = method;
    this.url = url;
  }
}

async function request(endpoint, options = {}) {
  const token = sessionStorage.getItem('cb_token');
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Remove Content-Type for FormData
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const config = {
    ...options,
    headers,
  };

  if (options.body && !(options.body instanceof FormData)) {
    config.body = JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, config);
  } catch (err) {
    console.error('[NETWORK ERROR]', {
      url: `${API_BASE}${endpoint}`,
      possibleCause: 'Backend not running, CORS misconfiguration, or network issue',
    });
    throw new ApiError('Network error. Please check your connection.', 0, null);
  }

  if (response.status === 204) {
    return null;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    console.error('[API ERROR]', {
      method: config.method || 'GET',
      url: `${API_BASE}${endpoint}`,
      status: response.status,
      responseBody: data,
    });
    const errorMessage =
      (data?.error?.message === 'Request validation failed' && data?.error?.details?.[0]?.message)
        ? data.error.details[0].message
        : data?.error?.message || data?.message || 'Request failed';

    throw new ApiError(
      errorMessage,
      response.status,
      data,
      config.method || 'GET',
      `${API_BASE}${endpoint}`,
    );
  }

  return data;
}

export const api = {
  get: (endpoint) => request(endpoint, { method: 'GET' }),
  post: (endpoint, body) => request(endpoint, { method: 'POST', body }),
  put: (endpoint, body) => request(endpoint, { method: 'PUT', body }),
  patch: (endpoint, body) => request(endpoint, { method: 'PATCH', body }),
  delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
  upload: (endpoint, formData) => request(endpoint, { method: 'POST', body: formData }),
  getBlob: async (endpoint) => {
    const token = sessionStorage.getItem('cb_token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let response;
    try {
      response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'GET',
        headers,
      });
    } catch (err) {
      console.error('[NETWORK ERROR - BLOB]', {
        url: `${API_BASE}${endpoint}`,
        error: err,
      });
      throw new ApiError('Network error downloading document.', 0, null, 'GET', `${API_BASE}${endpoint}`);
    }

    if (!response.ok) {
      let data;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      const errorMessage = data?.error?.message || data?.message || 'Failed to download document';
      throw new ApiError(errorMessage, response.status, data, 'GET', `${API_BASE}${endpoint}`);
    }

    return await response.blob();
  },
};

export { ApiError };
