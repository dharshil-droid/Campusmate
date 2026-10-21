import { useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const TK = 'campusmate.token';
const getToken = () => { try { return localStorage.getItem(TK); } catch { return null; } };
const setToken = t => { try { t ? localStorage.setItem(TK, t) : localStorage.removeItem(TK); } catch {} };

async function call(path, method = 'GET', body) {
  const res = await fetch(`${API}/api/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(getToken() && { Authorization: 'Bearer ' + getToken() }) },
    body: body && JSON.stringify(body),
  });
  if (res.status === 401 && getToken()) { setToken(null); window.dispatchEvent(new Event('cm-logout')); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed');
  return res.status === 204 ? null : res.json();
}

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => iso(new Date());
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const daysUntil = s => Math.round((new Date(s + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 864e5);
const pct = s => (s.conducted ? (s.attended / s.conducted) * 100 : 0);
const r1 = n => Math.round(n * 10) / 10;

function advice(s) {
  const { attended: a, conducted: c, target: t } = s;
  if (!c) return 'Mark your first class to start tracking.';
  if (pct(s) >= t) {
    const m = Math.floor((a * 100 - t * c) / t);
    return m > 0 ? `You can miss ${m} more class${m > 1 ? 'es' : ''} and stay at ${t}%.` : 'Right on target. Don’t miss the next class.';
  }
  if (t >= 100) return 'A 100% target can’t be reached after a missed class.';
  const n = Math.ceil((t * c - 100 * a) / (100 - t));
  return `Attend the next ${n} class${n > 1 ? 'es' : ''} in a row to reach ${t}%.`;
}

function useList(path, setErr) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    call(path).then(setItems).catch(e => setErr('Can’t reach the server: ' + e.message)).finally(() => setLoaded(true));
  }, []);
  const safe = fn => async (...a) => {
    try { setErr(''); await fn(...a); return true; } catch (e) { setErr(e.message); return false; }
  };
  return {
    items, loaded,
    add: safe(async d => { const n = await call(path, 'POST', d); setItems(x => [...x, n]); }),
    patch: safe(async (id, d) => { const n = await call(`${path}/${id}`, 'PATCH', d); setItems(x => x.map(i => (i._id === id ? n : i))); }),
    del: safe(async id => { await call(`${path}/${id}`, 'DELETE'); setItems(x => x.filter(i => i._id !== id)); }),
  };
}

const submit = fn => async e => {
  e.preventDefault();
  const f = e.currentTarget;
  if (await fn(Object.fromEntries(new FormData(f)))) f.reset();
};

const Bar = ({ v }) => <div className="bar"><i style={{ width: v + '%' }} /></div>;
const Meter = ({ s }) => (
  <div className={'meter' + (pct(s) < s.target ? ' low' : '')}>
    <i style={{ width: Math.min(pct(s), 100) + '%' }} /><b style={{ left: `calc(${s.target}% - 1px)` }} />
  </div>
);
const Due = ({ a }) => {
  const d = daysUntil(a.due);
  if (a.done) return <span className="ok">Completed</span>;
  if (d < 0) return <span className="late">Overdue by {-d} day{d < -1 ? 's' : ''}</span>;
  if (d === 0) return <span className="late">Due today</span>;
  return <>Due in {d} day{d > 1 ? 's' : ''}</>;
};
const TaskRow = ({ t, T }) => (
  <div className={'item' + (t.done ? ' done' : '')}>
    <input type="checkbox" checked={t.done} onChange={() => T.patch(t._id, { done: !t.done })} aria-label="Mark done" />
    <div className="body">
      <div className="t">{t.title}</div>
      <div className="mute">{t.subject || 'General'}{t.date !== today() ? ' · ' + t.date : ''}</div>
    </div>
    <button className="btn sm" onClick={() => T.del(t._id)}>Delete</button>
  </div>
);

function Dashboard({ S, A, T }) {
  const tot = S.items.reduce((n, s) => n + s.attended, 0);
  const con = S.items.reduce((n, s) => n + s.conducted, 0);
  const ov = con ? r1((tot / con) * 100) : 0;
  const tt = T.items.filter(t => t.date === today());
  const td = tt.filter(t => t.done).length;
  const pend = A.items.filter(a => !a.done).sort((a, b) => a.due.localeCompare(b.due));
  const late = pend.filter(a => daysUntil(a.due) < 0).length;
  const low = S.items.filter(s => s.conducted && pct(s) < s.target);
  return (<>
    <h1>Today</h1>
    <p className="sub">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    <div className="grid3">
      <div className="card"><div className="big">{ov}%</div><div className="mute">Overall attendance</div><Bar v={Math.min(ov, 100)} /></div>
      <div className="card"><div className="big">{td}/{tt.length}</div><div className="mute">Study tasks done today</div><Bar v={tt.length ? (td / tt.length) * 100 : 0} /></div>
      <div className="card"><div className="big">{pend.length}</div><div className="mute">Pending{late > 0 && <> · <span className="late">{late} overdue</span></>}</div></div>
    </div>
    <div className="grid2">
      <div className="card"><h2>Today’s study tasks</h2>
        {tt.length ? tt.map(t => <TaskRow key={t._id} t={t} T={T} />) : <p className="empty">Nothing planned for today. Add a task in Study planner.</p>}
      </div>
      <div className="card"><h2>Coming up</h2>
        {pend.length ? pend.slice(0, 5).map(a => (
          <div className="item" key={a._id}><div className="body"><div className="t">{a.title}</div>
            <div className="mute">{a.type}{a.subject ? ' · ' + a.subject : ''} · <Due a={a} /></div></div></div>
        )) : <p className="empty">All caught up. Add an assignment or exam to track it.</p>}
      </div>
    </div>
    {low.length > 0 && <div className="card" style={{ marginTop: '1rem' }}><h2>Attendance needs attention</h2>
      {low.map(s => <div className="item" key={s._id}><div className="body"><div className="t">{s.name} · {r1(pct(s))}%</div><div className="mute">{advice(s)}</div></div></div>)}
    </div>}
  </>);
}

function Attendance({ S }) {
  return (<>
    <h1>Attendance</h1>
    <p className="sub">Track each subject and see exactly how many classes you can miss or must attend.</p>
    <div className="card"><h2>Add subject</h2>
      <form onSubmit={submit(d => S.add({ name: d.name, attended: +d.attended, conducted: +d.conducted, target: +d.target }))}>
        <label>Subject<input name="name" required maxLength="60" /></label>
        <label>Classes attended<input name="attended" type="number" min="0" defaultValue="0" required /></label>
        <label>Classes conducted<input name="conducted" type="number" min="0" defaultValue="0" required /></label>
        <label>Target %<input name="target" type="number" min="1" max="100" defaultValue="75" required /></label>
        <button className="btn pri">Add subject</button>
      </form>
    </div>
    {S.items.length ? S.items.map(s => (
      <div className="card" key={s._id}>
        <div className="row sp"><h3>{s.name}</h3><div className="big" style={{ fontSize: '1.8rem' }}>{r1(pct(s))}%</div></div>
        <Meter s={s} />
        <div className="mute">{s.attended} of {s.conducted} classes attended · target {s.target}%</div>
        <p style={{ margin: '.5rem 0 .8rem' }}>{advice(s)}</p>
        <div className="row">
          <button className="btn pri sm" onClick={() => S.patch(s._id, { attended: s.attended + 1, conducted: s.conducted + 1 })}>Attended a class</button>
          <button className="btn sm" onClick={() => S.patch(s._id, { conducted: s.conducted + 1 })}>Missed a class</button>
          <button className="btn sm" onClick={() => S.del(s._id)}>Delete</button>
        </div>
      </div>
    )) : <p className="empty">No subjects yet. Add your first subject above.</p>}
  </>);
}

function Assignments({ S, A }) {
  const [filter, setFilter] = useState('all');
  const list = A.items.filter(a => filter === 'all' || (filter === 'done') === a.done)
    .sort((a, b) => (a.done - b.done) || a.due.localeCompare(b.due));
  return (<>
    <h1>Assignments</h1>
    <p className="sub">Deadlines, priorities and exams in one list. Overdue work is flagged in red.</p>
    <div className="card"><h2>New assignment or exam</h2>
      <form onSubmit={submit(d => A.add(d))}>
        <label className="wide">Title<input name="title" required maxLength="100" /></label>
        <label>Subject<input name="subject" list="subs" maxLength="60" /></label>
        <label>Type<select name="type"><option>Assignment</option><option>Exam</option></select></label>
        <label>Deadline<input name="due" type="date" required defaultValue={addDays(7)} /></label>
        <label>Priority<select name="priority" defaultValue="Medium"><option>High</option><option>Medium</option><option>Low</option></select></label>
        <label className="wide">Description<textarea name="desc" rows="2" maxLength="300" /></label>
        <datalist id="subs">{S.items.map(s => <option key={s._id} value={s.name} />)}</datalist>
        <button className="btn pri">Add</button>
      </form>
    </div>
    <div className="tabs">
      {['all', 'pending', 'done'].map(f => (
        <button key={f} className={'btn sm' + (filter === f ? ' on' : '')} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>
      ))}
    </div>
    <div className="card">
      {list.length ? list.map(a => (
        <div className={'item' + (a.done ? ' done' : '')} key={a._id}>
          <input type="checkbox" checked={a.done} onChange={() => A.patch(a._id, { done: !a.done })} aria-label="Mark complete" />
          <div className="body">
            <div className="t"><strong>{a.title}</strong> <span className={'pill ' + a.priority}>{a.priority}</span> <span className="pill">{a.type}</span></div>
            <div className="mute">{a.subject ? a.subject + ' · ' : ''}<Due a={a} /> ({a.due})</div>
            {a.desc && <div>{a.desc}</div>}
          </div>
          <button className="btn sm" onClick={() => A.del(a._id)}>Delete</button>
        </div>
      )) : <p className="empty">Nothing here. Add an assignment above.</p>}
    </div>
  </>);
}

function Planner({ S, T }) {
  const groups = {};
  T.items.forEach(t => (groups[t.subject || 'General'] ??= []).push(t));
  const d = T.items.filter(t => t.done).length;
  return (<>
    <h1>Study planner</h1>
    <p className="sub">{d} of {T.items.length} tasks done.</p>
    <Bar v={T.items.length ? (d / T.items.length) * 100 : 0} />
    <div className="card" style={{ marginTop: '1.25rem' }}><h2>Add study task</h2>
      <form onSubmit={submit(x => T.add(x))}>
        <label className="wide">Task<input name="title" required maxLength="100" /></label>
        <label>Subject<input name="subject" list="subs2" maxLength="60" /></label>
        <label>Date<input name="date" type="date" required defaultValue={today()} /></label>
        <datalist id="subs2">{S.items.map(s => <option key={s._id} value={s.name} />)}</datalist>
        <button className="btn pri">Add task</button>
      </form>
    </div>
    {Object.keys(groups).length ? Object.entries(groups).map(([k, v]) => {
      const dn = v.filter(t => t.done).length;
      return (
        <div className="card" key={k}>
          <div className="row sp"><h3>{k}</h3><span className="mute">{dn}/{v.length} done</span></div>
          <Bar v={(dn / v.length) * 100} />
          {[...v].sort((a, b) => a.date.localeCompare(b.date)).map(t => <TaskRow key={t._id} t={t} T={T} />)}
        </div>
      );
    }) : <p className="empty">No tasks yet. Plan your first study session above.</p>}
  </>);
}

const VIEWS = { dash: 'Dashboard', att: 'Attendance', asg: 'Assignments', plan: 'Study planner' };

function Main({ user, onLogout }) {
  const [view, setView] = useState('dash');
  const [err, setErr] = useState('');
  const S = useList('subjects', setErr), A = useList('assignments', setErr), T = useList('tasks', setErr);
  const ready = S.loaded && A.loaded && T.loaded;
  return (
    <div className="app">
      <nav className="nav">
        <div className="brand"><span>Campus</span>Mate</div>
        {Object.entries(VIEWS).map(([k, label]) => (
          <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{label}</button>
        ))}
      </nav>
      <main>
        <div className="row sp" style={{ marginBottom: '1rem' }}>
          <span className="mute">Signed in as {user.name}</span>
          <button className="btn sm" onClick={onLogout}>Log out</button>
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        {!ready ? <p className="empty">Loading your data… the free server can take up to a minute to wake up.</p> : <>
          {view === 'dash' && <Dashboard S={S} A={A} T={T} />}
          {view === 'att' && <Attendance S={S} />}
          {view === 'asg' && <Assignments S={S} A={A} />}
          {view === 'plan' && <Planner S={S} T={T} />}
        </>}
      </main>
    </div>
  );
}

function Auth({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const login = mode === 'login';
  const go = async e => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const r = await call(`auth/${mode}`, 'POST', Object.fromEntries(new FormData(e.currentTarget)));
      setToken(r.token); onAuth(r.user);
    } catch (x) { setErr(x.message); setBusy(false); }
  };
  return (
    <main style={{ margin: '6vh auto 0', maxWidth: 440 }}>
      <h1>CampusMate</h1>
      <p className="sub">{login ? 'Log in to see your attendance, assignments and study plan.' : 'Create an account to keep your records private.'}</p>
      <div className="card">
        <form onSubmit={go} style={{ gridTemplateColumns: '1fr' }}>
          {!login && <label>Name<input name="name" required maxLength="60" autoComplete="name" /></label>}
          <label>Email<input name="email" type="email" required autoComplete="email" /></label>
          <label>Password{!login && ' (at least 8 characters)'}
            <input name="password" type="password" required minLength={login ? undefined : 8} autoComplete={login ? 'current-password' : 'new-password'} />
          </label>
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn pri" disabled={busy}>{busy ? 'Please wait…' : login ? 'Log in' : 'Create account'}</button>
        </form>
      </div>
      <button className="btn sm" onClick={() => { setMode(login ? 'register' : 'login'); setErr(''); }}>
        {login ? 'New here? Create an account' : 'Have an account? Log in'}
      </button>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(!!getToken());
  useEffect(() => {
    const out = () => setUser(null);
    window.addEventListener('cm-logout', out);
    if (getToken()) call('auth/me').then(r => setUser(r.user)).catch(() => setToken(null)).finally(() => setChecking(false));
    return () => window.removeEventListener('cm-logout', out);
  }, []);
  if (checking) return <main><p className="empty">Loading…</p></main>;
  if (!user) return <Auth onAuth={setUser} />;
  return <Main user={user} onLogout={() => { setToken(null); setUser(null); }} />;
}
