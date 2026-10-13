import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Box } from 'lucide-react';
import { api, ApiError, errorMessage } from './api';
import { Workspace } from './Workspace';
import { Login } from './components/forms';
import './style.css';

function App() {
  const [session, setSession] = useState<'loading' | 'in' | 'out'>('loading');
  const [error, setError] = useState('');
  async function check() {
    setError('');
    try {
      await api('/session');
      setSession('in');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setSession('out');
      else setError(errorMessage(e));
    }
  }
  useEffect(() => {
    void check();
  }, []);
  if (error)
    return (
      <main className="boot">
        <Box size={32} />
        <h1>Stockroom is unavailable</h1>
        <p role="alert">{error}</p>
        <button onClick={check}>Try again</button>
      </main>
    );
  if (session === 'loading')
    return (
      <main className="boot" role="status">
        <Box size={32} />
        <p>Opening stockroom…</p>
      </main>
    );
  return session === 'in' ? (
    <Workspace logout={() => setSession('out')} />
  ) : (
    <Login onLogin={() => setSession('in')} />
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
