import React, { useState } from 'react';

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function ChannelIcon({ type, name }) {
  const letter = (name || '?')[0].toUpperCase();
  if (type === 'all')    return <span className="text-emerald-400 font-bold text-base">#</span>;
  if (type === 'direct') return <span className="text-violet-400 font-bold text-base">↔</span>;
  return <span className="text-amber-400 font-bold text-sm">{letter}</span>;
}

function ChannelRow({ ch, isActive, onSelect, onSettings, isAdmin }) {
  const [hovering, setHovering] = useState(false);
  const preview = ch.last_type && ch.last_type !== 'text'
    ? `[${ch.last_type}]`
    : ch.last_text?.slice(0, 45) || 'No messages yet';

  return (
    <button
      onClick={() => onSelect(ch.id)}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors rounded-lg mx-1 ${
        isActive ? 'bg-white/10' : 'hover:bg-white/5'
      }`}
      style={{ width: 'calc(100% - 8px)' }}
    >
      <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center ${
        isActive ? 'bg-white/15' : 'bg-white/8'
      }`} style={{ background: isActive ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)' }}>
        <ChannelIcon type={ch.type} name={ch.name} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-1">
          <p className={`text-sm font-semibold truncate ${isActive ? 'text-white' : 'text-zinc-200'}`}>
            {ch.name || 'Direct'}
          </p>
          {ch.last_at && (
            <span className="text-[11px] text-zinc-500 shrink-0">{timeAgo(ch.last_at)}</span>
          )}
        </div>
        <p className="text-xs text-zinc-500 truncate mt-0.5">{preview}</p>
      </div>

      {isAdmin && hovering && (
        <button
          onClick={e => { e.stopPropagation(); onSettings(ch); }}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-zinc-400 hover:text-white"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
          </svg>
        </button>
      )}
    </button>
  );
}

export default function Sidebar({ channels, activeId, onSelect, onClose, onCreateChannel, deviceName, isAdmin }) {
  const pinned  = channels.filter(c => c.type === 'all');
  const rest    = channels.filter(c => c.type !== 'all');

  return (
    <div className="flex flex-col h-full" style={{ background: '#111318' }}>
      {/* Header */}
      <div className="px-4 py-4 flex items-center justify-between border-b border-white/8" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div>
          <h1 className="font-bold text-white text-lg leading-none tracking-tight">Relay</h1>
          <p className="text-[11px] text-zinc-500 mt-0.5 truncate max-w-[150px]">{deviceName || '…'}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onCreateChannel}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/8 text-zinc-400 hover:text-white transition-colors"
            title="New channel or DM"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
          {onClose && (
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/8 text-zinc-500 hover:text-white sm:hidden">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto py-2 no-scrollbar">
        {/* Pinned: All Devices */}
        {pinned.length > 0 && (
          <div className="mb-1">
            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-4 py-1">Pinned</p>
            {pinned.map(ch => (
              <ChannelRow key={ch.id} ch={ch} isActive={ch.id === activeId}
                onSelect={id => { onSelect(id); onClose?.(); }}
                onSettings={() => {}} isAdmin={isAdmin} />
            ))}
          </div>
        )}

        {/* Groups & DMs */}
        {rest.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-4 py-1 mt-1">Channels</p>
            {rest.map(ch => (
              <ChannelRow key={ch.id} ch={ch} isActive={ch.id === activeId}
                onSelect={id => { onSelect(id); onClose?.(); }}
                onSettings={() => {}} isAdmin={isAdmin} />
            ))}
          </div>
        )}

        {channels.length === 0 && (
          <p className="text-xs text-zinc-600 text-center py-12 px-4">No channels yet.<br/>Click + to create one.</p>
        )}
      </div>

      {/* Footer */}
      <div className="border-t px-4 py-3 flex items-center gap-2" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
          {(deviceName || '?')[0].toUpperCase()}
        </div>
        <p className="text-xs text-zinc-400 truncate flex-1">{deviceName}</p>
      </div>
    </div>
  );
}
