import React, { useEffect } from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Setup from './pages/Setup';
import Login from './pages/Login';
import Chat from './pages/Chat';
import Manage from './pages/Manage';

export default function App() {
  const { status } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!status) return;
    if (status.setup_needed && window.location.pathname !== '/setup') {
      navigate('/setup');
    } else if (!status.authenticated && !status.setup_needed && window.location.pathname !== '/login') {
      navigate('/login');
    } else if (status.authenticated && (window.location.pathname === '/login' || window.location.pathname === '/setup')) {
      navigate('/');
    }
  }, [status]);

  if (!status) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/setup"  element={<Setup />} />
      <Route path="/login"  element={<Login />} />
      <Route path="/manage" element={<Manage />} />
      <Route path="/"       element={<Chat />} />
      <Route path="*"       element={<Navigate to="/" replace />} />
    </Routes>
  );
}
