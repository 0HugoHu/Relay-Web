import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

function DeviceRow({ device, onRename, onDelete, onToggleAdmin }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(device.name);

  function save() {
    if (name.trim() && name !== device.name) onRename(device.id, name.trim());
    setEditing(false);
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 group">
      <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm shrink-0">
        {device.name[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={save}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
            className="text-sm font-medium border-b border-blue-400 outline-none w-full bg-transparent"
          />
        ) : (
          <p className="text-sm font-medium text-slate-800 truncate">{device.name}</p>
        )}
        <p className="text-xs text-slate-400 font-mono truncate">{device.id}</p>
      </div>
      {device.is_admin ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">admin</span> : null}
      <p className="text-xs text-slate-400 hidden sm:block">{device.last_seen ? new Date(device.last_seen).toLocaleDateString() : 'Never'}</p>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => setEditing(true)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
        </button>
        <button onClick={() => onDelete(device.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>
    </div>
  );
}

export default function Manage() {
  const navigate = useNavigate();
  const [devices, setDevices]   = useState([]);
  const [channels, setChannels] = useState([]);
  const [tab, setTab]           = useState('devices');
  const [addId, setAddId]       = useState('');
  const [addName, setAddName]   = useState('');
  const [addAdmin, setAddAdmin] = useState(false);
  const [adding, setAdding]     = useState(false);
  const [error, setError]       = useState('');
  const [myId]                  = useState(() => localStorage.getItem('relay_candidate'));

  async function load() {
    const [d, c] = await Promise.all([api.get('/manage/devices'), api.get('/manage/channels')]);
    setDevices(d);
    setChannels(c);
  }

  useEffect(() => { load().catch(() => navigate('/login')); }, []);

  async function addDevice(e) {
    e.preventDefault();
    if (!addId.trim() || !addName.trim()) return;
    setAdding(true); setError('');
    try {
      await api.post('/manage/devices', { candidate_id: addId.trim(), name: addName.trim(), is_admin: addAdmin });
      setAddId(''); setAddName(''); setAddAdmin(false);
      load();
    } catch (err) {
      setError(err.message === 'device_already_exists' ? 'Device ID already added' : err.message);
    } finally { setAdding(false); }
  }

  async function removeDevice(id) {
    if (!confirm('Remove this device? They will lose access immediately.')) return;
    await api.delete(`/manage/devices/${id}`);
    load();
  }

  async function renameDevice(id, name) {
    await api.patch(`/manage/devices/${id}`, { name });
    load();
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <h1 className="font-semibold text-slate-900">Manage</h1>
        <div className="ml-auto flex gap-1 bg-slate-100 rounded-lg p-1">
          {['devices','channels'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${tab === t ? 'bg-white shadow text-slate-900 font-medium' : 'text-slate-500 hover:text-slate-700'}`}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full space-y-4">

        {tab === 'devices' && (
          <>
            {/* Add device */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="font-medium text-slate-900 mb-3">Add Device</h2>
              <form onSubmit={addDevice} className="space-y-3">
                <input
                  value={addId}
                  onChange={e => setAddId(e.target.value)}
                  placeholder="Device ID (from /login or /api/device/whoami)"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex gap-2">
                  <input
                    value={addName}
                    onChange={e => setAddName(e.target.value)}
                    placeholder="Device name (e.g. iPhone)"
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <label className="flex items-center gap-1.5 text-sm text-slate-600 shrink-0">
                    <input type="checkbox" checked={addAdmin} onChange={e => setAddAdmin(e.target.checked)} />
                    Admin
                  </label>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button
                  type="submit"
                  disabled={adding}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2 transition-colors"
                >
                  {adding ? 'Adding…' : 'Add Device'}
                </button>
              </form>

              <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500">Your device ID:</p>
                <p className="font-mono text-xs text-slate-700 break-all mt-0.5">{myId}</p>
              </div>
            </div>

            {/* Device list */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="font-medium text-slate-900 mb-2">Devices ({devices.length})</h2>
              {devices.length === 0
                ? <p className="text-sm text-slate-400 text-center py-4">No devices yet</p>
                : devices.map(d => (
                    <DeviceRow key={d.id} device={d}
                      onRename={renameDevice} onDelete={removeDevice} onToggleAdmin={() => {}} />
                  ))}
            </div>
          </>
        )}

        {tab === 'channels' && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h2 className="font-medium text-slate-900 mb-3">Channels</h2>
            <div className="space-y-2">
              {channels.map(ch => (
                <div key={ch.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${ch.type === 'all' ? 'bg-green-100 text-green-700' : ch.type === 'direct' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
                    {ch.type === 'all' ? '#' : ch.type === 'direct' ? '↔' : '⊙'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{ch.name || 'Direct'}</p>
                    <p className="text-xs text-slate-400">{ch.member_count} member{ch.member_count !== 1 ? 's' : ''} · {ch.type}</p>
                  </div>
                  {ch.type !== 'all' && (
                    <button onClick={() => api.delete(`/manage/channels/${ch.id}`).then(load)}
                      className="p-1.5 text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
