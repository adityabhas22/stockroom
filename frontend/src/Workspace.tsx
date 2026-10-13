import { useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  ChevronRight,
  ClipboardList,
  Download,
  Layers3,
  LogOut,
  Package,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { api, ApiError, errorMessage, Item, Movement, Page, Summary } from './api';
import { Badge, number, date } from './components/ui';
import { ItemForm, StockForm, ItemDetail } from './components/forms';

export function Workspace({ logout }: { logout: () => void }) {
  const [view, setView] = useState<'inventory' | 'movements'>('inventory');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<Page<Item>>({ items: [], total: 0 });
  const [ledger, setLedger] = useState<Page<Movement>>({ items: [], total: 0 });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [modal, setModal] = useState<{
    type: 'create' | 'edit' | 'stock' | 'detail';
    item?: Item;
  } | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setOffset(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const options = { signal: controller.signal };
    Promise.all([
      api<Summary>('/summary', options),
      view === 'inventory'
        ? api<Page<Item>>(
            `/items?${new URLSearchParams({ q: query, status: filter, offset: String(offset), limit: '12' })}`,
            options,
          )
        : api<Page<Movement>>(`/movements?offset=${offset}&limit=12`, options),
    ])
      .then(([s, result]) => {
        setSummary(s);
        if (view === 'inventory') setItems(result as Page<Item>);
        else setLedger(result as Page<Movement>);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        if (e instanceof ApiError && e.status === 401) logout();
        else setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, filter, offset, view, revision]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  function saved(message: string) {
    setModal(null);
    setNotice(message);
    setRevision((r) => r + 1);
  }
  function navigate(next: typeof view) {
    setView(next);
    setOffset(0);
    setSearch('');
    setQuery('');
  }
  function exportPage() {
    const rows = [
      ['SKU', 'Name', 'Category', 'Location', 'On hand', 'Reorder point'],
      ...items.items.map((i) => [
        i.sku,
        i.name,
        i.category,
        i.location,
        i.quantity,
        i.reorder_point,
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((cell) => {
            let s = String(cell);
            if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
            return `"${s.replaceAll('"', '""')}"`;
          })
          .join(','),
      )
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'stockroom-inventory-page.csv';
    link.click();
    URL.revokeObjectURL(url);
  }
  const total = view === 'inventory' ? items.total : ledger.total;
  return (
    <div className="workspace">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Stockroom home">
          <Box size={26} />
          stockroom
        </a>
        <div className="workspace-label">
          <span className="workspace-avatar">S</span>
          <div>
            <strong>Workshop stores</strong>
            <small>Inventory workspace</small>
          </div>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          <button
            className={view === 'inventory' ? 'active' : ''}
            onClick={() => navigate('inventory')}
          >
            <Layers3 size={18} />
            Inventory<span>{summary?.items ?? '—'}</span>
          </button>
          <button
            className={view === 'movements' ? 'active' : ''}
            onClick={() => navigate('movements')}
          >
            <ClipboardList size={18} />
            Movements
          </button>
        </nav>
        <div className="sidebar-note">
          <Package size={21} />
          <p>
            Stock changes are recorded
            <br />
            in the movement ledger.
          </p>
        </div>
        <button
          className="account"
          onClick={async () => {
            try {
              await api('/session', { method: 'DELETE' });
              logout();
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        >
          <span className="avatar">OP</span>
          <span>
            <strong>Operator</strong>
            <small>Sign out</small>
          </span>
          <LogOut size={16} />
        </button>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <span>
            Workspace <ChevronRight size={13} />{' '}
            <strong>{view === 'inventory' ? 'Inventory' : 'Movements'}</strong>
          </span>
          <span className="today">
            {new Intl.DateTimeFormat(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            }).format(new Date())}
          </span>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">WORKSHOP STORES</p>
              <h1>
                {view === 'inventory' ? 'Inventory' : 'Movement ledger'}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {view === 'inventory'
                  ? 'What’s on hand, what’s running low, and where to find it.'
                  : 'Every receipt and issue, in the order it happened.'}
              </p>
            </div>
            <button className="primary" onClick={() => setModal({ type: 'create' })}>
              <Plus size={18} />
              Add item
            </button>
          </div>
          <section className="summary" aria-label="Inventory totals">
            <div>
              <span>
                Active items
                <Layers3 size={17} />
              </span>
              <strong>{summary ? number(summary.items) : '—'}</strong>
              <small>Distinct items in the stockroom</small>
            </div>
            <div>
              <span>
                Units on hand
                <Package size={17} />
              </span>
              <strong>{summary ? number(summary.units) : '—'}</strong>
              <small>Across all shelf locations</small>
            </div>
            <button
              onClick={() => {
                navigate('inventory');
                setFilter('low');
              }}
            >
              <span>
                Low stock
                <span className="tiny-dot amber" />
              </span>
              <strong>{summary ? number(summary.low) : '—'}</strong>
              <small>
                At or below the reorder point
                <ArrowUpRight size={15} />
              </small>
            </button>
            <button
              onClick={() => {
                navigate('inventory');
                setFilter('out');
              }}
            >
              <span>
                Out of stock
                <span className="tiny-dot red" />
              </span>
              <strong>{summary ? number(summary.out) : '—'}</strong>
              <small>
                Items that need replenishment
                <ArrowUpRight size={15} />
              </small>
            </button>
          </section>
          <section className="inventory-panel">
            <div className="panel-heading">
              <div>
                <h2>{view === 'inventory' ? 'All inventory' : 'Stock movements'}</h2>
                <span>
                  {view === 'inventory'
                    ? 'Keep the shelves accounted for.'
                    : 'The ledger is retained when items are archived.'}
                </span>
              </div>
              {view === 'inventory' && (
                <button
                  className="subtle"
                  onClick={exportPage}
                  disabled={loading || !!error || !items.items.length}
                >
                  <Download size={16} />
                  Export page
                </button>
              )}
            </div>
            {view === 'inventory' && (
              <div className="toolbar">
                <div className="tabs" aria-label="Stock filter">
                  {[
                    ['all', 'All items'],
                    ['low', 'Low stock'],
                    ['out', 'Out of stock'],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      aria-pressed={filter === key}
                      className={filter === key ? 'selected' : ''}
                      onClick={() => {
                        setFilter(key);
                        setOffset(0);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label="Search inventory"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name or SKU…"
                  />
                  {search && (
                    <button aria-label="Clear search" onClick={() => setSearch('')}>
                      <X size={14} />
                    </button>
                  )}
                </label>
              </div>
            )}
            {error ? (
              <div className="empty">
                <p className="error" role="alert">
                  {error}
                </p>
                <button onClick={() => setRevision((r) => r + 1)}>Try again</button>
              </div>
            ) : loading ? (
              <div className="loading" role="status">
                <span />
                Loading {view === 'inventory' ? 'inventory' : 'movements'}…
              </div>
            ) : !total ? (
              <div className="empty">
                <Package size={34} />
                <h3>
                  {query || (filter !== 'all' && view === 'inventory')
                    ? 'No matching items'
                    : view === 'inventory'
                      ? 'Your shelves start here'
                      : 'No movements recorded'}
                </h3>
                <p>
                  {view === 'inventory'
                    ? query || filter !== 'all'
                      ? 'Try another search or stock filter.'
                      : 'Add your first item, then record a receipt.'
                    : 'Receive or issue stock from an item to start the ledger.'}
                </p>
                {view === 'inventory' && !query && filter === 'all' && (
                  <button onClick={() => setModal({ type: 'create' })}>
                    <Plus size={16} />
                    Add first item
                  </button>
                )}
              </div>
            ) : (
              <div className="table-scroll">
                <table className={view === 'inventory' ? 'inventory-table' : 'ledger-table'}>
                  <thead>
                    <tr>
                      {(view === 'inventory'
                        ? ['Item / SKU', 'Category', 'Location', 'On hand', 'Stock status', '']
                        : ['Item / SKU', 'Movement', 'Reason / reference', 'Balance', 'Recorded']
                      ).map((h, i) => (
                        <th key={i} scope="col">
                          {h || <span className="sr-only">Actions</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {view === 'inventory'
                      ? items.items.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <button
                                className="item-link"
                                onClick={() => setModal({ type: 'detail', item })}
                              >
                                <span className={`item-icon cat-${item.category.length % 3}`}>
                                  <Package size={20} />
                                </span>
                                <span>
                                  <strong>{item.name}</strong>
                                  <small className="mono">{item.sku}</small>
                                </span>
                              </button>
                            </td>
                            <td>{item.category}</td>
                            <td>
                              <span className="location mono">{item.location}</span>
                            </td>
                            <td className="quantity">
                              <strong>{number(item.quantity)}</strong>
                              <span> / min {item.reorder_point}</span>
                            </td>
                            <td>
                              <Badge item={item} />
                            </td>
                            <td>
                              <button
                                className="row-action"
                                aria-label={`Record movement for ${item.name}`}
                                onClick={() => setModal({ type: 'stock', item })}
                              >
                                <Plus size={16} />
                                <span>Movement</span>
                              </button>
                            </td>
                          </tr>
                        ))
                      : ledger.items.map((m) => (
                          <tr key={m.id}>
                            <td>
                              <strong>{m.name}</strong>
                              <small className="mono">{m.sku}</small>
                            </td>
                            <td>
                              <span className={m.delta > 0 ? 'delta positive' : 'delta'}>
                                {m.delta > 0 ? (
                                  <ArrowDownLeft size={15} />
                                ) : (
                                  <ArrowUpRight size={15} />
                                )}{' '}
                                {m.delta > 0 ? '+' : ''}
                                {number(m.delta)}
                              </span>
                            </td>
                            <td className="note-cell">{m.note}</td>
                            <td className="mono">{number(m.balance)}</td>
                            <td className="date-cell">{date(m.created_at)}</td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="table-footer">
              <span>
                {loading
                  ? 'Updating…'
                  : total
                    ? `${offset + 1}–${Math.min(offset + 12, total)} of ${number(total)} ${view === 'inventory' ? 'items' : 'movements'}`
                    : '0 records'}
              </span>
              <div>
                <button
                  aria-label="Previous page"
                  disabled={offset === 0 || loading}
                  onClick={() => setOffset((o) => Math.max(0, o - 12))}
                >
                  <ArrowLeft size={15} />
                </button>
                <button
                  aria-label="Next page"
                  disabled={offset + 12 >= total || loading}
                  onClick={() => setOffset((o) => o + 12)}
                >
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </section>
          <footer className="page-footer">
            <span>STOCKROOM</span>
            <span>Inventory & movement ledger</span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
      {modal?.type === 'create' && (
        <ItemForm
          close={() => setModal(null)}
          saved={() => saved('Item created. Record a receipt to add stock.')}
        />
      )}
      {modal?.type === 'edit' && (
        <ItemForm
          item={modal.item}
          close={() => setModal(null)}
          saved={() => saved('Item details saved.')}
        />
      )}
      {modal?.type === 'stock' && (
        <StockForm
          item={modal.item!}
          close={() => setModal(null)}
          saved={() => saved('Stock movement recorded.')}
        />
      )}
      {modal?.type === 'detail' && (
        <ItemDetail
          item={modal.item!}
          close={() => setModal(null)}
          edit={() => setModal({ ...modal, type: 'edit' })}
          move={() => setModal({ ...modal, type: 'stock' })}
          archived={() => saved('Item archived. Its history is still in the ledger.')}
        />
      )}
    </div>
  );
}
