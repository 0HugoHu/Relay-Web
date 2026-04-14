import React, { useState, useRef } from 'react';
import { api } from '../api/client';

const TTL_OPTIONS = [
  { label: 'Keep forever', value: 'never' },
  { label: 'Expires in 1h', value: '1h' },
  { label: 'Expires in 24h', value: '24h' },
  { label: 'Expires in 7 days', value: '7d' },
  { label: 'Expires in 30 days', value: '30d' },
];

export default function ComposeBar({ channelId, onSent }) {
  const [text, setText]           = useState('');
  const [ttl, setTtl]             = useState('never');
  const [burn, setBurn]           = useState(false);
  const [optionsOpen, setOptions] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver]   = useState(false);
  const fileRef = useRef(null);
  const textRef = useRef(null);

  async function sendText() {
    if (!text.trim() || uploading) return;
    const body = text.trim();
    setText('');
    if (textRef.current) { textRef.current.style.height = 'auto'; }
    try {
      await api.post(`/channels/${channelId}/messages`, {
        content: body,
        expires_in: ttl === 'never' ? null : ttl,
        burn_on_read: burn,
      });
      onSent?.();
    } catch (err) {
      setText(body); // restore on fail
      alert('Failed to send: ' + err.message);
    }
  }

  async function pasteFromClipboard() {
    try {
      const txt = await navigator.clipboard.readText();
      if (txt) { setText(t => t + txt); textRef.current?.focus(); return; }
    } catch (_) {}
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            await uploadFile(new File([blob], `paste.${type.split('/')[1]}`, { type }));
            return;
          }
        }
      }
    } catch (_) {}
  }

  async function uploadFile(file) {
    setUploading(true);
    try {
      await api.upload(channelId, file, { expiresIn: ttl === 'never' ? null : ttl, burnOnRead: burn });
      onSent?.();
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  function onFileChange(e) {
    Array.from(e.target.files || []).forEach(uploadFile);
    e.target.value = '';
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    Array.from(e.dataTransfer.files).forEach(uploadFile);
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
  }

  const hasOptions = ttl !== 'never' || burn;

  return (
    <div
      className={`border-t border-zinc-200 bg-white transition-colors ${dragOver ? 'bg-indigo-50' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {dragOver && (
        <div className="absolute inset-x-0 inset-y-0 bg-indigo-50/90 border-2 border-dashed border-indigo-400 rounded-xl flex items-center justify-center z-10 pointer-events-none mx-2 my-1">
          <p className="text-indigo-600 font-semibold text-sm">Drop to send</p>
        </div>
      )}

      {/* Options bar — shown when non-default options are active or options panel is open */}
      {optionsOpen && (
        <div className="flex items-center gap-4 px-4 py-2.5 border-b border-zinc-100 bg-zinc-50">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-zinc-500">Expiry</label>
            <select value={ttl} onChange={e => setTtl(e.target.value)}
              className="text-xs border border-zinc-200 rounded-lg px-2.5 py-1.5 bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-400">
              {TTL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-zinc-500 cursor-pointer select-none">
            <div onClick={() => setBurn(b => !b)}
              className={`w-9 h-5 rounded-full transition-colors relative ${burn ? 'bg-rose-500' : 'bg-zinc-200'}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${burn ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            Burn on read
          </label>
        </div>
      )}

      {/* Main input row */}
      <div className="flex items-end gap-2 px-3 py-3">
        {/* Options toggle */}
        <button
          onClick={() => setOptions(o => !o)}
          title="Options"
          className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-xl transition-colors ${
            optionsOpen || hasOptions ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-zinc-100 text-zinc-400'
          }`}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v.01M12 12v.01M12 18v.01M12 7a1 1 0 110-2 1 1 0 010 2zm0 6a1 1 0 110-2 1 1 0 010 2zm0 6a1 1 0 110-2 1 1 0 010 2z"/>
          </svg>
        </button>

        {/* Paste */}
        <button onClick={pasteFromClipboard} title="Paste from clipboard"
          className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
          </svg>
        </button>

        {/* Attach */}
        <button onClick={() => fileRef.current?.click()} title="Attach file"
          className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors">
          {uploading
            ? <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
          }
        </button>
        <input ref={fileRef} type="file" multiple className="hidden" onChange={onFileChange} />

        {/* Text area */}
        <textarea
          ref={textRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message… (Enter to send)"
          rows={1}
          className="flex-1 bg-zinc-100 border-0 rounded-xl px-4 py-2.5 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none overflow-hidden"
          style={{ minHeight: 42, maxHeight: 160 }}
          onInput={e => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
          }}
        />

        {/* Send */}
        <button onClick={sendText} disabled={!text.trim()}
          className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-900 disabled:opacity-25 text-white transition-colors">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5"/>
            <polyline points="5 12 12 5 19 12"/>
          </svg>
        </button>
      </div>

      {/* Active options indicator */}
      {!optionsOpen && hasOptions && (
        <div className="px-4 pb-2 flex gap-2">
          {ttl !== 'never' && (
            <span className="text-[11px] bg-amber-50 text-amber-600 border border-amber-200 rounded-full px-2 py-0.5">
              {TTL_OPTIONS.find(o => o.value === ttl)?.label}
            </span>
          )}
          {burn && (
            <span className="text-[11px] bg-rose-50 text-rose-600 border border-rose-200 rounded-full px-2 py-0.5">
              Burn on read
            </span>
          )}
        </div>
      )}
    </div>
  );
}
