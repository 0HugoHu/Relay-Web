import React, { useEffect } from 'react';
import { api } from '../api/client';

export default function PreviewModal({ item, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isImage = item.type === 'image';
  const isVideo = item.type === 'video';
  const previewUrl  = api.fileUrl(item.file_id, 'preview');
  const originalUrl = api.fileUrl(item.file_id, 'original');

  return (
    <div
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white p-2 z-10">
        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>

      <div className="max-w-5xl max-h-[90vh] flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        {isImage && (
          <img
            src={previewUrl}
            alt={item.filename}
            className="max-w-full max-h-[80vh] object-contain rounded-lg"
          />
        )}
        {isVideo && (
          <video
            src={originalUrl}
            controls
            autoPlay
            className="max-w-full max-h-[80vh] rounded-lg"
          />
        )}

        <div className="flex items-center justify-between text-white/70 text-sm px-1">
          <span className="truncate">{item.filename}</span>
          <a
            href={originalUrl}
            download={item.filename}
            className="ml-4 shrink-0 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
            onClick={e => e.stopPropagation()}
          >
            Download
          </a>
        </div>
      </div>
    </div>
  );
}
