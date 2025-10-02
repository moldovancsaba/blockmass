import hre from "hardhat";

/**
 * Deploy BlockmassAnchor contract to Sepolia testnet
 * Usage: npx hardhat run scripts/deploy.js --network sepolia
 */
async function main() {
  console.log("Deploying BlockmassAnchor to Sepolia...\n");

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH\n");

  // Deploy contract
  const BlockmassAnchor = await hre.ethers.getContractFactory("BlockmassAnchor");
  const contract = await BlockmassAnchor.deploy();

  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("✅ BlockmassAnchor deployed to:", address);
  console.log("\nNext steps:");
  console.log("1. Add to frontend/.env.local:");
  console.log(`   ANCHOR_CONTRACT_ADDRESS=${address}`);
  console.log(`   ANCHOR_CHAIN_ID=11155111`);
  console.log("\n2. Verify on Etherscan:");
  console.log(`   npx hardhat verify --network sepolia ${address}`);
  console.log("\n3. View on Sepolia Etherscan:");
  console.log(`   https://sepolia.etherscan.io/address/${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
