// Off-chain storage. JsonStore (default) or MongoStore (set MONGO_URI).
const fs = require('fs'), path = require('path');
class JsonStore {
  constructor(dir) { this.name = 'json'; this.f = path.join(dir, 'db.json');
    this.d = fs.existsSync(this.f) ? JSON.parse(fs.readFileSync(this.f)) : { items: {}, alerts: [] }; this.d.alerts = this.d.alerts || []; }
  save() { fs.writeFileSync(this.f, JSON.stringify(this.d, null, 2)); }
  async get(id) { return this.d.items[id] ? JSON.parse(JSON.stringify(this.d.items[id])) : null; }
  async put(id, rec) { this.d.items[id] = rec; this.save(); }
  async del(id) { delete this.d.items[id]; this.save(); }
  async addAlert(a) { this.d.alerts.push(a); this.save(); }
  async alerts() { return [...this.d.alerts].reverse(); }
}
class MongoStore {
  constructor(uri, dbName) { this.name = 'mongodb'; const { MongoClient } = require('mongodb');
    this.c = new MongoClient(uri); this.ready = this.c.connect().then(() => { this.db = this.c.db(dbName || 'ewaste'); }); }
  async col(n) { await this.ready; return this.db.collection(n); }
  async get(id) { return (await this.col('items')).findOne({ _id: id }); }
  async put(id, rec) { const { _id, ...r } = rec; await (await this.col('items')).replaceOne({ _id: id }, { _id: id, ...r }, { upsert: true }); }
  async del(id) { await (await this.col('items')).deleteOne({ _id: id }); }
  async addAlert(a) { await (await this.col('alerts')).insertOne({ ...a }); }
  async alerts() { return (await this.col('alerts')).find({}, { projection: { _id: 0 } }).sort({ time: -1 }).limit(200).toArray(); }
}
module.exports = { JsonStore, MongoStore };
