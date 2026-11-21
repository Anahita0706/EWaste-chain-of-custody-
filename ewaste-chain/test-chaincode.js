// Runs the Fabric chaincode against an in-memory mock of the Fabric stub (no network needed).
const Module = require('module'), orig = Module._load;
Module._load = function (r, ...a) { return r === 'fabric-contract-api' ? { Contract: class {} } : orig.call(this, r, ...a); };
const EW = require('./chaincode/lib/ewaste'), U = require('./src/utils');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + '[chaincode] ' + m); if (!c) process.exitCode = 1; };
const state = new Map(), ctx = { stub: { getState: async k => state.has(k) ? Buffer.from(state.get(k)) : Buffer.alloc(0),
  putState: async (k, v) => state.set(k, v.toString()), setEvent() {},
  getStateByRange: async function* (a, b) { for (const [k, v] of [...state].sort()) if (k >= a && k < b) yield { value: Buffer.from(v) }; } } };
const cc = new EW(), roles = { GEN1: 'GENERATOR', COL1: 'COLLECTOR', TRN1: 'TRANSPORTER', REC1: 'RECYCLER' }, keys = {};
(async () => {
  for (const id in roles) keys[id] = U.genKeys();
  await cc.initParticipants(ctx, JSON.stringify(Object.keys(roles).map(id => ({ id, role: roles[id], name: id, publicKey: keys[id].publicKey }))));
  const send = async (actor, type, itemId, payload) => {
    const body = { type, itemId, actor, actorRole: roles[actor], payload, timestamp: Date.now() }, txId = U.sha256(U.canon(body));
    return cc.submit(ctx, JSON.stringify({ ...body, txId, signature: U.sign(txId, keys[actor].privateKey) }));
  };
  const fails = async (f, m) => { try { await f(); ok(false, m); } catch (e) { ok(true, m + ' -> ' + e.message); } };
  await send('GEN1', 'REGISTER', 'EW-1', { dataHash: U.sha256('x'), weightKg: 2, hasData: false, category: 'Phone' });
  await send('COL1', 'COLLECT', 'EW-1'); await send('COL1', 'TRANSFER', 'EW-1', { to: 'REC1' }); await send('REC1', 'ACCEPT', 'EW-1');
  await fails(() => send('TRN1', 'DISMANTLE', 'EW-1'), 'Wrong role rejected');
  await send('REC1', 'DISMANTLE', 'EW-1', {}); await send('REC1', 'RECYCLE', 'EW-1', { materials: { metal: 1.5 } });
  const it = JSON.parse(await cc.getItem(ctx, 'EW-1'));
  ok(it.state === 'RECYCLED' && it.certificate.certId.startsWith('CERT-'), 'Full lifecycle + certificate on chaincode');
  const body = { type: 'COLLECT', itemId: 'EW-1', actor: 'COL1', actorRole: 'COLLECTOR', payload: {}, timestamp: 1 }, txId = U.sha256(U.canon(body));
  await fails(() => cc.submit(ctx, JSON.stringify({ ...body, txId, signature: U.sign(txId, keys.TRN1.privateKey) })), 'Forged signature rejected');
  ok(JSON.parse(await cc.listItems(ctx)).length === 1, 'listItems works');
})();
