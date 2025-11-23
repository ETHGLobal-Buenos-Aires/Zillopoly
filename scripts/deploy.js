import hre from "hardhat";

async function main() {
  console.log("Deploying Zillopoly contracts...");
  console.log("Network:", hre.network.name);

  // Get the deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Check deployer balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "CELO");

  // Deploy HOBO token - Max supply: 100M, Initial mint: 1M to deployer
  const initialSupply = hre.ethers.parseEther("1000000"); // 1 million tokens
  const maxSupply = hre.ethers.parseEther("100000000"); // 100 million tokens max
  console.log("\nDeploying HOBO Token...");
  console.log("Max Supply:", hre.ethers.formatEther(maxSupply), "HOBO");
  console.log("Initial Mint:", hre.ethers.formatEther(initialSupply), "HOBO");
  const Hobo = await hre.ethers.getContractFactory("Hobo");
  const hobo = await Hobo.deploy(initialSupply);
  await hobo.waitForDeployment();
  const hoboAddress = await hobo.getAddress();
  console.log("HOBO Token deployed to:", hoboAddress);

  // Deploy Zillopoly
  console.log("\nDeploying Zillopoly...");
  const Zillopoly = await hre.ethers.getContractFactory("Zillopoly");
  const zillopoly = await Zillopoly.deploy(hoboAddress);
  await zillopoly.waitForDeployment();
  const zillopolyAddress = await zillopoly.getAddress();
  console.log("Zillopoly deployed to:", zillopolyAddress);

  // Transfer some HOBO to contract for payouts (10% of initial supply)
  const contractFunding = hre.ethers.parseEther("100000"); // 100k HOBO for payouts
  console.log("\nFunding contract with", hre.ethers.formatEther(contractFunding), "HOBO for payouts...");

  const transferTx = await hobo.transfer(zillopolyAddress, contractFunding);
  await transferTx.wait();
  console.log("Contract funded successfully");

  console.log("\n=== Deployment Summary ===");
  console.log("Network:", hre.network.name);
  console.log("Chain ID:", (await hre.ethers.provider.getNetwork()).chainId);
  console.log("HOBO Token:", hoboAddress);
  console.log("  Max Supply:", hre.ethers.formatEther(await hobo.MAX_SUPPLY()), "HOBO");
  console.log("  Total Supply:", hre.ethers.formatEther(await hobo.totalSupply()), "HOBO");
  console.log("Zillopoly:", zillopolyAddress);
  console.log("Contract Balance:", hre.ethers.formatEther(await hobo.balanceOf(zillopolyAddress)), "HOBO");
  console.log("Deployer Balance:", hre.ethers.formatEther(await hobo.balanceOf(deployer.address)), "HOBO");

  // Verification info
  if (hre.network.name === "celo" || hre.network.name === "celoAlfajores") {
    console.log("\n=== Verification Commands ===");
    console.log("To verify on Celo Explorer, run:");
    console.log(`npx hardhat verify --network ${hre.network.name} ${hoboAddress} "${initialSupply}"`);
    console.log(`npx hardhat verify --network ${hre.network.name} ${zillopolyAddress} "${hoboAddress}"`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
