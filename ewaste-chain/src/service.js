// Application service: identities, off-chain store, ledger driver, alerts, verification, audit report.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const U = require('./utils'), { JsonStore, MongoStore } = require('./store');
const DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data'); fs.mkdirSync(DIR, { recursive: true });
const idFile = path.join(DIR, 'identities.json');
const mk = (id, name, role) => { const k = U.genKeys(); return { id, name, role, publicKey: k.publicKey, privateKey: k.privateKey }; };
let ids;
if (fs.existsSync(idFile)) ids = JSON.parse(fs.readFileSync(idFile));
else {
  ids = { participants: [mk('GEN1', 'Green Valley Apartments', 'GENERATOR'), mk('COL1', 'EcoCollect Pvt Ltd', 'COLLECTOR'),
      mk('TRN1', 'SafeMove Logistics', 'TRANSPORTER'), mk('REC1', 'CleanCycle Recyclers', 'RECYCLER'), mk('AUD1', 'Pollution Control Board', 'AUDITOR')],
    validators: ['A', 'B', 'C'].map(x => mk('NODE-' + x, 'Validator ' + x, 'VALIDATOR')) };
  fs.writeFileSync(idFile, JSON.stringify(ids, null, 2));
}
const lookup = id => ids.participants.find(p => p.id === id);
const store = process.env.MONGO_URI ? new MongoStore(process.env.MONGO_URI, process.env.MONGO_DB) : new JsonStore(DIR);
const driver = process.env.LEDGER === 'fabric' ? new (require('./drivers/fabric'))() : new (require('./drivers/local'))(DIR, ids, lookup);
const participants = () => ids.participants.map(p => ({ id: p.id, name: p.name, role: p.role, publicKey: p.publicKey }));
const mode = () => ({ ledger: driver.name, store: store.name });

const seen = new Set();
async function raise(kind, severity, message, extra = {}, key) {
  if (key) { if (seen.has(key)) return; seen.add(key); }
  await store.addAlert({ id: crypto.randomBytes(4).toString('hex'), time: Date.now(), kind, severity, message, ...extra });
}

async function submit(actorId, type, itemId, payload = {}, document) {
  const actor = lookup(actorId);
  try {
    if (!actor) throw new Error('Unknown participant');
    payload = { ...payload }; if (document) payload.docHash = U.sha256(document);   // document stays off-chain, hash goes on-chain
    const body = { type, itemId, actor: actor.id, actorRole: actor.role, payload, timestamp: Date.now() };
    const txId = U.sha256(U.canon(body));
    const res = await driver.submit({ ...body, txId, signature: U.sign(txId, actor.privateKey) });   // digital signature
    if (document) { const rec = await store.get(itemId); if (rec) { rec.docs[payload.docHash] = { type, text: document }; await store.put(itemId, rec); } }
    return res;
  } catch (e) {
    const high = /not allowed|custodian|signature|Unknown participant/.test(e.message);
    await raise(high ? 'UNAUTHORIZED_ACTION' : 'INVALID_ACTION', high ? 'high' : 'medium', e.message, { actor: actorId, itemId, action: type });
    throw e;
  }
}

async function createItem(actorId, d) {
  const itemId = 'EW-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const details = { category: d.category, description: d.description, brand: d.brand || '', weightKg: +d.weightKg,
    hasData: !!d.hasData, generator: d.generator || lookup(actorId)?.name, createdAt: new Date().toISOString() };
  await store.put(itemId, { details, docs: {} });
  try { await submit(actorId, 'REGISTER', itemId, { dataHash: U.sha256(U.canon(details)), weightKg: details.weightKg, hasData: details.hasData, category: details.category }); }
  catch (e) { await store.del(itemId); throw e; }
  return itemId;
}

async function getItem(id) { const it = await driver.getItem(id); if (!it) return null; const rec = await store.get(id); return { ...it, details: rec?.details }; }
async function listItems() { const l = await driver.listItems(); return Promise.all(l.map(async it => ({ ...it, details: (await store.get(it.itemId))?.details }))); }

async function verifyItem(id, { silent } = {}) {
  const it = await driver.getItem(id); if (!it) return null;
  const rec = await store.get(id), checks = [], chain = await driver.validate();
  checks.push({ name: 'Ledger integrity (hash chain, Merkle roots, validator & user signatures)', ok: chain.valid,
    detail: chain.valid ? (chain.note || `${chain.height} blocks verified`) : chain.errors.map(e => `Block ${e.block}: ${e.error}`).join('; ') });
  const h = rec ? U.sha256(U.canon(rec.details)) : null;
  checks.push({ name: 'Off-chain item record matches on-chain hash', ok: h === it.dataHash, detail: h === it.dataHash ? 'SHA-256 match' : 'Database record was modified after registration' });
  it.history.filter(e => e.payload.docHash).forEach(e => {
    const d = rec?.docs?.[e.payload.docHash], ok = !!d && U.sha256(d.text) === e.payload.docHash;
    checks.push({ name: `${e.type} document matches on-chain hash`, ok, detail: ok ? 'SHA-256 match' : 'Document missing or altered' });
  });
  if (it.certificate) { const { certHash, ...c } = it.certificate;
    checks.push({ name: 'Recycling certificate hash is valid', ok: U.sha256(U.canon(c)) === certHash, detail: it.certificate.certId }); }
  const bad = checks.filter(c => !c.ok), verdict = bad.length ? 'TAMPERED' : 'AUTHENTIC';
  if (bad.length && !silent) await raise('TAMPER_DETECTED', 'critical', `Item ${id}: ${bad.map(b => b.name).join(' | ')}`, { itemId: id }, id + bad.map(b => b.name).join());
  return { itemId: id, state: it.state, verdict, checks };
}

async function report() {
  const list = await listItems(), chain = await driver.validate(), al = await store.alerts();
  const act = {}, mat = {}, byState = {}, kinds = {}; let recKg = 0, recW = 0, totalW = 0;
  const rows = [];
  for (const it of list) {
    const v = await verifyItem(it.itemId, { silent: true });
    it.history.forEach(h => act[h.actor] = (act[h.actor] || 0) + 1);
    byState[it.state] = (byState[it.state] || 0) + 1; totalW += it.weightKg;
    if (it.certificate) { recKg += it.certificate.recoveredKg; recW += it.weightKg; for (const [k, x] of Object.entries(it.certificate.materials)) mat[k] = +((mat[k] || 0) + (+x || 0)).toFixed(2); }
    rows.push({ itemId: it.itemId, category: it.details?.category, weightKg: it.weightKg, state: it.state, custodian: it.custodian, hasData: it.hasData,
      dataWiped: !it.hasData || it.history.some(h => h.type === 'WIPE'), certificate: it.certificate?.certId || null, verdict: v.verdict, txCount: it.history.length });
  }
  al.forEach(a => kinds[a.kind] = (kinds[a.kind] || 0) + 1);
  return { generatedAt: Date.now(), ledger: { ...chain, mode: driver.name },
    totals: { items: list.length, recycled: byState.RECYCLED || 0, weightKg: +totalW.toFixed(2), byState },
    recovery: { recoveredKg: +recKg.toFixed(2), recoveryRatePct: recW ? +(recKg / recW * 100).toFixed(1) : 0, materials: mat },
    participants: ids.participants.map(p => ({ id: p.id, name: p.name, role: p.role, transactions: act[p.id] || 0 })),
    alerts: { total: al.length, byKind: kinds }, items: rows };
}

// ---- Demo-only tamper helpers ----
let dbBackup = null;
async function tamperDb(id) { const rec = await store.get(id); if (!rec) throw new Error('Item not found');
  dbBackup = { id, rec: JSON.parse(JSON.stringify(rec)) }; rec.details.weightKg += 5; await store.put(id, rec); }
async function restore() { if (dbBackup) { await store.put(dbBackup.id, dbBackup.rec); dbBackup = null; } seen.clear(); await driver.restore(); }

module.exports = { participants, mode, submit, createItem, getItem, listItems, verifyItem, report, driver, store,
  alerts: () => store.alerts(), tamperDb, tamperChain: i => driver.tamperChain(i), restore };
