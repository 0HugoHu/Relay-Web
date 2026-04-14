import React, { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function MemberPanel({ channel, myDeviceId, isAdmin, onClose }) {
  const [members, setMembers]   = useState([]);
  const [devices, setDevices]   = useState([]);
  const [adding, setAdding]     = useState(false);
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(false);

  async function loadMembers() {
    if (!channel) return;
    try {
      const m = await api.get(`/manage/channels/${channel.id}/members`);
      setMembers(m);
    } catch {
      // non-admin: try channel devices endpoint
      try {
        const all = await api.get('/channels/devices');
        // Filter to members we know about from channel info
        setDevices(all);
      } catch {}
    }
  }

  useEffect(() => {
    loadMembers();
    api.get('/channels/devices').then(setDevices).catch(() => {});
  }, [channel?.id]);

  const memberIds = new Set(members.map(m => m.id));
  const nonMembers = devices.filter(d => !memberIds.has(d.id));
  const filtered = nonMembers.filter(d =>
    !search || d.name.toLowerCase().includes(search.toLowerCase())
  );

  async function addMember(deviceId) {
    setLoading(true);
    try {
      await api.post(`/manage/channels/${channel.id}/members`, { device_id: deviceId });
      loadMembers();
      setSearch('');
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function removeMember(deviceId) {
    if (!confirm('Remove this member?')) return;
    try {
      await api.delete(`/manage/channels/${channel.id}/members/${deviceId}`);
      loadMembers();
    } catch (err) {
      alert(err.message);
    }
  }

  function timeSince(iso) {
    if (!iso) return 'Never';
    const m = Math.floor((Date.now() - new Date(iso)) / 60000);
    if (m < 2) return 'Just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  if (!channel) return null;

  return (
    <div className="flex flex-col h-full bg-white border-l border-zinc-200 w-72 shrink-0">
      {/* Header */}
      <div className="px-4 py-4 border-b border-zinc-100 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-zinc-900 text-sm">{channel.name || 'Direct'}</h3>
          <p className="text-xs text-zinc-400 mt-0.5">{members.length} members</p>
        </div>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-zinc-100 text-zinc-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Member list */}
        <div>
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-2">Members</p>
          <div className="space-y-1">
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-zinc-50 group">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm shrink-0">
                  {m.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-800 truncate">
                    {m.name} {m.id === myDeviceId && <span className="text-xs text-zinc-400">(you)</span>}
                  </p>
                  <p className="text-xs text-zinc-400">{timeSince(m.last_seen)}</p>
                </div>
                {isAdmin && m.id !== myDeviceId && channel.type !== 'all' && (
                  <button onClick={() => removeMember(m.id)}
                    className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-red-400 transition-opacity">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Add members — admin only, not for 'all' and not for direct */}
        {isAdmin && channel.type === 'group' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Add Member</p>
              <button onClick={() => setAdding(a => !a)} className="text-xs text-indigo-600 hover:text-indigo-700">
                {adding ? 'Cancel' : '+ Add'}
              </button>
            </div>

            {adding && (
              <div className="space-y-2">
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search devices…"
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {filtered.length === 0 && (
                    <p className="text-xs text-zinc-400 text-center py-3">No devices to add</p>
                  )}
                  {filtered.map(d => (
                    <button key={d.id} onClick={() => addMember(d.id)} disabled={loading}
                      className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-indigo-50 text-left disabled:opacity-50">
                      <div className="w-7 h-7 rounded-full bg-zinc-200 flex items-center justify-center text-xs font-semibold text-zinc-600">
                        {d.name[0].toUpperCase()}
                      </div>
                      <span className="text-sm text-zinc-700">{d.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
