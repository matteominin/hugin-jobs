import { useEffect, useState } from 'react';
import { api, getToken } from './api.ts';
import { Login } from './Login.tsx';
import { Portals } from './Portals.tsx';
import { Jobs } from './Jobs.tsx';

type Tab = 'portals' | 'jobs';

export function App() {
  const [user, setUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('portals');

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then((r) => setUser(r.user.username))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="center muted">Loading…</div>;
  if (!user) return <Login onLogin={setUser} />;

  const logout = async () => {
    await api.logout().catch(() => {});
    setUser(null);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◆</span> Hugin Jobs <span className="muted">· admin</span>
        </div>
        <nav className="tabs">
          <button className={tab === 'portals' ? 'tab active' : 'tab'} onClick={() => setTab('portals')}>
            Portals
          </button>
          <button className={tab === 'jobs' ? 'tab active' : 'tab'} onClick={() => setTab('jobs')}>
            Notified jobs
          </button>
        </nav>
        <div className="user">
          <span className="muted">{user}</span>
          <button className="btn ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <main className="content">{tab === 'portals' ? <Portals /> : <Jobs />}</main>
    </div>
  );
}
