// Hyperledger Fabric driver (set LEDGER=fabric). See fabric/FABRIC_SETUP.md.
const fs = require('fs'), path = require('path');
class FabricDriver {
  constructor() {
    this.name = 'fabric'; this.p = null;
    this.cfg = { ccp: process.env.FABRIC_CCP, wallet: process.env.FABRIC_WALLET || path.join(__dirname, '..', '..', 'fabric', 'wallet'),
      identity: process.env.FABRIC_IDENTITY || 'appUser', channel: process.env.FABRIC_CHANNEL || 'mychannel', cc: process.env.FABRIC_CC || 'ewaste' };
  }
  contract() {
    if (!this.p) this.p = (async () => {
      const { Gateway, Wallets } = require('fabric-network');
      if (!this.cfg.ccp) throw new Error('Set FABRIC_CCP to the Org1 connection profile (connection-org1.json)');
      const gw = new Gateway(), wallet = await Wallets.newFileSystemWallet(this.cfg.wallet);
      await gw.connect(JSON.parse(fs.readFileSync(this.cfg.ccp)), { wallet, identity: this.cfg.identity, discovery: { enabled: true, asLocalhost: true } });
      return gw.getNetwork(this.cfg.channel).getContract(this.cfg.cc);
    })().catch(e => { this.p = null; throw e; });
    return this.p;
  }
  async initParticipants(list) { await (await this.contract()).submitTransaction('initParticipants', JSON.stringify(list)); }
  async submit(tx) {
    const c = await this.contract();
    try { await c.submitTransaction('submit', JSON.stringify(tx)); }
    catch (e) { const m = e.details?.[0]?.message || e.responses?.[0]?.response?.message || e.message; throw new Error('Smart contract rejected: ' + String(m).replace(/^.*message: /, '')); }
    return { txId: tx.txId, block: null };
  }
  async getItem(id) { const r = await (await this.contract()).evaluateTransaction('getItem', id); return r.length ? JSON.parse(r.toString()) : null; }
  async listItems() { return JSON.parse((await (await this.contract()).evaluateTransaction('listItems')).toString()).reverse(); }
  async validate() { return { valid: true, height: null, errors: [], note: 'Integrity enforced by Hyperledger Fabric peers and orderer' }; }
  async chain() { return { blocks: [], pending: [], status: await this.validate(), note: 'Block explorer: use `peer channel getinfo` or Hyperledger Explorer on Fabric.' }; }
  async seal() { return { message: 'Fabric orderer creates blocks' }; }
  async tamperChain() { throw new Error('Not possible on Fabric: ledger is immutable. (Use "Alter database record" instead.)'); }
  async restore() {}
}
module.exports = FabricDriver;
