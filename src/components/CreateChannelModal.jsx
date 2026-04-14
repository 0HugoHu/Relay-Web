import React, { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function CreateChannelModal({ onClose, onCreated, myDeviceId }) {
  const [tab, setTab]           = useState('group'); // 'group' | 'direct'
  const [name, setName]         = useState('');
  const [devices, setDevices]   = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    api.get('/channels/devices').then(setDevices).catch(() => {});
  }, []);

  const others = devices.filter(d => d.id !== myDeviceId);

  function toggleDevice(id) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (tab === 'direct') {
        if (selected.length !== 1) { setError('Pick one device'); setLoading(false); return; }
        const ch = await api.post('/channels/direct', { target_device_id: selected[0] });
        onCreated(ch.id);
      } else {
        if (!name.trim()) { setError('Enter a name'); setLoading(false); return; }
        if (selected.length === 0) { setError('Select at least one other member'); setLoading(false); return; }
        const members = [myDeviceId, ...selected];
        const ch = await api.post('/manage/channels', { name: name.trim(), member_ids: members });
        onCreated(ch.id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
          <h2 className="font-semibold text-zinc-900">New Conversation</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-zinc-100 text-zinc-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-5 pt-4 gap-2">
          {[['group','Group Chat'],['direct','Direct Message']].map(([key, label]) => (
            <button key={key} onClick={() => { setTab(key); setSelected([]); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === key ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}>
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          {tab === 'group' && (
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Channel name"
              className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )}

          <div>
            <p className="text-xs font-medium text-zinc-500 mb-2">
              {tab === 'direct' ? 'Select a device' : 'Add members'}
            </p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {others.length === 0 && (
                <p className="text-sm text-zinc-400 text-center py-4">No other devices found</p>
              )}
              {others.map(d => (
                <label key={d.id}
                  className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors ${
                    selected.includes(d.id) ? 'bg-indigo-50' : 'hover:bg-zinc-50'
                  }`}>
                  <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-sm font-semibold text-zinc-600 shrink-0">
                    {d.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-800">{d.name}</p>
                    <p className="text-xs text-zinc-400 font-mono truncate">{d.id.slice(0, 16)}…</p>
                  </div>
                  <input
                    type={tab === 'direct' ? 'radio' : 'checkbox'}
                    name="device"
                    checked={selected.includes(d.id)}
                    onChange={() => tab === 'direct' ? setSelected([d.id]) : toggleDevice(d.id)}
                    className="accent-indigo-600"
                  />
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors">
            {loading ? 'Creating…' : tab === 'direct' ? 'Open Chat' : 'Create Group'}
          </button>
        </form>
      </div>
    </div>
  );
}
