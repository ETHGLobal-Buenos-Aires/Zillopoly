import hre from "hardhat";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("CELO Balance:", hre.ethers.formatEther(balance), "CELO");

  const HOBO_ADDRESS = "0xCE555145d41e25d70de46D467c8d47224b27D24A";
  const hobo = await hre.ethers.getContractAt("Hobo", HOBO_ADDRESS);
  const hoboBalance = await hobo.balanceOf(deployer.address);
  console.log("HOBO Balance:", hre.ethers.formatEther(hoboBalance), "HOBO");
}

main().then(() => process.exit(0)).catch(console.error);
