const express = require('express'), QRCode = require('qrcode'), path = require('path');
const S = require('./src/service');
const app = express(); app.use(express.json()); app.use(express.static(path.join(__dirname, 'public')));
const h = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(e => res.status(400).json({ error: e.message }));

app.get('/api/mode', h((q, r) => r.json(S.mode())));
app.get('/api/participants', h((q, r) => r.json(S.participants())));
app.get('/api/items', h(async (q, r) => r.json(await S.listItems())));
app.post('/api/items', h(async (q, r) => r.json({ itemId: await S.createItem(q.body.actorId, q.body) })));
app.get('/api/items/:id', h(async (q, r) => { const i = await S.getItem(q.params.id); i ? r.json(i) : r.status(404).json({ error: 'Item not found' }); }));
const ACTIONS = ['collect', 'transfer', 'accept', 'wipe', 'dismantle', 'recycle'];
app.post('/api/items/:id/:action', h(async (q, r) => {
  if (!ACTIONS.includes(q.params.action)) throw new Error('Unknown action');
  r.json(await S.submit(q.body.actorId, q.params.action.toUpperCase(), q.params.id, q.body.payload, q.body.document));
}));
app.get('/api/verify/:id', h(async (q, r) => { const v = await S.verifyItem(q.params.id); v ? r.json(v) : r.status(404).json({ error: 'Item not found' }); }));
app.get('/api/certificate/:id', h(async (q, r) => { const i = await S.getItem(q.params.id); i?.certificate ? r.json({ certificate: i.certificate, verification: await S.verifyItem(q.params.id) }) : r.status(404).json({ error: 'No certificate yet' }); }));
app.get('/api/chain', h(async (q, r) => r.json(await S.driver.chain())));
app.get('/api/chain/validate', h(async (q, r) => r.json(await S.driver.validate())));
app.post('/api/seal', h(async (q, r) => r.json(await S.driver.seal())));
app.get('/api/alerts', h(async (q, r) => r.json(await S.alerts())));
app.get('/api/report', h(async (q, r) => r.json(await S.report())));
app.get('/api/qr/:id', h(async (q, r) => { r.type('png').send(await QRCode.toBuffer(`${q.protocol}://${q.get('host')}/#verify=${q.params.id}`, { width: 260, margin: 1 })); }));
app.post('/api/demo/tamper-db', h(async (q, r) => { await S.tamperDb(q.body.itemId); r.json({ ok: true }); }));
app.post('/api/demo/tamper-chain', h(async (q, r) => { await S.tamperChain(+q.body.blockIndex); r.json({ ok: true }); }));
app.post('/api/demo/restore', h(async (q, r) => { await S.restore(); r.json({ ok: true }); }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`EcoChain running at http://localhost:${PORT}  [ledger=${S.driver.name}, store=${S.store.name}]`);
  if (S.driver.name === 'fabric') try { await S.driver.initParticipants(S.participants()); console.log('Participants registered on Fabric'); } catch (e) { console.error('Fabric init failed:', e.message); }
});
