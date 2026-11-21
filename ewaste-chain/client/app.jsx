import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

const api = async u => { const r = await fetch('/api' + u), j = await r.json(); if (!r.ok) throw new Error(j.error); return j; };
const post = async (u, b) => { const r = await fetch('/api' + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }), j = await r.json(); if (!r.ok) throw new Error(j.error); return j; };
const fmt = t => new Date(t).toLocaleString(), short = h => (h ? h.slice(0, 12) + '…' : '');
const ROLE = { GENERATOR: ['🏢', 'Registers e-waste into the system'], COLLECTOR: ['🧺', 'Collects items & hands them over'], TRANSPORTER: ['🚚', 'Moves items between parties'], RECYCLER: ['♻️', 'Wipes data, dismantles, recycles & certifies'], AUDITOR: ['🛡️', 'Read-only oversight, alerts & audit reports'] };
const ICON = { Laptop: '💻', 'Mobile phone': '📱', 'Desktop PC': '🖥️', Monitor: '🖵', Battery: '🔋', Printer: '🖨️' };
const STEPS = [['REGISTERED', 'Registered'], ['COLLECTED', 'Collected'], ['IN_TRANSIT', 'In transit'], ['RECEIVED', 'Received'], ['DATA_WIPED', 'Data wiped'], ['DISMANTLED', 'Dismantled'], ['RECYCLED', 'Recycled']];
const go = h => { location.hash = h; };

function useHash() {
  const [h, setH] = useState(location.hash.slice(1));
  useEffect(() => { const f = () => setH(location.hash.slice(1)); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return h;
}
const acts = (it, me) => {
  const r = me.role, mine = it.custodian === me.id, a = [];
  if (r === 'COLLECTOR' && it.state === 'REGISTERED') a.push('collect');
  if (['COLLECTOR', 'TRANSPORTER'].includes(r) && mine && !it.pendingTo && ['COLLECTED', 'IN_TRANSIT'].includes(it.state)) a.push('transfer');
  if (it.pendingTo === me.id) a.push('accept');
  if (r === 'RECYCLER' && mine) {
    if (it.state === 'RECEIVED' && it.hasData) a.push('wipe');
    if (['RECEIVED', 'DATA_WIPED'].includes(it.state) && (!it.hasData || it.state === 'DATA_WIPED')) a.push('dismantle');
    if (it.state === 'DISMANTLED') a.push('recycle');
  }
  return a;
};

function Scanner({ onClose }) {
  const v = useRef(); const [msg, setMsg] = useState('Starting camera…');
  useEffect(() => {
    let stream, timer;
    (async () => {
      try {
        if (!('BarcodeDetector' in window)) throw new Error('This browser cannot scan QR codes. Use Chrome/Edge, or type the item ID in the search box.');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        v.current.srcObject = stream; await v.current.play();
        const det = new BarcodeDetector({ formats: ['qr_code'] }); setMsg('Point the camera at the item QR code');
        timer = setInterval(async () => {
          const r = await det.detect(v.current).catch(() => []);
          const m = r[0] && r[0].rawValue.match(/EW-[0-9A-F]+/i);
          if (m) { onClose(); go('item=' + m[0].toUpperCase()); }
        }, 500);
      } catch (e) { setMsg(e.message); }
    })();
    return () => { clearInterval(timer); stream && stream.getTracks().forEach(t => t.stop()); };
  }, []);
  return <div className="modal" onClick={onClose}><div className="card" onClick={e => e.stopPropagation()}>
    <h3>📷 Scan item QR</h3><video ref={v} muted playsInline /><p className="perm">{msg}</p><button className="g" onClick={onClose}>Close</button></div></div>;
}

function Row({ i, flag }) {
  return <div className="row" onClick={() => go('item=' + i.itemId)}><div className="ic">{ICON[i.details?.category] || '📦'}</div>
    <div className="m"><b>{i.details?.category}</b> <small>{i.details?.description}</small><br />
      <small className="mono">{i.itemId} · {i.weightKg} kg · with {i.custodian}{i.pendingTo ? ' → ' + i.pendingTo : ''}</small></div>
    {flag && <span className="tag act">ACTION NEEDED</span>}<span className="tag">{i.state.replace('_', ' ')}</span></div>;
}

function Items({ me }) {
  const [l, setL] = useState(null);
  useEffect(() => { api('/items').then(setL); }, [me.id]);
  if (!l) return <div className="card">Loading…</div>;
  const mine = l.filter(i => acts(i, me).length), kg = l.reduce((s, i) => s + (i.certificate?.recoveredKg || 0), 0);
  return <>
    <div className="stats">
      <div className="stat"><b>{l.length}</b><span>Items tracked</span></div>
      <div className="stat"><b>{l.filter(i => i.state !== 'RECYCLED').length}</b><span>In process</span></div>
      <div className="stat"><b>{l.filter(i => i.state === 'RECYCLED').length}</b><span>Recycled & certified</span></div>
      <div className="stat"><b>{kg.toFixed(1)}<small style={{ fontSize: 14 }}> kg</small></b><span>Materials recovered</span></div></div>
    <div className="card"><h3>⚡ Needs action from {me.name}</h3>
      {me.role === 'AUDITOR' ? <span className="perm">Auditors are read-only. Open an item to verify it, or see Alerts and Audit report.</span>
        : mine.length ? mine.map(i => <Row key={i.itemId} i={i} flag />) : <span className="perm">Nothing waiting for this participant right now.</span>}</div>
    <div className="card"><h3>All items</h3>{l.length ? l.map(i => <Row key={i.itemId} i={i} />) : <span className="perm">No items yet. Register one to start.</span>}</div></>;
}

function Register({ me }) {
  const [f, setF] = useState({ category: 'Laptop', description: '', weightKg: 2, hasData: '1' }); const [msg, setMsg] = useState('');
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async () => { try { const r = await post('/items', { actorId: me.id, ...f, hasData: !!f.hasData }); go('item=' + r.itemId); } catch (e) { setMsg(e.message); } };
  return <div className="card"><h3>➕ Register e-waste item</h3>
    {!['GENERATOR', 'COLLECTOR'].includes(me.role) && <div className="verdict bad"><b>{me.name} ({me.role}) cannot register items.</b> Switch to a Generator or Collector, or submit anyway to see the smart contract reject it (it will appear under Alerts).</div>}
    <div className="grid">
      <div><label>Category</label><select value={f.category} onChange={set('category')}>{Object.keys(ICON).map(c => <option key={c}>{c}</option>)}</select></div>
      <div><label>Description / brand</label><input value={f.description} onChange={set('description')} placeholder="e.g. Dell Latitude 5420" /></div>
      <div><label>Weight (kg)</label><input type="number" step="0.1" value={f.weightKg} onChange={set('weightKg')} /></div>
      <div><label>Contains data storage?</label><select value={f.hasData} onChange={set('hasData')}><option value="1">Yes, needs data wipe</option><option value="">No</option></select></div></div>
    <p><button className="p" onClick={submit}>Sign and register on blockchain</button></p>
    {msg && <div className="verdict bad"><b>⛔ {msg}</b></div>}</div>;
}

function Form({ a, P, me, run }) {
  const rec = P.filter(p => ['TRANSPORTER', 'RECYCLER'].includes(p.role) && p.id !== me.id);
  const [f, setF] = useState({ to: rec[0]?.id, m: 'NIST 800-88 Clear', doc: 'Wipe report: drive sanitised and verified.', c: 'battery, PCB, casing, display', metal: '', plastic: '', glass: '', haz: '' });
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const send = () => {
    let payload = {}, doc;
    if (a === 'transfer') payload = { to: f.to };
    if (a === 'wipe') { payload = { method: f.m }; doc = f.doc; }
    if (a === 'dismantle') payload = { components: f.c.split(',').map(s => s.trim()).filter(Boolean) };
    if (a === 'recycle') payload = { materials: { metal: +f.metal || 0, plastic: +f.plastic || 0, glass: +f.glass || 0, hazardous: +f.haz || 0 } };
    run(a, payload, doc);
  };
  return <div className="act"><b>{a.toUpperCase()}</b>
    {a === 'transfer' && <><label>Transfer to</label><select value={f.to} onChange={set('to')}>{rec.map(p => <option key={p.id} value={p.id}>{p.name} ({p.role})</option>)}</select></>}
    {a === 'wipe' && <><label>Method</label><select value={f.m} onChange={set('m')}><option>NIST 800-88 Clear</option><option>NIST 800-88 Purge</option><option>Physical destruction</option></select>
      <label>Wipe report (only its hash goes on-chain)</label><textarea rows="2" value={f.doc} onChange={set('doc')} /></>}
    {a === 'dismantle' && <><label>Components recovered (comma separated)</label><input value={f.c} onChange={set('c')} /></>}
    {a === 'recycle' && <><label>Materials recovered (kg)</label><div className="grid">
      <input type="number" step="0.1" placeholder="Metal" value={f.metal} onChange={set('metal')} /><input type="number" step="0.1" placeholder="Plastic" value={f.plastic} onChange={set('plastic')} />
      <input type="number" step="0.1" placeholder="Glass" value={f.glass} onChange={set('glass')} /><input type="number" step="0.1" placeholder="Hazardous" value={f.haz} onChange={set('haz')} /></div></>}
    <p style={{ margin: '12px 0 0' }}><button className="p" onClick={send}>Sign and submit</button></p></div>;
}

function ItemView({ id, me, P, pub }) {
  const [d, setD] = useState(null), [err, setErr] = useState(''), [msg, setMsg] = useState(''), [n, setN] = useState(0);
  useEffect(() => { setD(null); setErr(''); Promise.all([api('/items/' + id), api('/verify/' + id)]).then(([it, v]) => setD({ it, v })).catch(e => setErr(e.message)); }, [id, n]);
  if (err) return <div className="card"><div className="verdict bad"><h3>✖ {err}</h3>No item with ID <b>{id}</b> exists on this ledger.</div></div>;
  if (!d) return <div className="card">Verifying against the blockchain…</div>;
  const { it, v } = d, c = it.certificate, ok = v.verdict === 'AUTHENTIC';
  const steps = STEPS.filter(s => s[0] !== 'DATA_WIPED' || it.hasData), idx = steps.findIndex(s => s[0] === it.state), A = pub ? [] : acts(it, me);
  const run = async (a, payload, document) => { try { setMsg(''); await post(`/items/${id}/${a}`, { actorId: me.id, payload, document }); setN(n + 1); } catch (e) { setMsg(e.message); } };
  return <>
    <div className="two"><div className="card"><h3 style={{ fontSize: 20, margin: 0 }}>{ICON[it.details?.category] || '📦'} {it.details?.category} <span className="mono">{it.itemId}</span></h3>
      <div className="perm" style={{ margin: '4px 0 12px' }}>{it.details?.description} · {it.weightKg} kg · {it.hasData ? 'contains data storage' : 'no data storage'}</div>
      <div>Custodian <span className="tag">{it.custodian}</span> {it.pendingTo && <>→ awaiting <span className="tag act">{it.pendingTo}</span></>}</div>
      <label>On-chain data hash (SHA-256)</label><div className="mono">{it.dataHash}</div></div>
      <div className="card" style={{ textAlign: 'center' }}><img src={'/api/qr/' + it.itemId} width="140" height="140" style={{ borderRadius: 10 }} alt="QR" /><div className="perm" style={{ margin: '6px 0 0' }}>Scan to verify</div></div></div>
    <div className="card"><div className="stepper">{steps.map((s, i) => { const done = i < idx || it.state === 'RECYCLED'; return <div key={s[0]} className={'st ' + (done ? 'done' : i === idx ? 'now' : '')}><i>{done ? '✓' : i + 1}</i>{s[1]}</div>; })}</div></div>
    <div className={'verdict ' + (ok ? 'ok' : 'bad')}><h3>{ok ? '✔ AUTHENTIC: records match the blockchain' : '✖ TAMPERED: records do not match the blockchain'}</h3>
      {v.checks.map((k, i) => <div key={i}>{k.ok ? '✅' : '❌'} {k.name} <span className="perm" style={{ margin: 0 }}>: {k.detail}</span></div>)}</div>
    {c && <div className="cert"><h3 style={{ margin: '0 0 6px' }}>🏅 Verifiable Recycling Certificate</h3><b>{c.certId}</b> · recycled by {c.recycler}<br />
      Recovered <b>{c.recoveredKg} kg</b> ({c.recoveryRatePct}% of item): {Object.entries(c.materials).filter(e => e[1]).map(e => `${e[0]} ${e[1]} kg`).join(', ')}<br />
      <span className="mono" style={{ color: '#6b5a1a' }}>hash {c.certHash}</span><br /><button className="g" style={{ marginTop: 8 }} onClick={() => window.print()}>🖨 Print certificate</button></div>}
    {!pub && <div className="card"><h3>Actions for {me.name}</h3>
      {A.length ? A.map(a => <Form key={a} a={a} P={P} me={me} run={run} />) : <span className="perm">No action available for this participant right now. Switch role above, or try breaking a rule:</span>}
      {msg && <div className="verdict bad" style={{ marginTop: 10 }}><b>⛔ {msg}</b><div className="perm" style={{ margin: 0 }}>Logged under Alerts.</div></div>}
      <div style={{ marginTop: 12 }}><span className="perm">Smart-contract test: </span>{['collect', 'dismantle', 'recycle'].map(a => <button key={a} className="d" style={{ marginRight: 6 }} onClick={() => run(a, {})}>force {a}</button>)}</div></div>}
    <div className="card"><h3>Chain of custody</h3><div className="tl">{it.history.map(h => <div key={h.txId}><b>{h.type}</b> by {h.actor} <span className="tag">{h.block != null ? 'block #' + h.block : 'Fabric tx'}</span>{h.payload.to && ' → ' + h.payload.to}{h.payload.method && ' · ' + h.payload.method}<br />
      <span className="perm" style={{ margin: 0 }}>{fmt(h.timestamp)}</span><div className="mono">tx {short(h.txId)}{h.payload.docHash ? ' · doc ' + short(h.payload.docHash) : ''}</div></div>)}</div></div></>;
}

function Ledger({ mode }) {
  const [d, setD] = useState(null), [n, setN] = useState(0);
  useEffect(() => { api('/chain').then(setD); }, [n]);
  const demo = async (a, b) => { try { await post('/demo/' + a, b); } catch (e) { alert(e.message); } setN(n + 1); };
  if (!d) return <div className="card">Loading…</div>;
  const s = d.status, bad = new Set(s.errors.map(e => e.block));
  return <>
    <div className={'verdict ' + (s.valid ? 'ok' : 'bad')}><h3>{s.valid ? '✔ Ledger is valid' : '✖ Ledger is INVALID'}</h3>
      {mode.ledger === 'fabric' ? d.note : <>{s.height} blocks · Proof-of-Authority (validators seal blocks in turn)</>}
      {s.errors.map((e, i) => <div key={i}>❌ Block {e.block}: {e.error}</div>)}
      <p><span className="perm">Tamper-detection demo: </span>
        {mode.ledger !== 'fabric' && <button className="d" onClick={() => demo('tamper-chain', { blockIndex: +prompt('Block index to alter (e.g. 1)', '1') })}>Alter a block</button>} <button className="d" onClick={() => demo('tamper-db', { itemId: prompt('Item ID to alter in the database') })}>Alter database record</button> <button className="g" onClick={() => demo('restore')}>Restore</button></p></div>
    {[...d.blocks].reverse().map((b, i) => <React.Fragment key={b.index}>{i > 0 && <div className="chain" />}
      <div className={'blk ' + (bad.has(b.index) ? 'bad' : '')}><b>Block #{b.index}</b> <span className="perm" style={{ margin: 0 }}>{b.index ? fmt(b.timestamp) + ' · sealed by ' + b.validator : 'genesis'}</span>
        <div className="mono">hash {b.hash}</div><div className="mono">prev {short(b.prevHash)} · merkle {short(b.merkleRoot)}</div>
        {b.txs.map(t => <div key={t.txId} style={{ marginTop: 4 }}><span className="tag">{t.type}</span> <b>{t.itemId}</b> by {t.actor} <span className="mono">sig {short(t.signature)}</span></div>)}</div></React.Fragment>)}</>;
}

function Alerts() {
  const [l, setL] = useState(null);
  useEffect(() => { api('/alerts').then(setL); }, []);
  if (!l) return <div className="card">Loading…</div>;
  return <div className="card"><h3>🚨 Alerts: tamper detections & rejected actions ({l.length})</h3>
    {l.length ? <table className="t"><tbody><tr><th>Time</th><th>Severity</th><th>Type</th><th>Details</th></tr>
      {l.map(a => <tr key={a.id}><td>{fmt(a.time)}</td><td><span className={'sev ' + a.severity}>{a.severity.toUpperCase()}</span></td><td>{a.kind.replace('_', ' ')}</td>
        <td>{a.actor && <b>{a.actor} </b>}{a.itemId && <span className="mono">{a.itemId} </span>}{a.message}</td></tr>)}</tbody></table>
      : <span className="perm">No alerts yet. Try "force dismantle" on an item, or alter a record on the Ledger tab.</span>}</div>;
}

function Report() {
  const [r, setR] = useState(null);
  useEffect(() => { api('/report').then(setR); }, []);
  if (!r) return <div className="card">Generating report…</div>;
  const ok = r.ledger.valid && r.items.every(i => i.verdict === 'AUTHENTIC');
  return <>
    <div className="printonly"><h2>EcoChain: Audit & Compliance Report</h2></div>
    <div className={'verdict ' + (ok ? 'ok' : 'bad')}><h3>{ok ? '✔ Compliant: all records verified' : '✖ Non-compliance detected'}</h3>
      Generated {fmt(r.generatedAt)} · ledger mode: {r.ledger.mode} · ledger {r.ledger.valid ? 'valid' : 'INVALID'} · {r.alerts.total} alerts logged
      <p><button className="g" onClick={() => window.print()}>🖨 Print / save as PDF</button></p></div>
    <div className="stats">
      <div className="stat"><b>{r.totals.items}</b><span>Items</span></div><div className="stat"><b>{r.totals.recycled}</b><span>Recycled</span></div>
      <div className="stat"><b>{r.recovery.recoveredKg}<small style={{ fontSize: 14 }}> kg</small></b><span>Recovered of {r.totals.weightKg} kg</span></div>
      <div className="stat"><b>{r.recovery.recoveryRatePct}%</b><span>Recovery rate</span></div></div>
    <div className="card"><h3>Item compliance</h3><div style={{ overflowX: 'auto' }}><table className="t"><tbody>
      <tr><th>Item</th><th>Category</th><th>State</th><th>Data wiped</th><th>Certificate</th><th>Txs</th><th>Verdict</th></tr>
      {r.items.map(i => <tr key={i.itemId}><td className="mono">{i.itemId}</td><td>{i.category}</td><td>{i.state}</td><td>{i.hasData ? (i.dataWiped ? '✅' : '⏳') : 'n/a'}</td><td>{i.certificate || '—'}</td><td>{i.txCount}</td>
        <td className={i.verdict === 'AUTHENTIC' ? 'ok' : 'bad'}><b>{i.verdict}</b></td></tr>)}</tbody></table></div></div>
    <div className="grid"><div className="card"><h3>Participant activity</h3><table className="t"><tbody>{r.participants.map(p => <tr key={p.id}><td>{p.name}<br /><span className="perm" style={{ margin: 0 }}>{p.role}</span></td><td><b>{p.transactions}</b> txs</td></tr>)}</tbody></table></div>
      <div className="card"><h3>Materials recovered</h3>{Object.keys(r.recovery.materials).length ? <table className="t"><tbody>{Object.entries(r.recovery.materials).map(([k, x]) => <tr key={k}><td>{k}</td><td><b>{x} kg</b></td></tr>)}</tbody></table> : <span className="perm">None yet.</span>}
        <h3 style={{ marginTop: 14 }}>Alerts by type</h3>{Object.entries(r.alerts.byKind).map(([k, x]) => <div key={k}>{k.replace('_', ' ')}: <b>{x}</b></div>)}</div></div></>;
}

function App() {
  const hash = useHash(), [page, arg] = hash.split('=');
  const [P, setP] = useState([]), [me, setMe] = useState(null), [mode, setMode] = useState({}), [st, setSt] = useState(null), [scan, setScan] = useState(false), [q, setQ] = useState('');
  useEffect(() => { api('/participants').then(p => { setP(p); setMe(p[0]); }); api('/mode').then(setMode); }, []);
  useEffect(() => { api('/chain/validate').then(setSt).catch(() => {}); }, [hash]);
  if (!me) return <div style={{ padding: 40 }}>Loading…</div>;
  const pub = page === 'verify', cur = page || 'items';
  const tabs = [['items', '📦 Items'], ['register', '➕ Register'], ['ledger', '⛓ Ledger'], ['alerts', '🚨 Alerts'], ['report', '📊 Audit report']];
  const search = e => { if (e.key === 'Enter' && q.trim()) { go('item=' + q.trim().toUpperCase()); setQ(''); } };
  return <>
    <div className="hero"><div className="wrap">
      <div className="top"><div className="logo">♻ EcoChain<small>Blockchain E-Waste Chain of Custody</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="srch" placeholder="🔍 Enter item ID (EW-XXXXXXXX)" value={q} onChange={e => setQ(e.target.value)} onKeyDown={search} />
          <button className="hbtn" onClick={() => setScan(true)}>📷 Scan QR</button>
          <span className="pill" style={st && !st.valid ? { background: '#e5484d' } : {}}>{!st ? '…' : st.valid ? `● Ledger valid${st.height ? ' · ' + st.height + ' blocks' : ''}` : '⚠ LEDGER TAMPERED'}</span>
          <span className="pill">{mode.ledger === 'fabric' ? 'Hyperledger Fabric' : 'Built-in ledger'} · {mode.store}</span></div></div>
      <h2>Track every device, from bin to recycler.</h2><p>Tamper-evident custody records, smart-contract rules and verifiable recycling certificates.</p></div></div>
    <main className="wrap">
      {!pub && <><div className="roles">{P.map(p => <button key={p.id} className={'role ' + (p.id === me.id ? 'on' : '')} onClick={() => setMe(p)}>
        <span className="e">{ROLE[p.role][0]}</span><b>{p.name}</b><span>{p.role}</span></button>)}</div>
        <div className="perm">Acting as <b>{me.name}</b>: {ROLE[me.role][1]}.</div>
        <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={cur === k ? 'on' : ''} onClick={() => go(k)}>{l}</button>)}</div></>}
      {pub && <div className="pubbar">🔎 Public verification page: read-only. <a href={'#item=' + arg}>Open in dashboard →</a></div>}
      {cur === 'items' && <Items me={me} />}
      {cur === 'register' && <Register me={me} />}
      {cur === 'ledger' && <Ledger mode={mode} />}
      {cur === 'alerts' && <Alerts />}
      {cur === 'report' && <Report />}
      {(cur === 'item' || cur === 'verify') && <><button className="g" onClick={() => go('items')} style={{ marginBottom: 12 }}>← All items</button><ItemView id={arg} me={me} P={P} pub={pub} /></>}
    </main>
    {scan && <Scanner onClose={() => setScan(false)} />}</>;
}
createRoot(document.getElementById('root')).render(<App />);
