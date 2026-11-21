# EcoChain: Blockchain-Based E-Waste Chain of Custody and Verification System
JIIT Noida · Fundamentals of Blockchain Technology Lab (26B16CS317)

## Run (built-in ledger, nothing else needed)
```bash
npm install
npm test          # automated tests: lifecycle, smart-contract rules, tamper detection, chaincode on a mock Fabric stub
npm start         # http://localhost:3000   (delete the data/ folder to reset)
```
Edit the UI? `client/app.jsx` is React; run `npm run build` to regenerate `public/app.js`.

## Architecture (matches the project diagram)
```
React UI ─► Express API ─► Service ─┬─ Off-chain store: JSON file (default) or MongoDB (MONGO_URI)
                                    └─ Ledger driver:   built-in permissioned ledger (default) or Hyperledger Fabric (LEDGER=fabric)
```
Only hashes go on-chain; details and documents stay off-chain, so editing them breaks the hash match.

## Diagram / synopsis coverage
| Item | Where |
|---|---|
| 1 Registration, unique ID, QR | Register tab, `/api/qr/:id` |
| 2 Collection, 3 Transfer (2-step: transfer + accept), 4 Receipt | Item page actions |
| 5 Wipe / Dismantle / Recycle (wipe report hash on-chain) | Item page actions |
| 6 Recycling completed, 7 Certificate | Auto-issued, printable |
| 8 Verification: scan QR (camera), enter ID, public read-only page | Header search + Scan QR, `#verify=ID` |
| Hashing SHA-256 / Blocks / Transactions | `utils.js`, `blockchain.js` |
| Digital signatures (ECDSA) | `service.js`; verified by ledger and chaincode |
| Smart contracts: participants, transfers, recycling rules, invalid actions | `contract.js` (+ Fabric copy in `chaincode/`) |
| Merkle tree, Proof-of-Authority validators | `blockchain.js` |
| Immutable records / tamper detection | Ledger tab (Alter block / Alter DB / Restore) |
| Tamper & invalid-action alerts | Alerts tab, `/api/alerts` |
| Audit & compliance report (printable) | Audit report tab, `/api/report` |
| React.js / Node+Express / MongoDB / Hyperledger Fabric | `client/`, `server.js`, `src/store.js`, `src/drivers/fabric.js` + `chaincode/` |

## Hyperledger Fabric and MongoDB
See `fabric/FABRIC_SETUP.md`. Short version: `LEDGER=fabric` and `MONGO_URI=...` switch the backend; defaults need no setup.

## Verification status (honest)
- Tested in development: built-in ledger, all rules, alerts, report, API, and the chaincode logic against an in-memory mock of the Fabric stub.
- **Not tested here:** a live Fabric network and a live MongoDB (neither can run in the generation sandbox). Expect to debug small version/path issues on first run. Built-in mode is the safe fallback for demos.
- Participant private keys are held by the server for the demo; production would use wallets / Fabric CA.

## Viva demo script
1. Green Valley registers a laptop. 2. EcoCollect collects, transfers to SafeMove. 3. SafeMove accepts, transfers to CleanCycle. 4. CleanCycle accepts.
5. Click "force dismantle": rejected; see it in Alerts. 6. Wipe, dismantle, recycle: certificate. 7. Scan QR / enter ID: public verify page.
8. Ledger tab: Alter a block, status turns INVALID, Alerts shows TAMPER DETECTED; Restore. 9. Audit report: print.
