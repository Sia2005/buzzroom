const API_BASE = `${import.meta.env.VITE_SERVER_URL ?? ''}/api`;

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export async function apiRequest(path, { method = 'GET', json, formData, signal } = {}) {
  const init = { method, signal, headers: {} };
  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  } else if (formData) {
    init.body = formData;
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Could not reach the server. Is it running?', 0);
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error?.message ?? `Request failed (${response.status})`;
    throw new ApiError(message, response.status, body?.error?.details);
  }
  return body;
}
