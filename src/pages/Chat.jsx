import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import Sidebar from '../components/Sidebar';
import MessageItem, { DateSeparator } from '../components/MessageItem';
import ComposeBar from '../components/ComposeBar';
import CreateChannelModal from '../components/CreateChannelModal';
import MemberPanel from '../components/MemberPanel';

function isSameDay(a, b) {
  const da = new Date(a), db = new Date(b);
  return da.toDateString() === db.toDateString();
}

function shouldGroup(prev, curr) {
  if (!prev) return false;
  if (prev.sender_id !== curr.sender_id) return false;
  return new Date(curr.created_at) - new Date(prev.created_at) < 5 * 60 * 1000;
}

export default function Chat() {
  const navigate = useNavigate();
  const [authInfo, setAuthInfo]         = useState(null);
  const [channels, setChannels]         = useState([]);
  const [activeId, setActiveId]         = useState(null);
  const [messages, setMessages]         = useState([]);
  const [loadingMsgs, setLoadingMsgs]   = useState(false);
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [showCreate, setShowCreate]     = useState(false);
  const [showMembers, setShowMembers]   = useState(false);
  const bottomRef = useRef(null);
  const esRef     = useRef(null);

  useEffect(() => {
    api.get('/auth/status').then(s => {
      if (!s.authenticated) { navigate('/login'); return; }
      setAuthInfo(s);
    }).catch(() => navigate('/login'));
  }, []);

  async function loadChannels() {
    const chs = await api.get('/channels');
    setChannels(chs);
    return chs;
  }

  useEffect(() => {
    loadChannels().then(chs => {
      if (!activeId && chs.length > 0) setActiveId(chs[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeId) return;
    setLoadingMsgs(true);
    setMessages([]);
    api.get(`/channels/${activeId}/messages?limit=50`)
      .then(msgs => { setMessages(msgs); })
      .catch(() => {})
      .finally(() => setLoadingMsgs(false));
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // SSE
  useEffect(() => {
    if (!authInfo) return;
    const es = new EventSource('/api/stream', { withCredentials: true });
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === 'message') {
          const msg = event.data;
          if (msg.channel_id === activeId) {
            setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
          }
          loadChannels();
        } else if (event.type === 'message_deleted') {
          setMessages(prev => prev.filter(m => m.id !== event.message_id));
        } else if (event.type === 'channels_updated') {
          loadChannels();
        } else if (event.type === 'file_ready') {
          setMessages(prev => prev.map(m =>
            m.file_id === event.file_id
              ? { ...m, has_preview: event.has_preview, has_thumb: event.has_thumb }
              : m
          ));
        }
      } catch (_) {}
    };
    return () => es.close();
  }, [authInfo, activeId]);

  async function deleteMessage(id) {
    if (!confirm('Delete this message?')) return;
    await api.delete(`/messages/${id}`);
    setMessages(prev => prev.filter(m => m.id !== id));
  }

  function handleCreated(channelId) {
    setShowCreate(false);
    loadChannels().then(() => setActiveId(channelId));
  }

  const activeChannel = channels.find(c => c.id === activeId);
  const myDeviceId    = authInfo?.device_id;
  const isAdmin       = authInfo?.is_admin;

  function channelTitle(ch) {
    if (!ch) return '';
    if (ch.type === 'all')    return '# All Devices';
    if (ch.type === 'direct') return ch.name || 'Direct';
    return ch.name || 'Group';
  }

  // Build message list with date separators and grouping info
  const messageItems = [];
  messages.forEach((msg, i) => {
    const prev = messages[i - 1];
    if (!prev || !isSameDay(prev.created_at, msg.created_at)) {
      messageItems.push({ type: 'separator', iso: msg.created_at, key: 'sep-' + msg.id });
    }
    messageItems.push({
      type: 'message',
      msg,
      grouped: shouldGroup(prev, msg),
      key: msg.id,
    });
  });

  return (
    <div className="h-full flex overflow-hidden" style={{ background: '#f4f4f6' }}>
      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-40 w-72 transform transition-transform sm:relative sm:translate-x-0 sm:z-auto sm:w-64 shrink-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar
          channels={channels}
          activeId={activeId}
          onSelect={id => { setActiveId(id); setShowMembers(false); }}
          onClose={() => setSidebarOpen(false)}
          onCreateChannel={() => setShowCreate(true)}
          deviceName={authInfo?.device_name || '…'}
          isAdmin={isAdmin}
        />
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 sm:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="bg-white border-b border-zinc-200 px-4 py-3 flex items-center gap-3 shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="sm:hidden p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-500">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>

          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-zinc-900 truncate text-sm">{channelTitle(activeChannel)}</h2>
            {activeChannel && (
              <p className="text-xs text-zinc-400">
                {activeChannel.member_count} member{activeChannel.member_count !== 1 ? 's' : ''}
                {activeChannel.type === 'all' && ' · everyone'}
              </p>
            )}
          </div>

          {/* Members button */}
          {activeChannel && (
            <button
              onClick={() => setShowMembers(m => !m)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                showMembers ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-zinc-100 text-zinc-500'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              {activeChannel.member_count}
            </button>
          )}

          {/* Manage link (admin) */}
          {isAdmin && (
            <button onClick={() => navigate('/manage')} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-700 transition-colors" title="Manage">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </button>
          )}
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin">
            {!activeId && (
              <div className="h-full flex flex-col items-center justify-center text-zinc-400 gap-3">
                <svg className="w-14 h-14 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"/>
                </svg>
                <p className="text-sm">Select a channel to start</p>
              </div>
            )}

            {activeId && loadingMsgs && (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {activeId && !loadingMsgs && messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-zinc-400">
                <svg className="w-12 h-12 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"/>
                </svg>
                <p className="text-sm font-medium">No messages yet</p>
                <p className="text-xs">Send something to get started</p>
              </div>
            )}

            {messageItems.map(item =>
              item.type === 'separator'
                ? <DateSeparator key={item.key} iso={item.iso} />
                : <MessageItem
                    key={item.key}
                    msg={item.msg}
                    isMine={item.msg.sender_id === myDeviceId}
                    isGrouped={item.grouped}
                    onDelete={deleteMessage}
                  />
            )}
            <div ref={bottomRef} className="h-2" />
          </div>

          {/* Member panel */}
          {showMembers && activeChannel && (
            <MemberPanel
              channel={activeChannel}
              myDeviceId={myDeviceId}
              isAdmin={isAdmin}
              onClose={() => setShowMembers(false)}
            />
          )}
        </div>

        {/* Compose */}
        {activeId && (
          <div className="shrink-0 relative">
            <ComposeBar channelId={activeId} onSent={() => {
              setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
            }} />
          </div>
        )}
      </div>

      {/* Create channel modal */}
      {showCreate && (
        <CreateChannelModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
          myDeviceId={myDeviceId}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
