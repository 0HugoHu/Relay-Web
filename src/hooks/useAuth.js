import { useState, useEffect } from 'react';
import { api } from '../api/client';

export function useAuth() {
  const [status, setStatus] = useState(null); // null = loading

  async function refresh() {
    try {
      const data = await api.get('/auth/status');
      setStatus(data);
    } catch {
      setStatus({ authenticated: false, setup_needed: false, has_password: true });
    }
  }

  useEffect(() => { refresh(); }, []);

  return { status, refresh };
}
