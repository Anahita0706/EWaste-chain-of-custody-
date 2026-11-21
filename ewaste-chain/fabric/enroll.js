// Creates a wallet with admin + appUser identities from the Fabric CA (Org1) of fabric-samples/test-network.
const FabricCAServices = require('fabric-ca-client'), { Wallets } = require('fabric-network');
const fs = require('fs'), path = require('path');
(async () => {
  const ccp = JSON.parse(fs.readFileSync(process.env.FABRIC_CCP));
  const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
  const ca = new FabricCAServices(caInfo.url, { trustedRoots: caInfo.tlsCACerts.pem, verify: false }, caInfo.caName);
  const wallet = await Wallets.newFileSystemWallet(process.env.FABRIC_WALLET || path.join(__dirname, 'wallet'));
  const put = async (id, e) => wallet.put(id, { credentials: { certificate: e.certificate, privateKey: e.key.toBytes() }, mspId: 'Org1MSP', type: 'X.509' });
  if (!(await wallet.get('admin'))) await put('admin', await ca.enroll({ enrollmentID: 'admin', enrollmentSecret: 'adminpw' }));
  if (!(await wallet.get('appUser'))) {
    const adminId = await wallet.get('admin');
    const adminUser = await wallet.getProviderRegistry().getProvider(adminId.type).getUserContext(adminId, 'admin');
    const secret = await ca.register({ affiliation: 'org1.department1', enrollmentID: 'appUser', role: 'client' }, adminUser);
    await put('appUser', await ca.enroll({ enrollmentID: 'appUser', enrollmentSecret: secret }));
  }
  console.log('Wallet ready (admin, appUser)');
})().catch(e => { console.error(e.message); process.exit(1); });
