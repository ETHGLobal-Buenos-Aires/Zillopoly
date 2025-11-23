import hre from "hardhat";

async function main() {
  console.log("=== Player Starting Game ===\n");

  const HOBO_ADDRESS = process.env.HOBO_TOKEN;
  const ZILLOPOLY_ADDRESS = "0xaB6F3d4c4bd68c8969052312050aD7302c4bbbDa";
  const PLAYER_PRIVATE_KEY = process.env.PLAYER_KEY;

  if (!PLAYER_PRIVATE_KEY) {
    throw new Error("PLAYER_KEY not found in .env");
  }

  // Create player signer (remove 0x prefix if present)
  const playerKey = PLAYER_PRIVATE_KEY.startsWith('0x') ? PLAYER_PRIVATE_KEY.slice(2) : PLAYER_PRIVATE_KEY;
  const player = new hre.ethers.Wallet(playerKey, hre.ethers.provider);
  console.log("Player Address:", player.address);

  // Get contract instances
  const hobo = await hre.ethers.getContractAt("Hobo", HOBO_ADDRESS, player);
  const zillopoly = await hre.ethers.getContractAt("Zillopoly", ZILLOPOLY_ADDRESS, player);

  // Check player balances
  const hoboBalance = await hobo.balanceOf(player.address);
  const celoBalance = await hre.ethers.provider.getBalance(player.address);
  console.log("HOBO Balance:", hre.ethers.formatEther(hoboBalance), "HOBO");
  console.log("CELO Balance:", hre.ethers.formatEther(celoBalance), "CELO");

  // Step 1: Approve Zillopoly to spend HOBO (max approval for one-time setup)
  console.log("\n=== Step 1: Approve Zillopoly to spend HOBO ===");
  const currentAllowance = await hobo.allowance(player.address, ZILLOPOLY_ADDRESS);

  if (currentAllowance < hre.ethers.parseEther("10000")) {
    console.log("Approving max HOBO for Zillopoly...");
    const approveTx = await hobo.approve(ZILLOPOLY_ADDRESS, hre.ethers.MaxUint256);
    console.log("Approval tx sent:", approveTx.hash);
    await approveTx.wait();
    console.log("✓ Approved");
  } else {
    console.log("✓ Already approved");
  }

  // Step 2: Start game (deposit 10,000 HOBO for 10 games)
  console.log("\n=== Step 2: Start Game (10,000 HOBO) ===");
  console.log("Calling startGame()...");
  const startTx = await zillopoly.startGame();
  console.log("Transaction sent:", startTx.hash);
  console.log("Waiting for confirmation...");

  const receipt = await startTx.wait();
  console.log("✓ Transaction confirmed");

  // Find BatchGamesCreated event
  const event = receipt.logs.find(log => {
    try {
      const parsed = zillopoly.interface.parseLog(log);
      return parsed.name === "BatchGamesCreated";
    } catch {
      return false;
    }
  });

  if (event) {
    const parsed = zillopoly.interface.parseLog(event);
    const startGameId = parsed.args.startGameId;
    const endGameId = parsed.args.endGameId;

    console.log("\n=== ✓ Batch Games Created! ===");
    console.log("Player:", parsed.args.player);
    console.log("Start Game ID:", startGameId.toString());
    console.log("End Game ID:", endGameId.toString());
    console.log("Total Games:", (endGameId - startGameId + 1n).toString());
    console.log("Timestamp:", new Date(Number(parsed.args.timestamp) * 1000).toISOString());

    // Step 3: Check game states
    console.log("\n=== Step 3: Checking Game States ===");
    for (let i = startGameId; i <= endGameId; i++) {
      const game = await zillopoly.getGame(i);
      console.log(`Game ${i}:`);
      console.log(`  Stage: ${["NotStarted", "Initialized", "GuessSubmitted", "Settled"][game.stage]}`);
      console.log(`  Player: ${game.player}`);
      console.log(`  Displayed Price: ${hre.ethers.formatEther(game.displayedPrice)} (should be 0 initially)`);
    }

    // Check final balance
    const hoboBalanceAfter = await hobo.balanceOf(player.address);
    console.log("\n=== Final Balance ===");
    console.log("HOBO Balance:", hre.ethers.formatEther(hoboBalanceAfter), "HOBO");
    console.log("Spent:", hre.ethers.formatEther(hoboBalance - hoboBalanceAfter), "HOBO");

    console.log("\n=== Next Steps ===");
    console.log("✓ 10 empty games created (IDs", startGameId.toString(), "to", endGameId.toString() + ")");
    console.log("→ CRE will now detect the BatchGamesCreated event");
    console.log("→ CRE will fetch 10 listings from the API");
    console.log("→ CRE will call initializeGame() for each game");
    console.log("→ Games will transition from NotStarted to Initialized");

    console.log("\nEvent details for CRE:");
    console.log("Transaction Hash:", receipt.hash);
    console.log("Block Number:", receipt.blockNumber);

  } else {
    console.log("❌ BatchGamesCreated event not found in transaction logs");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
