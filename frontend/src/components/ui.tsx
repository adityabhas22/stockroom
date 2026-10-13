import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Item } from '../api';

export const number = (n: number) => n.toLocaleString();
export const date = (s: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(s));
const stockStatus = (item: Item) =>
  item.quantity === 0
    ? 'Out of stock'
    : item.quantity <= item.reorder_point
      ? 'Low stock'
      : 'In stock';

export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    el.querySelector<HTMLInputElement>('input:not([type="hidden"])')?.focus();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? 'wide' : ''}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="dialog-head">
        <h2 id="dialog-title">{title}</h2>
        <button className="icon-button" aria-label="Close dialog" onClick={close}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function Badge({ item }: { item: Item }) {
  return (
    <span
      className={`badge ${item.quantity === 0 ? 'out' : item.quantity <= item.reorder_point ? 'low' : 'healthy'}`}
    >
      <i />
      {stockStatus(item)}
    </span>
  );
}
