// Permissioned ledger: blocks, Merkle roots, Proof-of-Authority sealing, ECDSA-signed transactions.
const fs = require('fs');
const U = require('./utils'), C = require('./contract');

class Blockchain {
  constructor(file, validators, keyOf, batch = 1) {
    this.file = file; this.validators = validators; this.keyOf = keyOf; this.batch = batch; this.load();
  }
  hashBlock(b) { return U.sha256(`${b.index}|${b.timestamp}|${b.prevHash}|${b.merkleRoot}|${b.validator}`); }
  genesis() {
    const b = { index: 0, timestamp: 0, prevHash: '0'.repeat(64), merkleRoot: U.merkleRoot([]), validator: 'GENESIS', signature: '', txs: [] };
    b.hash = this.hashBlock(b); return b;
  }
  load() {
    if (fs.existsSync(this.file)) { const d = JSON.parse(fs.readFileSync(this.file)); this.chain = d.chain; this.pending = d.pending || []; }
    else { this.chain = [this.genesis()]; this.pending = []; this.save(); }
    this.rebuild();
  }
  save() { fs.writeFileSync(this.file, JSON.stringify({ chain: this.chain, pending: this.pending }, null, 2)); }
  rebuild() {                                   // world state = replay of all committed transactions
    this.world = C.newWorld();
    this.chain.forEach(b => b.txs.forEach(t => C.apply(this.world, t, b.index)));
    this.pending.forEach(t => C.apply(this.world, t, null));
  }
  add(tx) { C.apply(this.world, tx, null); this.pending.push(tx); this.pending.length >= this.batch ? this.seal() : this.save(); }
  seal() {                                       // Proof-of-Authority: validators take turns (round-robin)
    if (!this.pending.length) return null;
    const v = this.validators[this.chain.length % this.validators.length], prev = this.chain[this.chain.length - 1];
    const b = { index: this.chain.length, timestamp: Date.now(), prevHash: prev.hash,
      merkleRoot: U.merkleRoot(this.pending.map(t => t.txId)), validator: v.id, txs: this.pending };
    b.hash = this.hashBlock(b); b.signature = U.sign(b.hash, v.privateKey);
    this.pending.forEach(t => { const h = this.world.items[t.itemId].history.find(e => e.txId === t.txId); if (h) h.block = b.index; });
    this.chain.push(b); this.pending = []; this.save(); return b;
  }
  validate() {
    const errors = [], add = (block, error) => errors.push({ block, error });
    this.chain.forEach((b, i) => {
      if (b.hash !== this.hashBlock(b)) add(i, 'Block hash mismatch (header altered)');
      if (i > 0 && b.prevHash !== this.chain[i - 1].hash) add(i, 'Broken link to previous block');
      const re = b.txs.map(t => { const { txId, signature, ...body } = t; return U.sha256(U.canon(body)); });
      if (re.some((h, j) => h !== b.txs[j].txId)) add(i, 'Transaction data altered (txId mismatch)');
      if (U.merkleRoot(re) !== b.merkleRoot) add(i, 'Merkle root mismatch');
      if (i > 0) { const v = this.validators.find(x => x.id === b.validator);
        if (!v || !U.verify(b.hash, b.signature, v.publicKey)) add(i, 'Invalid validator signature'); }
      b.txs.forEach(t => { const pk = this.keyOf(t.actor);
        if (!pk || !U.verify(t.txId, t.signature, pk)) add(i, `Invalid digital signature on tx ${t.txId.slice(0, 8)}`); });
    });
    return { valid: !errors.length, height: this.chain.length, errors };
  }
}
module.exports = { Blockchain };
