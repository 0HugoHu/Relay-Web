import React, { useState, useRef } from 'react';
import { api } from '../api/client';
import PreviewModal from './PreviewModal';

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now - 86400000);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday)     return time;
  if (isYesterday) return `Yesterday · ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${time}`;
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function CopyBtn({ text, light }) {
  const [copied, setCopied] = useState(false);
  async function copy(e) {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={copy}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        light
          ? 'bg-white/20 hover:bg-white/30 text-white'
          : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600'
      }`}>
      {copied
        ? <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>Copied</>
        : <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>Copy</>
      }
    </button>
  );
}

// Date separator shown between messages on different days
export function DateSeparator({ iso }) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now - 86400000);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const label = isToday ? 'Today'
    : isYesterday ? 'Yesterday'
    : d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 h-px bg-zinc-200" />
      <span className="text-xs text-zinc-400 font-medium">{label}</span>
      <div className="flex-1 h-px bg-zinc-200" />
    </div>
  );
}

export default function MessageItem({ msg, isMine, isGrouped, onDelete }) {
  const [preview, setPreview] = useState(false);
  const [hovered, setHovered] = useState(false);
  const longPressTimer = useRef(null);

  const thumbUrl    = msg.file_id ? api.fileUrl(msg.file_id, 'thumb')    : null;
  const originalUrl = msg.file_id ? api.fileUrl(msg.file_id, 'original') : null;

  function startLongPress() {
    longPressTimer.current = setTimeout(() => setHovered(true), 500);
  }
  function cancelLongPress() {
    clearTimeout(longPressTimer.current);
  }

  const isMedia = msg.type === 'image' || msg.type === 'video';

  return (
    <div
      className={`flex gap-2.5 ${isMine ? 'flex-row-reverse' : 'flex-row'} ${isGrouped ? 'mt-0.5' : 'mt-3'}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={startLongPress}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
    >
      {/* Avatar — hidden when grouped */}
      <div className="shrink-0 w-8 mt-auto">
        {!isGrouped && !isMine && (
          <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-600 text-xs font-semibold">
            {(msg.sender_name || '?')[0].toUpperCase()}
          </div>
        )}
      </div>

      <div className={`flex flex-col gap-0.5 max-w-[75%] sm:max-w-[60%] ${isMine ? 'items-end' : 'items-start'}`}>
        {/* Name + time — only on first in group */}
        {!isGrouped && (
          <div className={`flex items-baseline gap-2 px-1 ${isMine ? 'flex-row-reverse' : ''}`}>
            {!isMine && <span className="text-xs font-semibold text-zinc-600">{msg.sender_name || 'Unknown'}</span>}
            <span className="text-[11px] text-zinc-400">{formatTime(msg.created_at)}</span>
            {msg.burn_on_read && <span className="text-[11px] text-rose-400">· burn</span>}
          </div>
        )}

        {/* Bubble */}
        <div className="relative group/bubble">
          {/* ── TEXT ── */}
          {msg.type === 'text' && (
            <div className={`relative rounded-2xl px-4 py-2.5 ${
              isMine
                ? 'bg-indigo-600 text-white rounded-tr-sm'
                : 'bg-white text-zinc-800 border border-zinc-200 rounded-tl-sm'
            }`}>
              <pre className="text-sm whitespace-pre-wrap break-words font-sans leading-relaxed">{msg.content}</pre>
              {/* Hover actions */}
              <div className={`absolute -bottom-1 ${isMine ? 'left-0 -translate-x-full pr-1' : 'right-0 translate-x-full pl-1'} flex items-center gap-1 opacity-0 group-hover/bubble:opacity-100 transition-opacity`}>
                <CopyBtn text={msg.content} light={false} />
              </div>
            </div>
          )}

          {/* ── IMAGE ── */}
          {msg.type === 'image' && (
            <div className={`relative overflow-hidden rounded-2xl ${isMine ? 'rounded-tr-sm' : 'rounded-tl-sm'} bg-zinc-100 cursor-pointer`}
              style={{ minWidth: 180, maxWidth: 320 }}
              onClick={() => msg.has_preview && setPreview(true)}>
              {msg.has_thumb ? (
                <img
                  src={thumbUrl}
                  alt={msg.filename}
                  className="w-full object-cover"
                  style={{ maxHeight: 280, display: 'block' }}
                />
              ) : (
                <div className="flex items-center justify-center bg-zinc-100 text-zinc-400 text-xs" style={{ height: 140 }}>
                  <svg className="w-8 h-8 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/>
                  </svg>
                </div>
              )}

              {/* Hover overlay: filename + actions */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2.5 opacity-0 group-hover/bubble:opacity-100 transition-opacity flex items-end justify-between gap-2">
                <p className="text-white text-xs font-medium truncate flex-1">{msg.filename}</p>
                <div className="flex gap-1.5 shrink-0">
                  {msg.has_preview && (
                    <button onClick={e => { e.stopPropagation(); setPreview(true); }}
                      className="w-7 h-7 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center text-white" title="View">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    </button>
                  )}
                  <a href={originalUrl} download={msg.filename} onClick={e => e.stopPropagation()}
                    className="w-7 h-7 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center text-white" title="Download">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* ── VIDEO ── */}
          {msg.type === 'video' && (
            <div className={`relative overflow-hidden rounded-2xl ${isMine ? 'rounded-tr-sm' : 'rounded-tl-sm'} bg-zinc-900 cursor-pointer`}
              style={{ minWidth: 180, maxWidth: 320 }}
              onClick={() => setPreview(true)}>
              {msg.has_thumb ? (
                <img src={thumbUrl} alt={msg.filename} className="w-full object-cover" style={{ maxHeight: 240, display: 'block' }} />
              ) : (
                <div className="bg-zinc-800 flex items-center justify-center" style={{ height: 160 }} />
              )}
              {/* Play overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-14 h-14 bg-black/50 rounded-full flex items-center justify-center backdrop-blur-sm">
                  <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
              </div>
              {/* Hover overlay */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2.5 opacity-0 group-hover/bubble:opacity-100 transition-opacity flex items-end justify-between gap-2">
                <p className="text-white text-xs font-medium truncate flex-1">{msg.filename}</p>
                <a href={originalUrl} download={msg.filename} onClick={e => e.stopPropagation()}
                  className="w-7 h-7 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center text-white shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                </a>
              </div>
            </div>
          )}

          {/* ── FILE ── */}
          {msg.type === 'file' && (
            <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl ${
              isMine
                ? 'bg-indigo-600 text-white rounded-tr-sm'
                : 'bg-white border border-zinc-200 text-zinc-800 rounded-tl-sm'
            }`} style={{ minWidth: 220, maxWidth: 300 }}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isMine ? 'bg-white/15' : 'bg-zinc-100'}`}>
                <svg className={`w-5 h-5 ${isMine ? 'text-white' : 'text-zinc-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{msg.filename}</p>
                <p className={`text-xs ${isMine ? 'text-indigo-200' : 'text-zinc-400'}`}>{formatSize(msg.size_bytes)}</p>
              </div>
              <a href={originalUrl} download={msg.filename}
                className={`w-8 h-8 flex items-center justify-center rounded-lg ${isMine ? 'hover:bg-white/15' : 'hover:bg-zinc-100'} transition-colors shrink-0`}>
                <svg className={`w-4 h-4 ${isMine ? 'text-white' : 'text-zinc-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
              </a>
            </div>
          )}

          {/* Delete — appears on hover outside bubble */}
          {hovered && (
            <button
              onClick={() => onDelete(msg.id)}
              className={`absolute top-0 ${isMine ? 'left-0 -translate-x-full pr-1.5' : 'right-0 translate-x-full pl-1.5'} w-6 h-6 flex items-center justify-center text-zinc-300 hover:text-red-400 transition-colors`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {preview && <PreviewModal item={msg} onClose={() => setPreview(false)} />}
    </div>
  );
}
