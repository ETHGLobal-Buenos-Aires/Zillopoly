import { cre, Runner, type Runtime } from "@chainlink/cre-sdk";
import { decodeEventLog, encodeFunctionData, type Hex, keccak256, toHex } from "viem";

// Zillopoly contract ABI
const ZILLOPOLY_ABI = [
  {
    type: "event",
    name: "BatchGamesCreated",
    inputs: [
      { name: "player", type: "address", indexed: true },
      { name: "startGameId", type: "uint256", indexed: false },
      { name: "endGameId", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false }
    ]
  },
  {
    type: "function",
    name: "initializeGame",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "listingId", type: "bytes32" },
      { name: "displayedPrice", type: "uint256" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  }
] as const;

type Config = {
  zillopolyAddress: string;
  chainName: string;
  apiUrl: string; // URL to the Zillopoly API
};

type BatchGamesCreatedEvent = {
  player: string;
  startGameId: bigint;
  endGameId: bigint;
  timestamp: bigint;
};

type ListingResponse = {
  success: boolean;
  city: string;
  listing: {
    zpid: number;
    address: string;
    price: number;
    imgSrc: string;
    bedrooms: number;
    bathrooms: number;
    livingArea: number;
    homeType: string;
  };
  contractData: {
    listingId: string;
    displayedPrice: number;
  };
};

// Handler for BatchGamesCreated events
const onBatchGamesCreated = async (
  runtime: Runtime<Config>,
  payload: cre.capabilities.EVMLogPayload
): Promise<string> => {
  runtime.log("=== Batch Games Created Event Detected ===");

  try {
    // Decode the event log
    const decodedLog = decodeEventLog({
      abi: ZILLOPOLY_ABI,
      data: payload.data as Hex,
      topics: payload.topics as [Hex, ...Hex[]],
    });

    const eventData = decodedLog.args as BatchGamesCreatedEvent;

    runtime.log(`Player: ${eventData.player}`);
    runtime.log(`Start Game ID: ${eventData.startGameId.toString()}`);
    runtime.log(`End Game ID: ${eventData.endGameId.toString()}`);
    runtime.log(`Timestamp: ${eventData.timestamp.toString()}`);
    runtime.log(`Block Number: ${payload.blockNumber}`);
    runtime.log(`Transaction Hash: ${payload.transactionHash}`);

    const numGames = Number(eventData.endGameId - eventData.startGameId + 1n);
    runtime.log(`Fetching ${numGames} listings from API...`);

    // Initialize HTTP and EVM capabilities
    const http = new cre.capabilities.HTTPCapability();
    const evm = new cre.capabilities.EVMCapability();

    const results = [];

    // Fetch listings and initialize games
    for (let i = 0; i < numGames; i++) {
      const currentGameId = eventData.startGameId + BigInt(i);

      runtime.log(`Fetching listing ${i + 1}/${numGames} for game ID ${currentGameId}...`);

      // Fetch random listing from API
      const response = await http.fetch({
        url: `${runtime.config.apiUrl}/api/random-listing`,
        method: "GET",
        headers: {},
      });

      if (!response.ok || response.statusCode !== 200) {
        runtime.log(`Failed to fetch listing ${i + 1}: ${response.statusCode}`);
        results.push({ gameId: currentGameId.toString(), status: "failed", error: "API request failed" });
        continue;
      }

      const listingData: ListingResponse = JSON.parse(response.body);

      if (!listingData.success) {
        runtime.log(`Failed to get listing ${i + 1}: ${listingData}`);
        results.push({ gameId: currentGameId.toString(), status: "failed", error: "No listing data" });
        continue;
      }

      runtime.log(`Got listing from ${listingData.city}: $${listingData.contractData.displayedPrice}`);

      // Encode the initializeGame function call
      const calldata = encodeFunctionData({
        abi: ZILLOPOLY_ABI,
        functionName: "initializeGame",
        args: [
          currentGameId,
          listingData.contractData.listingId as Hex,
          BigInt(listingData.contractData.displayedPrice),
        ],
      });

      runtime.log(`Initializing game ${currentGameId} with listing ${listingData.listing.zpid}...`);

      // Send transaction to initialize the game
      const txResponse = await evm.write({
        chainName: runtime.config.chainName,
        to: runtime.config.zillopolyAddress,
        data: calldata,
      });

      runtime.log(`Game ${currentGameId} initialized. Tx: ${txResponse.transactionHash}`);

      results.push({
        gameId: currentGameId.toString(),
        status: "success",
        listingId: listingData.listing.zpid,
        city: listingData.city,
        displayedPrice: listingData.contractData.displayedPrice,
        txHash: txResponse.transactionHash,
      });
    }

    const summary = {
      event: "BatchGamesCreated",
      player: eventData.player,
      startGameId: eventData.startGameId.toString(),
      endGameId: eventData.endGameId.toString(),
      totalGames: numGames,
      results,
      timestamp: new Date().toISOString(),
    };

    return JSON.stringify(summary, null, 2);
  } catch (error) {
    runtime.log(`Error processing batch games: ${error}`);
    return JSON.stringify({ error: String(error) });
  }
};

const initWorkflow = (config: Config) => {
  const evm = new cre.capabilities.EVMCapability();

  return [
    // EVM Log Trigger for BatchGamesCreated events
    cre.handler(
      evm.logTrigger({
        chainName: config.chainName,
        addresses: [config.zillopolyAddress],
        topics: {
          0: [keccak256(toHex("BatchGamesCreated(address,uint256,uint256,uint256)"))],
        }
      }),
      onBatchGamesCreated
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main();
