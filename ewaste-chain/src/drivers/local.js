// Built-in permissioned ledger driver (works with no setup).
const path = require('path'), U = require('../utils'), C = require('../contract'), { Blockchain } = require('../blockchain');
class LocalDriver {
  constructor(dir, ids, lookup) {
    this.name = 'local'; this.lookup = lookup;
    this.ledger = new Blockchain(path.join(dir, 'chain.json'), ids.validators, id => lookup(id)?.publicKey, +process.env.BATCH_SIZE || 1);
  }
  async submit(tx) {
    if (!this.ledger.validate().valid) throw new Error('Ledger integrity check failed - writes blocked');
    const { txId, signature, ...body } = tx, actor = this.lookup(tx.actor);
    if (U.sha256(U.canon(body)) !== txId || !U.verify(txId, signature, actor?.publicKey)) throw new Error('Invalid digital signature');
    const err = C.validate(body, this.ledger.world, actor, this.lookup);       // smart-contract enforcement
    if (err) throw new Error('Smart contract rejected: ' + err);
    this.ledger.add(tx);
    return { txId, block: this.ledger.world.items[tx.itemId].history.slice(-1)[0].block };
  }
  async getItem(id) { return this.ledger.world.items[id] || null; }
  async listItems() { return Object.values(this.ledger.world.items).reverse(); }
  async validate() { return this.ledger.validate(); }
  async chain() { return { blocks: this.ledger.chain, pending: this.ledger.pending, status: this.ledger.validate() }; }
  async seal() { return this.ledger.seal() || { message: 'Nothing pending' }; }
  async tamperChain(i) { const b = this.ledger.chain[i]; if (!b || !b.txs.length) throw new Error('Choose a block that has transactions'); b.txs[0].payload.tampered = true; }
  async restore() { this.ledger.load(); }
}
module.exports = LocalDriver;
