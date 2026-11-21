const crypto = require('crypto');
const sha256 = d => crypto.createHash('sha256').update(d).digest('hex');
const sortKeys = o => Array.isArray(o) ? o.map(sortKeys)
  : (o && typeof o === 'object') ? Object.keys(o).sort().reduce((a, k) => (a[k] = sortKeys(o[k]), a), {}) : o;
const canon = o => JSON.stringify(sortKeys(o));            // canonical JSON -> deterministic hashes
const genKeys = () => crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1',
  publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const sign = (data, priv) => crypto.sign('sha256', Buffer.from(data), priv).toString('base64');
const verify = (data, sig, pub) => { try { return crypto.verify('sha256', Buffer.from(data), pub, Buffer.from(sig, 'base64')); } catch { return false; } };
function merkleRoot(hashes) {
  if (!hashes.length) return sha256('');
  let level = hashes;
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(sha256(level[i] + (level[i + 1] || level[i])));
    level = next;
  }
  return level[0];
}
module.exports = { sha256, canon, genKeys, sign, verify, merkleRoot };
