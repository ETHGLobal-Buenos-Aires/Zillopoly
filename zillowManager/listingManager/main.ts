import { cre, Runner, type Runtime } from "@chainlink/cre-sdk";
import { decodeEventLog, type Hex } from "viem";

// Zillopoly contract ABI for GamePlayed event
const ZILLOPOLY_ABI = [
  {
    type: "event",
    name: "GamePlayed",
    inputs: [
      { name: "player", type: "address", indexed: true },
      { name: "betAmount", type: "uint256", indexed: false },
      { name: "threshold", type: "uint256", indexed: false },
      { name: "guess", type: "uint8", indexed: false },
      { name: "rolledNumber", type: "uint256", indexed: false },
      { name: "won", type: "bool", indexed: false },
      { name: "payout", type: "uint256", indexed: false }
    ]
  }
] as const;

type Config = {
  zillopolyAddress: string;
  chainName: string;
};

type GamePlayedEvent = {
  player: string;
  betAmount: bigint;
  threshold: bigint;
  guess: number;
  rolledNumber: bigint;
  won: boolean;
  payout: bigint;
};

// Handler for GamePlayed events
const onGamePlayed = (runtime: Runtime<Config>, payload: cre.capabilities.EVMLogPayload): string => {
  runtime.log("=== Game Played Event Detected ===");

  try {
    // Decode the event log
    const decodedLog = decodeEventLog({
      abi: ZILLOPOLY_ABI,
      data: payload.data as Hex,
      topics: payload.topics as [Hex, ...Hex[]],
    });

    const eventData = decodedLog.args as GamePlayedEvent;

    runtime.log(`Player: ${eventData.player}`);
    runtime.log(`Bet Amount: ${eventData.betAmount.toString()} HOBO`);
    runtime.log(`Threshold: ${eventData.threshold.toString()}`);
    runtime.log(`Guess: ${eventData.guess === 0 ? 'UNDER' : 'OVER'}`);
    runtime.log(`Rolled Number: ${eventData.rolledNumber.toString()}`);
    runtime.log(`Won: ${eventData.won}`);
    runtime.log(`Payout: ${eventData.payout.toString()} HOBO`);
    runtime.log(`Block Number: ${payload.blockNumber}`);
    runtime.log(`Transaction Hash: ${payload.transactionHash}`);

    // Return a summary for the workflow
    const result = {
      event: "GamePlayed",
      player: eventData.player,
      won: eventData.won,
      betAmount: eventData.betAmount.toString(),
      payout: eventData.payout.toString(),
      rolledNumber: eventData.rolledNumber.toString(),
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(result, null, 2);
  } catch (error) {
    runtime.log(`Error decoding event: ${error}`);
    return JSON.stringify({ error: String(error) });
  }
};

// Optional: Cron trigger for periodic checks (keeping the original functionality)
const onCronTrigger = (runtime: Runtime<Config>): string => {
  runtime.log("Periodic workflow check triggered");
  return "Workflow is active and monitoring GamePlayed events";
};

const initWorkflow = (config: Config) => {
  const cron = new cre.capabilities.CronCapability();
  const evm = new cre.capabilities.EVMCapability();

  return [
    // EVM Log Trigger for GamePlayed events
    cre.handler(
      evm.logTrigger({
        chainName: config.chainName,
        addresses: [config.zillopolyAddress],
        topics: {
          0: ["0x" + "GamePlayed(address,uint256,uint256,uint8,uint256,bool,uint256)"],
        }
      }),
      onGamePlayed
    ),

    // Optional: Keep cron trigger for health checks
    cre.handler(
      cron.trigger({ schedule: "0 */6 * * *" }), // Every 6 hours
      onCronTrigger
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main();
