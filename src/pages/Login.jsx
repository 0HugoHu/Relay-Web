import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function Login() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [checking, setChecking] = useState(true);
  const [whoami, setWhoami]     = useState(null);

  const candidateId = localStorage.getItem('relay_candidate');

  useEffect(() => {
    // Check if this device can auto-login via token
    api.get('/auth/status').then(s => {
      if (s.authenticated) { navigate('/'); return; }
      // Check if already whitelisted but missing cookie (e.g. cleared)
      return api.get('/device/whoami');
    }).then(w => {
      setWhoami(w);
    }).catch(() => {}).finally(() => setChecking(false));
  }, []);

  async function requestToken() {
    setLoading(true);
    try {
      await api.post('/auth/token', { candidate_id: candidateId });
      navigate('/');
    } catch (err) {
      setError(err.message === 'not_whitelisted'
        ? 'This device is not yet approved. Ask an admin to add it.'
        : err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loginWithPassword(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/login', { password });
      navigate('/manage'); // Password login → goes to manage so you can add devices
    } catch {
      setError('Incorrect password');
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return <div className="h-full flex items-center justify-center bg-slate-900">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>;
  }

  const isWhitelisted = whoami?.is_whitelisted;

  return (
    <div className="min-h-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-blue-950 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Relay</h1>
          <p className="text-slate-500 mt-1 text-sm">
            {isWhitelisted ? `Welcome back, ${whoami.device_name}` : 'This device needs approval'}
          </p>
        </div>

        {isWhitelisted ? (
          <div className="space-y-3">
            <button
              onClick={requestToken}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
            >
              {loading ? 'Connecting…' : 'Connect this device'}
            </button>
            {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <p className="font-medium mb-1">Device not approved</p>
              <p>Your device ID: <span className="font-mono text-xs break-all">{candidateId}</span></p>
              <p className="mt-2">Ask an admin to add this ID, or log in with the master password below.</p>
            </div>

            <form onSubmit={loginWithPassword} className="space-y-3">
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Master password"
                required
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
              >
                {loading ? 'Logging in…' : 'Login with password'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
