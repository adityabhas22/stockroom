import React, {FormEvent, useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Archive, ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Box, Check, ChevronRight, ClipboardList, Download, Layers3, LogOut, Package, Plus, Search, SlidersHorizontal, X} from 'lucide-react';
import {api, ApiError, errorMessage, Item, Movement, Page, Summary} from './api';
import './style.css';

const number = (n: number) => n.toLocaleString();
const date = (s: string) => new Intl.DateTimeFormat(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'}).format(new Date(s));
const stockStatus = (item: Item) => item.quantity === 0 ? 'Out of stock' : item.quantity <= item.reorder_point ? 'Low stock' : 'In stock';

function Modal({title, children, close, wide = false}: {title: string; children: React.ReactNode; close: () => void; wide?: boolean}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = ref.current!; el.showModal(); return () => el.close(); }, []);
  return <dialog ref={ref} className={wide ? 'wide' : ''} aria-labelledby="dialog-title" onCancel={e => {e.preventDefault(); close();}}>
    <div className="dialog-head"><h2 id="dialog-title">{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={close}><X size={20}/></button></div>{children}
  </dialog>;
}

function Login({onLogin}: {onLogin: () => void}) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api('/session', {method: 'POST', body: JSON.stringify({password: new FormData(event.currentTarget).get('password')})}); onLogin(); }
    catch(e) {setError(errorMessage(e));} finally {setBusy(false);}
  }
  return <main className="login"><div className="login-story"><div className="brand"><Box/> stockroom<span>®</span></div><div><p className="eyebrow">A PLACE FOR EVERY PART</p><h1>Know what’s<br/>on the shelf.</h1><p>Inventory, receipts, and issues.<br/>One record everyone can work from.</p></div><span className="login-foot">STOCKROOM / INVENTORY & OPERATIONS</span></div>
    <form className="login-form" onSubmit={submit}><span className="small-mark"><Package size={26}/></span><h2>Open your stockroom</h2><p>Enter the workspace password to continue.</p><label>Workspace password<input name="password" type="password" autoComplete="current-password" required autoFocus/></label>{error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={17}/></button><p className="login-note">This workspace uses a shared operator account.<br/>Changes are recorded in the movement ledger.</p></form></main>;
}

function ItemForm({item, close, saved}: {item?: Item; close: () => void; saved: () => void}) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget)); setBusy(true); setError('');
    const payload = {...data, sku: String(data.sku).trim().toUpperCase(), reorder_point: Number(data.reorder_point), ...(item ? {version: item.version} : {})};
    try {await api(item ? `/items/${item.id}` : '/items', {method: item ? 'PUT' : 'POST', body: JSON.stringify(payload)}); saved();}
    catch(e) {setError(errorMessage(e));} finally {setBusy(false);}
  }
  return <Modal title={item ? 'Edit item' : 'Add an item'} close={() => !busy && close()}><form onSubmit={submit} className="form-body">
    <p className="muted">{item ? 'Update item details. Stock changes belong in the ledger.' : 'Start with the item details, then record a receipt to add stock.'}</p>
    <label>Item name<input name="name" defaultValue={item?.name} required minLength={2} maxLength={120} placeholder="e.g. USB-C cable · 1 m" autoFocus/></label>
    <div className="form-grid"><label>SKU<input name="sku" defaultValue={item?.sku} required minLength={2} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9-]+" placeholder="CAB-001"/></label><label>Category<input name="category" defaultValue={item?.category} required maxLength={40} placeholder="Cables" list="categories"/></label></div>
    <datalist id="categories"><option>Cables</option><option>Components</option><option>Tools</option><option>Consumables</option></datalist>
    <div className="form-grid"><label>Shelf location<input name="location" defaultValue={item?.location} required maxLength={40} placeholder="A-01"/></label><label>Reorder at<input name="reorder_point" type="number" min="0" max="1000000" step="1" defaultValue={item?.reorder_point ?? 5} required/></label></div>
    {error && <p className="error" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" onClick={close} disabled={busy}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving…' : item ? 'Save changes' : 'Create item'}<Check size={16}/></button></div>
  </form></Modal>;
}

function StockForm({item, close, saved}: {item: Item; close: () => void; saved: () => void}) {
  const [kind, setKind] = useState<'receive' | 'issue'>('receive'); const [quantity, setQuantity] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const attempt = useRef({fingerprint: '', key: crypto.randomUUID()});
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const note = String(new FormData(e.currentTarget).get('note')).trim();
    const delta = Number(quantity) * (kind === 'receive' ? 1 : -1); const fingerprint = JSON.stringify({delta, note});
    if (attempt.current.fingerprint !== fingerprint) attempt.current = {fingerprint, key: crypto.randomUUID()};
    setBusy(true); setError('');
    try {await api(`/items/${item.id}/movements`, {method: 'POST', body: JSON.stringify({delta, note, request_id: attempt.current.key})}); saved();}
    catch(e) {setError(errorMessage(e));} finally {setBusy(false);}
  }
  return <Modal title="Record a stock movement" close={() => !busy && close()}><form className="form-body" onSubmit={submit}>
    <div className="item-callout"><span className="item-icon"><Package/></span><div><strong>{item.name}</strong><p className="mono">{item.sku} · {item.location}</p></div><strong>{number(item.quantity)}<small>on hand</small></strong></div>
    <div className="segmented" aria-label="Movement type"><button type="button" className={kind === 'receive' ? 'selected' : ''} aria-pressed={kind === 'receive'} onClick={() => setKind('receive')}><ArrowDownLeft size={17}/>Receive stock</button><button type="button" className={kind === 'issue' ? 'selected' : ''} aria-pressed={kind === 'issue'} onClick={() => setKind('issue')}><ArrowUpRight size={17}/>Issue stock</button></div>
    <label>Units to {kind}<input type="number" min="1" max={kind === 'issue' ? item.quantity : 1000000} step="1" value={quantity} onChange={e => setQuantity(e.target.value)} required autoFocus/></label>
    <label>Reason or reference<input name="note" minLength={3} maxLength={240} required placeholder={kind === 'receive' ? 'e.g. Delivery PO-1042' : 'e.g. Issued to robotics lab'}/></label>
    <p className="balance">Balance after this movement <strong>{number(item.quantity + (Number(quantity) || 0) * (kind === 'receive' ? 1 : -1))} units</strong></p>
    {error && <p className="error" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" onClick={close} disabled={busy}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Recording…' : 'Record movement'}<Check size={16}/></button></div>
  </form></Modal>;
}

function ItemDetail({item, close, edit, move, archived}: {item: Item; close: () => void; edit: () => void; move: () => void; archived: () => void}) {
  const [history, setHistory] = useState<Page<Movement> | null>(null); const [error, setError] = useState(''); const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => {const controller = new AbortController(); api<Page<Movement>>(`/movements?item_id=${item.id}&limit=20`, {signal: controller.signal}).then(setHistory).catch(e => {if (!controller.signal.aborted) setError(errorMessage(e));}); return () => controller.abort();}, [item.id]);
  async function archive() {setBusy(true); try {await api(`/items/${item.id}`, {method: 'DELETE'}); archived();} catch(e) {setError(errorMessage(e));} finally {setBusy(false);}}
  return <Modal title={item.name} close={() => !busy && close()} wide><div className="form-body"><div className="detail-meta"><span className="mono">{item.sku}</span><span>{item.category}</span><span>Shelf {item.location}</span></div><div className="detail-stock"><div><span className="eyebrow">ON HAND</span><strong>{number(item.quantity)} <small>units</small></strong></div><Badge item={item}/><button className="primary" onClick={move}>Record movement<Plus size={16}/></button></div>
    <div className="detail-label"><h3>Movement history</h3><span>Reorder at {item.reorder_point} units</span></div>
    {error && <p className="error" role="alert">{error}</p>}{!history ? <p role="status">Loading history…</p> : history.items.length ? <><div className="history">{history.items.map(m => <div key={m.id}><span className={m.delta > 0 ? 'delta positive' : 'delta'}>{m.delta > 0 ? '+' : ''}{m.delta}</span><div><strong>{m.note}</strong><small>{date(m.created_at)}</small></div><span>{m.balance} left</span></div>)}</div>{history.total > 20 && <p className="muted">Showing the latest 20 of {history.total} movements. Open the movement ledger for the full history.</p>}</> : <div className="empty compact"><ClipboardList/><p>No movements yet. Record the first receipt.</p></div>}
    {confirm && <div className="archive-confirm"><p>Archive {item.sku}? Its movement history will remain in the ledger.</p><button onClick={archive} disabled={busy} className="danger">{busy ? 'Archiving…' : 'Confirm archive'}</button><button onClick={() => setConfirm(false)} disabled={busy}>Keep item</button></div>}
    <div className="dialog-actions split"><button onClick={() => setConfirm(true)} disabled={item.quantity > 0 || busy} title={item.quantity > 0 ? 'Issue all remaining stock before archiving' : 'Archive this item'}><Archive size={16}/>Archive item</button><button onClick={edit}>Edit details<SlidersHorizontal size={16}/></button></div>
  </div></Modal>;
}

function Badge({item}: {item: Item}) {return <span className={`badge ${item.quantity === 0 ? 'out' : item.quantity <= item.reorder_point ? 'low' : 'healthy'}`}><i/>{stockStatus(item)}</span>;}

function Workspace({logout}: {logout: () => void}) {
  const [view, setView] = useState<'inventory' | 'movements'>('inventory'); const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState(''); const [query, setQuery] = useState(''); const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<Page<Item>>({items: [], total: 0}); const [ledger, setLedger] = useState<Page<Movement>>({items: [], total: 0}); const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [revision, setRevision] = useState(0);
  const [modal, setModal] = useState<{type: 'create' | 'edit' | 'stock' | 'detail'; item?: Item} | null>(null);
  useEffect(() => {const timer = setTimeout(() => {setQuery(search); setOffset(0);}, 250); return () => clearTimeout(timer);}, [search]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    const options = {signal: controller.signal};
    Promise.all([api<Summary>('/summary', options), view === 'inventory' ? api<Page<Item>>(`/items?${new URLSearchParams({q: query, status: filter, offset: String(offset), limit: '12'})}`, options) : api<Page<Movement>>(`/movements?offset=${offset}&limit=12`, options)])
      .then(([s, result]) => {setSummary(s); if(view === 'inventory') setItems(result as Page<Item>); else setLedger(result as Page<Movement>);})
      .catch(e => {if(controller.signal.aborted) return; if(e instanceof ApiError && e.status === 401) logout(); else setError(errorMessage(e));})
      .finally(() => {if(!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [query, filter, offset, view, revision]);
  useEffect(() => {if(!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer);}, [notice]);
  function saved(message: string) {setModal(null); setNotice(message); setRevision(r => r + 1);}
  function navigate(next: typeof view) {setView(next); setOffset(0); setSearch(''); setQuery('');}
  function exportPage() {
    const rows = [['SKU', 'Name', 'Category', 'Location', 'On hand', 'Reorder point'], ...items.items.map(i => [i.sku, i.name, i.category, i.location, i.quantity, i.reorder_point])];
    const csv = rows.map(row => row.map(cell => {let s = String(cell); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"', '""')}"`;}).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'})); const link = document.createElement('a'); link.href = url; link.download = 'stockroom-inventory-page.csv'; link.click(); URL.revokeObjectURL(url);
  }
  const total = view === 'inventory' ? items.total : ledger.total;
  return <div className="workspace"><aside className="sidebar"><a className="brand" href="/" aria-label="Stockroom home"><Box size={26}/>stockroom<span>®</span></a><div className="workspace-label"><span className="workspace-avatar">S</span><div><strong>Workshop stores</strong><small>Inventory workspace</small></div></div><p className="nav-label">WORKSPACE</p><nav><button className={view === 'inventory' ? 'active' : ''} onClick={() => navigate('inventory')}><Layers3 size={18}/>Inventory<span>{summary?.items ?? '—'}</span></button><button className={view === 'movements' ? 'active' : ''} onClick={() => navigate('movements')}><ClipboardList size={18}/>Movements</button></nav><div className="sidebar-note"><Package size={21}/><p>A record for every receipt.<br/>A reason for every issue.</p></div><button className="account" onClick={async () => {try {await api('/session', {method: 'DELETE'}); logout();} catch(e) {setError(errorMessage(e));}}}><span className="avatar">OP</span><span><strong>Operator</strong><small>Sign out</small></span><LogOut size={16}/></button></aside>
    <div className="main-wrap"><header className="topbar"><span>Workspace <ChevronRight size={13}/> <strong>{view === 'inventory' ? 'Inventory' : 'Movements'}</strong></span><span className="today">{new Intl.DateTimeFormat(undefined, {day: 'numeric', month: 'short', year: 'numeric'}).format(new Date())}</span></header>
    <main className="content"><div className="page-heading"><div><p className="eyebrow">WORKSHOP STORES</p><h1>{view === 'inventory' ? 'Inventory' : 'Movement ledger'}<span className="heading-dot">.</span></h1><p>{view === 'inventory' ? 'What’s on hand, what’s running low, and where to find it.' : 'Every receipt and issue, in the order it happened.'}</p></div><button className="primary" onClick={() => setModal({type: 'create'})}><Plus size={18}/>Add item</button></div>
    <section className="summary" aria-label="Inventory totals"><div><span>Active items<Layers3 size={17}/></span><strong>{summary ? number(summary.items) : '—'}</strong><small>Distinct items in the stockroom</small></div><div><span>Units on hand<Package size={17}/></span><strong>{summary ? number(summary.units) : '—'}</strong><small>Across all shelf locations</small></div><button onClick={() => {navigate('inventory'); setFilter('low');}}><span>Low stock<span className="tiny-dot amber"/></span><strong>{summary ? number(summary.low) : '—'}</strong><small>At or below the reorder point<ArrowUpRight size={15}/></small></button><button onClick={() => {navigate('inventory'); setFilter('out');}}><span>Out of stock<span className="tiny-dot red"/></span><strong>{summary ? number(summary.out) : '—'}</strong><small>Items that need replenishment<ArrowUpRight size={15}/></small></button></section>
    <section className="inventory-panel"><div className="panel-heading"><div><h2>{view === 'inventory' ? 'All inventory' : 'Stock movements'}</h2><span>{view === 'inventory' ? 'Keep the shelves accounted for.' : 'The ledger is retained when items are archived.'}</span></div>{view === 'inventory' && <button className="subtle" onClick={exportPage} disabled={loading || !!error || !items.items.length}><Download size={16}/>Export page</button>}</div>
    {view === 'inventory' && <div className="toolbar"><div className="tabs" aria-label="Stock filter">{[['all', 'All items'], ['low', 'Low stock'], ['out', 'Out of stock']].map(([key, label]) => <button key={key} aria-pressed={filter === key} className={filter === key ? 'selected' : ''} onClick={() => {setFilter(key); setOffset(0);}}>{label}</button>)}</div><label className="search"><Search size={17}/><input aria-label="Search inventory" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or SKU…"/>{search && <button aria-label="Clear search" onClick={() => setSearch('')}><X size={14}/></button>}</label></div>}
    {error ? <div className="empty"><p className="error" role="alert">{error}</p><button onClick={() => setRevision(r => r + 1)}>Try again</button></div> : loading ? <div className="loading" role="status"><span/>Loading {view === 'inventory' ? 'inventory' : 'movements'}…</div> : !total ? <div className="empty"><Package size={34}/><h3>{query || filter !== 'all' && view === 'inventory' ? 'No matching items' : view === 'inventory' ? 'Your shelves start here' : 'No movements recorded'}</h3><p>{view === 'inventory' ? query || filter !== 'all' ? 'Try another search or stock filter.' : 'Add your first item, then record a receipt.' : 'Receive or issue stock from an item to start the ledger.'}</p>{view === 'inventory' && !query && filter === 'all' && <button onClick={() => setModal({type: 'create'})}><Plus size={16}/>Add first item</button>}</div> : <div className="table-scroll"><table><thead><tr>{(view === 'inventory' ? ['Item / SKU', 'Category', 'Location', 'On hand', 'Stock status', ''] : ['Item / SKU', 'Movement', 'Reason / reference', 'Balance', 'Recorded']).map((h, i) => <th key={i} scope="col">{h || <span className="sr-only">Actions</span>}</th>)}</tr></thead><tbody>{view === 'inventory' ? items.items.map(item => <tr key={item.id}><td><button className="item-link" onClick={() => setModal({type: 'detail', item})}><span className={`item-icon cat-${item.category.length % 3}`}><Package size={20}/></span><span><strong>{item.name}</strong><small className="mono">{item.sku}</small></span></button></td><td>{item.category}</td><td><span className="location mono">{item.location}</span></td><td className="quantity"><strong>{number(item.quantity)}</strong><span> / min {item.reorder_point}</span></td><td><Badge item={item}/></td><td><button className="row-action" aria-label={`Record movement for ${item.name}`} onClick={() => setModal({type: 'stock', item})}><Plus size={16}/><span>Movement</span></button></td></tr>) : ledger.items.map(m => <tr key={m.id}><td><strong>{m.name}</strong><small className="mono">{m.sku}</small></td><td><span className={m.delta > 0 ? 'delta positive' : 'delta'}>{m.delta > 0 ? <ArrowDownLeft size={15}/> : <ArrowUpRight size={15}/>} {m.delta > 0 ? '+' : ''}{number(m.delta)}</span></td><td className="note-cell">{m.note}</td><td className="mono">{number(m.balance)}</td><td className="date-cell">{date(m.created_at)}</td></tr>)}</tbody></table></div>}
    <div className="table-footer"><span>{loading ? 'Updating…' : total ? `${offset + 1}–${Math.min(offset + 12, total)} of ${number(total)} ${view === 'inventory' ? 'items' : 'movements'}` : '0 records'}</span><div><button aria-label="Previous page" disabled={offset === 0 || loading} onClick={() => setOffset(o => Math.max(0, o - 12))}><ArrowLeft size={15}/></button><button aria-label="Next page" disabled={offset + 12 >= total || loading} onClick={() => setOffset(o => o + 12)}><ArrowRight size={15}/></button></div></div></section><footer className="page-footer"><span>STOCKROOM</span><span>Good records. Fewer surprises.</span></footer></main></div>
    {notice && <div className="toast" role="status"><Check size={17}/>{notice}</div>}
    {modal?.type === 'create' && <ItemForm close={() => setModal(null)} saved={() => saved('Item created. Record a receipt to add stock.')}/>}
    {modal?.type === 'edit' && <ItemForm item={modal.item} close={() => setModal(null)} saved={() => saved('Item details saved.')}/>}
    {modal?.type === 'stock' && <StockForm item={modal.item!} close={() => setModal(null)} saved={() => saved('Stock movement recorded.')}/>}
    {modal?.type === 'detail' && <ItemDetail item={modal.item!} close={() => setModal(null)} edit={() => setModal({...modal, type: 'edit'})} move={() => setModal({...modal, type: 'stock'})} archived={() => saved('Item archived. Its history is still in the ledger.')}/>}
  </div>;
}

function App() {
  const [session, setSession] = useState<'loading' | 'in' | 'out'>('loading'); const [error, setError] = useState('');
  async function check() {setError(''); try {await api('/session'); setSession('in');} catch(e) {if(e instanceof ApiError && e.status === 401) setSession('out'); else setError(errorMessage(e));}}
  useEffect(() => {void check();}, []);
  if(error) return <main className="boot"><Box size={32}/><h1>Stockroom is unavailable</h1><p role="alert">{error}</p><button onClick={check}>Try again</button></main>;
  if(session === 'loading') return <main className="boot" role="status"><Box size={32}/><p>Opening stockroom…</p></main>;
  return session === 'in' ? <Workspace logout={() => setSession('out')}/> : <Login onLogin={() => setSession('in')}/>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
