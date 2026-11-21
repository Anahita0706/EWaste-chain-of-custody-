// Smart contract (chaincode logic): role-based access + lifecycle state machine.
// Used by the ledger on submit AND when replaying the chain to rebuild world state.
const U = require('./utils');
const RULES = {
  REGISTER:  { roles: ['GENERATOR', 'COLLECTOR'], from: null },
  COLLECT:   { roles: ['COLLECTOR'], from: ['REGISTERED'] },
  TRANSFER:  { roles: ['COLLECTOR', 'TRANSPORTER'], from: ['COLLECTED', 'IN_TRANSIT'] },
  ACCEPT:    { roles: ['TRANSPORTER', 'RECYCLER'], from: ['IN_TRANSIT'] },
  WIPE:      { roles: ['RECYCLER'], from: ['RECEIVED'] },
  DISMANTLE: { roles: ['RECYCLER'], from: ['RECEIVED', 'DATA_WIPED'] },
  RECYCLE:   { roles: ['RECYCLER'], from: ['DISMANTLED'] },
};
const sum = o => Object.values(o || {}).reduce((a, b) => a + (+b || 0), 0);
const newWorld = () => ({ items: {} });

function validate(tx, world, actor, lookup) {
  const r = RULES[tx.type], p = tx.payload || {};
  if (!r) return 'Unknown transaction type';
  if (!actor || actor.role !== tx.actorRole) return 'Actor identity/role mismatch';
  if (!r.roles.includes(actor.role)) return `Role ${actor.role} is not allowed to ${tx.type}`;
  const it = world.items[tx.itemId];
  if (tx.type === 'REGISTER') {
    if (it) return 'Item already registered';
    if (!/^[0-9a-f]{64}$/.test(p.dataHash || '')) return 'On-chain dataHash required';
    if (!(p.weightKg > 0)) return 'Weight must be positive';
    return null;
  }
  if (!it) return 'Item not found';
  if (!r.from.includes(it.state)) return `Invalid transition: ${it.state} -> ${tx.type}`;
  if (tx.type === 'COLLECT') return null;
  if (tx.type === 'ACCEPT') return it.pendingTo === actor.id ? null : 'No transfer is pending for you';
  if (it.custodian !== actor.id) return 'Only the current custodian can perform this action';
  switch (tx.type) {
    case 'TRANSFER': {
      if (it.pendingTo) return 'A transfer is already pending';
      const to = lookup(p.to);
      if (!to || !['TRANSPORTER', 'RECYCLER'].includes(to.role)) return 'Recipient must be a registered transporter or recycler';
      if (to.id === actor.id) return 'Cannot transfer to yourself';
      return null;
    }
    case 'WIPE':
      if (!it.hasData) return 'Item has no data-bearing storage';
      if (!p.method || !p.docHash) return 'Wipe method and wipe report required';
      return null;
    case 'DISMANTLE':
      if (it.hasData && it.state !== 'DATA_WIPED') return 'Data-bearing item must be wiped before dismantling';
      return null;
    case 'RECYCLE': {
      const t = sum(p.materials);
      if (!(t > 0)) return 'Recovered materials required';
      if (t > it.weightKg) return 'Recovered mass exceeds item weight';
      return null;
    }
  }
  return null;
}

function apply(world, tx, block) {
  const p = tx.payload || {};
  let it = world.items[tx.itemId];
  if (tx.type === 'REGISTER')
    it = world.items[tx.itemId] = { itemId: tx.itemId, state: 'REGISTERED', custodian: tx.actor, pendingTo: null,
      dataHash: p.dataHash, hasData: !!p.hasData, weightKg: p.weightKg, category: p.category, history: [], certificate: null };
  else if (tx.type === 'COLLECT') { it.state = 'COLLECTED'; it.custodian = tx.actor; }
  else if (tx.type === 'TRANSFER') { it.state = 'IN_TRANSIT'; it.pendingTo = p.to; }
  else if (tx.type === 'ACCEPT') { it.custodian = tx.actor; it.pendingTo = null; it.state = tx.actorRole === 'RECYCLER' ? 'RECEIVED' : 'IN_TRANSIT'; }
  else if (tx.type === 'WIPE') it.state = 'DATA_WIPED';
  else if (tx.type === 'DISMANTLE') it.state = 'DISMANTLED';
  it.history.push({ txId: tx.txId, type: tx.type, actor: tx.actor, actorRole: tx.actorRole, timestamp: tx.timestamp, block, payload: p });
  if (tx.type === 'RECYCLE') {
    it.state = 'RECYCLED';
    const kg = sum(p.materials);
    const cert = { certId: 'CERT-' + tx.txId.slice(0, 10).toUpperCase(), itemId: it.itemId, recycler: tx.actor,
      materials: p.materials, recoveredKg: kg, recoveryRatePct: +(kg / it.weightKg * 100).toFixed(1),
      issuedAt: tx.timestamp, custodyTxIds: it.history.map(h => h.txId) };
    cert.certHash = U.sha256(U.canon(cert));
    it.certificate = cert;
  }
}
module.exports = { validate, apply, newWorld, RULES };
