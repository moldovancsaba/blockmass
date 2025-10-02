# BlockmassAnchor Smart Contract

Minimal Solidity contract for anchoring proof-of-location event hashes on Sepolia testnet.

## Overview

BlockmassAnchor stores SHA-256 content hashes on-chain with timestamps, providing tamper-proof records of off-chain events. This is the blockchain anchor for the Blockmass proof-of-location system.

### Contract Functions

- `anchor(bytes32 contentHash)` — Anchor a single hash (reverts if already anchored)
- `anchorBatch(bytes32[] contentHashes)` — Batch anchor multiple hashes (skips duplicates)
- `getAnchor(bytes32 contentHash)` — Check if hash is anchored and retrieve timestamp

### Events

- `Anchored(bytes32 indexed contentHash, uint256 timestamp, address indexed operator)`

## Prerequisites

1. **Node.js** (v18.18+ or v20+)
2. **Sepolia Testnet ETH** — Get from [Sepolia Faucet](https://sepoliafaucet.com/)
3. **RPC Endpoint** — Free from [Alchemy](https://www.alchemy.com) or [Infura](https://www.infura.io)
4. **MetaMask** (or another wallet) — For deployer private key
5. **Etherscan API Key** — For verification (optional but recommended)

## Setup

### 1. Install Dependencies

```bash
cd contracts
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add:

```env
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_API_KEY
```

⚠️ **Security Notes:**
- **NEVER** commit `.env` to version control
- Use a **dedicated testnet wallet** with only Sepolia ETH
- Do **NOT** use your main wallet's private key
- Keep private keys out of Vercel/production environments

### 3. Fund Deployer Account

Send 0.05-0.1 Sepolia ETH to your deployer address:
- Get your address: Import private key into MetaMask
- Get testnet ETH: https://sepoliafaucet.com/

## Deployment

### Compile Contract

```bash
npm run compile
```

Expected output:
```
Compiled 1 Solidity file successfully
```

### Deploy to Sepolia

```bash
npm run deploy:sepolia
```

Expected output:
```
Deploying BlockmassAnchor to Sepolia...

Deploying with account: 0xYourAddress...
Account balance: 0.08 ETH

✅ BlockmassAnchor deployed to: 0xContractAddress...

Next steps:
1. Add to frontend/.env.local:
   ANCHOR_CONTRACT_ADDRESS=0xContractAddress...
   ANCHOR_CHAIN_ID=11155111

2. Verify on Etherscan:
   npx hardhat verify --network sepolia 0xContractAddress...

3. View on Sepolia Etherscan:
   https://sepolia.etherscan.io/address/0xContractAddress...
```

**Save the contract address!** You'll need it for the next steps.

### Verify on Etherscan (Recommended)

```bash
npx hardhat verify --network sepolia 0xYourContractAddress
```

This makes the contract source code public and verifiable on Sepolia Etherscan.

## Configure Frontend

Add the deployed contract address to `frontend/.env.local`:

```env
# Blockchain anchoring (Sepolia testnet)
ANCHOR_CONTRACT_ADDRESS=0xYourContractAddress
ANCHOR_CHAIN_ID=11155111
ANCHOR_DEPLOYER_PRIVATE_KEY=0xYourPrivateKey
```

⚠️ **Production Safety:**
- For MVP, the private key is stored server-side in Vercel env vars
- This is acceptable for testnet-only anchoring with minimal funds
- For mainnet, use a secure signing service (AWS KMS, Azure Key Vault, etc.)

## Testing the Contract

You can test the deployed contract using Hardhat console:

```bash
npx hardhat console --network sepolia
```

Then:

```javascript
const BlockmassAnchor = await ethers.getContractFactory("BlockmassAnchor");
const contract = BlockmassAnchor.attach("0xYourContractAddress");

// Test hash
const testHash = "0x" + "a".repeat(64);

// Anchor it
const tx = await contract.anchor(testHash);
await tx.wait();

// Verify
const timestamp = await contract.getAnchor(testHash);
console.log("Anchored at:", timestamp.toString());
```

## Contract ABI

The compiled ABI is available at: `artifacts/contracts/BlockmassAnchor.sol/BlockmassAnchor.json`

You'll need this to interact with the contract from the Next.js API.

## Gas Costs (Sepolia)

Approximate costs:
- `anchor()` — ~45,000 gas (~$0.01 at 50 gwei)
- `anchorBatch(10)` — ~250,000 gas (~$0.05 at 50 gwei)

Testnet is free, but these estimates help plan for mainnet migration.

## Troubleshooting

### "insufficient funds"
- Your deployer account needs more Sepolia ETH
- Visit https://sepoliafaucet.com/

### "nonce has already been used"
- Wait 30 seconds and try again
- Or reset account nonce in MetaMask (Settings > Advanced > Reset Account)

### "Invalid API Key"
- Check your `SEPOLIA_RPC_URL` in `.env`
- Verify the API key is active on Alchemy/Infura

### "UNPREDICTABLE_GAS_LIMIT"
- Contract might be reverting (e.g., hash already anchored)
- Check the transaction details for revert reason

## Next Steps

Once deployed:
1. ✅ Record contract address in frontend `.env.local`
2. ✅ Verify contract on Etherscan
3. ✅ Update `/api/anchor/run` to call the contract
4. ✅ Test anchoring flow end-to-end
5. ✅ Document contract address in project docs

## Resources

- [Hardhat Documentation](https://hardhat.org/docs)
- [Sepolia Testnet Explorer](https://sepolia.etherscan.io/)
- [Sepolia Faucet](https://sepoliafaucet.com/)
- [Alchemy](https://www.alchemy.com) | [Infura](https://www.infura.io)
