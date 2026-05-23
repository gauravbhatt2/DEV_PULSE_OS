import React, { useEffect, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

const typeStyles: Record<ToastType, string> = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
};

const typeIcons: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
};

function Toast({ message, type, onDismiss }: ToastMessage & { onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3500);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className={`flex items-center gap-2 px-4 py-3 rounded-xl border shadow-lg text-sm font-medium transition-all ${typeStyles[type]}`}
    >
      <span className="font-bold text-base leading-none">{typeIcons[type]}</span>
      <span>{message}</span>
      <button onClick={onDismiss} className="ml-2 opacity-50 hover:opacity-100 text-xs font-bold">✕</button>
    </div>
  );
}

export function ToastContainer({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full">
      {toasts.map((t) => (
        <Toast key={t.id} {...t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}
