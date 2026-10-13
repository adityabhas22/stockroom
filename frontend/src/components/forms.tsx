import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  ClipboardList,
  Package,
  Plus,
  SlidersHorizontal,
} from 'lucide-react';
import { api, errorMessage, Item, Movement, Page } from '../api';
import { Modal, Badge, number, date } from './ui';

export function Login({ onLogin }: { onLogin: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/session', {
        method: 'POST',
        body: JSON.stringify({ password: new FormData(event.currentTarget).get('password') }),
      });
      onLogin();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <div className="login-story">
        <div className="brand">
          <Box /> stockroom<span>®</span>
        </div>
        <div>
          <p className="eyebrow">A PLACE FOR EVERY PART</p>
          <h1>
            Know what’s
            <br />
            on the shelf.
          </h1>
          <p>
            Inventory, receipts, and issues.
            <br />
            One record everyone can work from.
          </p>
        </div>
        <span className="login-foot">STOCKROOM / INVENTORY & OPERATIONS</span>
      </div>
      <form className="login-form" onSubmit={submit}>
        <span className="small-mark">
          <Package size={26} />
        </span>
        <h2>Open your stockroom</h2>
        <p>Enter the workspace password to continue.</p>
        <label>
          Workspace password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
          <ArrowRight size={17} />
        </button>
        <p className="login-note">
          This workspace uses a shared operator account.
          <br />
          Changes are recorded in the movement ledger.
        </p>
      </form>
    </main>
  );
}

export function ItemForm({
  item,
  close,
  saved,
}: {
  item?: Item;
  close: () => void;
  saved: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError('');
    const payload = {
      ...data,
      sku: String(data.sku).trim().toUpperCase(),
      reorder_point: Number(data.reorder_point),
      ...(item ? { version: item.version } : {}),
    };
    try {
      await api(item ? `/items/${item.id}` : '/items', {
        method: item ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      saved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={item ? 'Edit item' : 'Add an item'} close={() => !busy && close()}>
      <form onSubmit={submit} className="form-body">
        <p className="muted">
          {item
            ? 'Update item details. Stock changes belong in the ledger.'
            : 'Start with the item details, then record a receipt to add stock.'}
        </p>
        <label>
          Item name
          <input
            name="name"
            defaultValue={item?.name}
            required
            minLength={2}
            maxLength={120}
            placeholder="e.g. USB-C cable · 1 m"
            autoFocus
          />
        </label>
        <div className="form-grid">
          <label>
            SKU
            <input
              name="sku"
              defaultValue={item?.sku}
              required
              minLength={2}
              maxLength={32}
              pattern="[A-Za-z0-9][A-Za-z0-9-]+"
              placeholder="CAB-001"
            />
          </label>
          <label>
            Category
            <input
              name="category"
              defaultValue={item?.category}
              required
              maxLength={40}
              placeholder="Cables"
              list="categories"
            />
          </label>
        </div>
        <datalist id="categories">
          <option>Cables</option>
          <option>Components</option>
          <option>Tools</option>
          <option>Consumables</option>
        </datalist>
        <div className="form-grid">
          <label>
            Shelf location
            <input
              name="location"
              defaultValue={item?.location}
              required
              maxLength={40}
              placeholder="A-01"
            />
          </label>
          <label>
            Reorder at
            <input
              name="reorder_point"
              type="number"
              min="0"
              max="1000000"
              step="1"
              defaultValue={item?.reorder_point ?? 5}
              required
            />
          </label>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Saving…' : item ? 'Save changes' : 'Create item'}
            <Check size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function StockForm({
  item,
  close,
  saved,
}: {
  item: Item;
  close: () => void;
  saved: () => void;
}) {
  const [kind, setKind] = useState<'receive' | 'issue'>('receive');
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const attempt = useRef({ fingerprint: '', key: crypto.randomUUID() });
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const note = String(new FormData(e.currentTarget).get('note')).trim();
    const delta = Number(quantity) * (kind === 'receive' ? 1 : -1);
    const fingerprint = JSON.stringify({ delta, note });
    if (attempt.current.fingerprint !== fingerprint)
      attempt.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true);
    setError('');
    try {
      await api(`/items/${item.id}/movements`, {
        method: 'POST',
        body: JSON.stringify({ delta, note, request_id: attempt.current.key }),
      });
      saved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Record a stock movement" close={() => !busy && close()}>
      <form className="form-body" onSubmit={submit}>
        <div className="item-callout">
          <span className="item-icon">
            <Package />
          </span>
          <div>
            <strong>{item.name}</strong>
            <p className="mono">
              {item.sku} · {item.location}
            </p>
          </div>
          <strong>
            {number(item.quantity)}
            <small>on hand</small>
          </strong>
        </div>
        <div className="segmented" aria-label="Movement type">
          <button
            type="button"
            className={kind === 'receive' ? 'selected' : ''}
            aria-pressed={kind === 'receive'}
            onClick={() => setKind('receive')}
          >
            <ArrowDownLeft size={17} />
            Receive stock
          </button>
          <button
            type="button"
            className={kind === 'issue' ? 'selected' : ''}
            aria-pressed={kind === 'issue'}
            onClick={() => setKind('issue')}
          >
            <ArrowUpRight size={17} />
            Issue stock
          </button>
        </div>
        <label>
          Units to {kind}
          <input
            type="number"
            min="1"
            max={kind === 'issue' ? item.quantity : 1000000}
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label>
          Reason or reference
          <input
            name="note"
            minLength={3}
            maxLength={240}
            required
            placeholder={
              kind === 'receive' ? 'e.g. Delivery PO-1042' : 'e.g. Issued to robotics lab'
            }
          />
        </label>
        <p className="balance">
          Balance after this movement{' '}
          <strong>
            {number(item.quantity + (Number(quantity) || 0) * (kind === 'receive' ? 1 : -1))} units
          </strong>
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Recording…' : 'Record movement'}
            <Check size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ItemDetail({
  item,
  close,
  edit,
  move,
  archived,
}: {
  item: Item;
  close: () => void;
  edit: () => void;
  move: () => void;
  archived: () => void;
}) {
  const [history, setHistory] = useState<Page<Movement> | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api<Page<Movement>>(`/movements?item_id=${item.id}&limit=20`, { signal: controller.signal })
      .then(setHistory)
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [item.id]);
  async function archive() {
    setBusy(true);
    try {
      await api(`/items/${item.id}`, { method: 'DELETE' });
      archived();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={item.name} close={() => !busy && close()} wide>
      <div className="form-body">
        <div className="detail-meta">
          <span className="mono">{item.sku}</span>
          <span>{item.category}</span>
          <span>Shelf {item.location}</span>
        </div>
        <div className="detail-stock">
          <div>
            <span className="eyebrow">ON HAND</span>
            <strong>
              {number(item.quantity)} <small>units</small>
            </strong>
          </div>
          <Badge item={item} />
          <button className="primary" onClick={move}>
            Record movement
            <Plus size={16} />
          </button>
        </div>
        <div className="detail-label">
          <h3>Movement history</h3>
          <span>Reorder at {item.reorder_point} units</span>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!history ? (
          <p role="status">Loading history…</p>
        ) : history.items.length ? (
          <>
            <div className="history">
              {history.items.map((m) => (
                <div key={m.id}>
                  <span className={m.delta > 0 ? 'delta positive' : 'delta'}>
                    {m.delta > 0 ? '+' : ''}
                    {m.delta}
                  </span>
                  <div>
                    <strong>{m.note}</strong>
                    <small>{date(m.created_at)}</small>
                  </div>
                  <span>{m.balance} left</span>
                </div>
              ))}
            </div>
            {history.total > 20 && (
              <p className="muted">
                Showing the latest 20 of {history.total} movements. Open the movement ledger for the
                full history.
              </p>
            )}
          </>
        ) : (
          <div className="empty compact">
            <ClipboardList />
            <p>No movements yet. Record the first receipt.</p>
          </div>
        )}
        {confirm && (
          <div className="archive-confirm">
            <p>Archive {item.sku}? Its movement history will remain in the ledger.</p>
            <button onClick={archive} disabled={busy} className="danger">
              {busy ? 'Archiving…' : 'Confirm archive'}
            </button>
            <button onClick={() => setConfirm(false)} disabled={busy}>
              Keep item
            </button>
          </div>
        )}
        <div className="dialog-actions split">
          <button
            onClick={() => setConfirm(true)}
            disabled={item.quantity > 0 || busy}
            title={
              item.quantity > 0 ? 'Issue all remaining stock before archiving' : 'Archive this item'
            }
          >
            <Archive size={16} />
            Archive item
          </button>
          <button onClick={edit}>
            Edit details
            <SlidersHorizontal size={16} />
          </button>
        </div>
      </div>
    </Modal>
  );
}
