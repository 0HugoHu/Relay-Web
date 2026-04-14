const BASE = '/api';

function candidateId() {
  return localStorage.getItem('relay_candidate') || '';
}

async function request(method, url, body, isForm = false) {
  const headers = { 'X-Candidate-Id': candidateId() };
  if (body && !isForm) headers['Content-Type'] = 'application/json';

  const res = await fetch(BASE + url, {
    method,
    credentials: 'include',
    headers,
    body: isForm ? body : (body ? JSON.stringify(body) : undefined),
  });

  if (res.status === 401) {
    // Kick to login
    window.location.href = '/login';
    return;
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }
  if (!res.ok) throw new Error('Request failed');
  return res;
}

export const api = {
  get:    (url)          => request('GET',    url),
  post:   (url, body)    => request('POST',   url, body),
  patch:  (url, body)    => request('PATCH',  url, body),
  delete: (url)          => request('DELETE', url),

  upload(channelId, file, { expiresIn, burnOnRead } = {}) {
    const fd = new FormData();
    fd.append('file', file);
    if (expiresIn)   fd.append('expires_in', expiresIn);
    if (burnOnRead)  fd.append('burn_on_read', 'true');
    return request('POST', `/channels/${channelId}/upload`, fd, true);
  },

  fileUrl(fileId, variant = 'original') {
    return `${BASE}/files/${fileId}/${variant}`;
  },
};
