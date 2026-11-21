'use strict';
// Hyperledger Fabric chaincode. Same rules as the local ledger (contract.js).
// Every transaction carries the actor's ECDSA signature, verified here against the participant registry on the ledger.
const { Contract } = require('fabric-contract-api');
const C = require('./contract'), U = require('./utils');

class EWaste extends Contract {
  async initParticipants(ctx, json) {
    for (const p of JSON.parse(json)) await ctx.stub.putState('P_' + p.id, Buffer.from(JSON.stringify(p)));
  }
  async _participant(ctx, id) { const r = await ctx.stub.getState('P_' + id); return r && r.length ? JSON.parse(r.toString()) : null; }

  async submit(ctx, txJson) {
    const tx = JSON.parse(txJson), { txId, signature, ...body } = tx;
    const actor = await this._participant(ctx, tx.actor);
    if (!actor) throw new Error('Unknown participant');
    if (U.sha256(U.canon(body)) !== txId) throw new Error('Transaction hash mismatch');
    if (!U.verify(txId, signature, actor.publicKey)) throw new Error('Invalid digital signature');
    const raw = await ctx.stub.getState(tx.itemId), world = { items: {} };
    if (raw && raw.length) world.items[tx.itemId] = JSON.parse(raw.toString());
    const to = tx.payload && tx.payload.to ? await this._participant(ctx, tx.payload.to) : null;
    const err = C.validate(body, world, actor, id => (to && to.id === id ? to : null));
    if (err) throw new Error(err);
    C.apply(world, tx, null);
    await ctx.stub.putState(tx.itemId, Buffer.from(JSON.stringify(world.items[tx.itemId])));
    ctx.stub.setEvent('EWasteEvent', Buffer.from(JSON.stringify({ type: tx.type, itemId: tx.itemId, txId })));
  }
  async getItem(ctx, id) { const r = await ctx.stub.getState(id); return r && r.length ? r.toString() : ''; }
  async listItems(ctx) {
    const out = [];
    for await (const r of ctx.stub.getStateByRange('EW-', 'EW-~')) out.push(JSON.parse(Buffer.from(r.value).toString()));
    return JSON.stringify(out);
  }
  async getHistory(ctx, id) {     // Fabric's built-in immutable key history
    const out = [];
    for await (const r of ctx.stub.getHistoryForKey(id)) out.push({ txId: r.txId, isDelete: r.isDelete, value: Buffer.from(r.value).toString() });
    return JSON.stringify(out);
  }
}
module.exports = EWaste;
