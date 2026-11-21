# Running on real Hyperledger Fabric (Windows: use WSL2 + Docker Desktop)

> Written for fabric-samples `test-network` (Fabric 2.5). Not executable in the sandbox where this project was
> generated, so follow the steps and fix small version differences if any appear.

1. **Install** Docker Desktop (enable WSL2 integration), then in a WSL2 Ubuntu terminal:
   ```bash
   mkdir ~/fabric && cd ~/fabric
   curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh && chmod +x install-fabric.sh
   ./install-fabric.sh docker samples binary
   ```
2. **Start the network** (2 orgs, 1 orderer, CA enabled) and create a channel:
   ```bash
   cd fabric-samples/test-network
   ./network.sh down
   ./network.sh up createChannel -c mychannel -ca
   ```
3. **Deploy the chaincode** (path = the `chaincode` folder of this project, inside WSL):
   ```bash
   ./network.sh deployCC -ccn ewaste -ccp /path/to/ewaste-chain/chaincode -ccl javascript
   ```
4. **Create the app wallet** (from this project's root):
   ```bash
   npm install
   export FABRIC_CCP=~/fabric/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.json
   npm run fabric:enroll
   ```
5. **Start the app on Fabric:**
   ```bash
   export FABRIC_CCP=...same path...
   LEDGER=fabric node server.js
   ```
   On start the app registers the participants (public keys) on the ledger. Every transaction is signed by the
   actor's ECDSA key and verified inside the chaincode, then endorsed, ordered and committed by Fabric.

Back to the built-in ledger any time: just `npm start` (no environment variables).

## Known limits (be honest in the viva)
- One Fabric identity (`appUser`, Org1) submits for all participants; per-participant identity is enforced by the
  signed-transaction check in the chaincode, not by separate Fabric CA enrolments (future work: one org per party).
- `initParticipants` is unrestricted in this prototype; production would restrict it to an admin MSP.
- The block explorer tab shows a note on Fabric; use `peer channel getinfo` / Hyperledger Explorer for blocks.

## MongoDB (optional)
`npm install` then `MONGO_URI="mongodb://localhost:27017" npm start` (or an Atlas URI). Without it a JSON file is used.
