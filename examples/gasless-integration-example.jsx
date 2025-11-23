/**
 * Example: Gasless Payments Integration for Zillopoly
 * 
 * This example demonstrates how to integrate gasless payments on Celo mainnet
 * using thirdweb's smart wallet features.
 * 
 * Installation:
 * npm install thirdweb
 */

import { createThirdwebClient } from "thirdweb";
import { celo } from "thirdweb/chains";
import { smartWallet, inAppWallet } from "thirdweb/wallets";
import { TokenPaymaster } from "thirdweb/wallets";
import { ThirdwebProvider } from "thirdweb/react";
import { ConnectButton, useActiveAccount, useActiveWallet } from "thirdweb/react";
import { getContract } from "thirdweb/contract";
import { sendTransaction, prepareContractCall } from "thirdweb";
import { parseEther } from "thirdweb/utils";

// ============================================
// Configuration
// ============================================

// Initialize thirdweb client
const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "YOUR_CLIENT_ID",
});

// Your deployed contract addresses (update these)
const ZILLOPOLY_CONTRACT_ADDRESS = "0x..."; // Your Zillopoly contract address
const HOBO_TOKEN_ADDRESS = "0x..."; // Your HOBO token address

// Smart Wallet Factory Address (get from thirdweb dashboard or deploy your own)
const SMART_WALLET_FACTORY_ADDRESS = "0x..."; // Your smart wallet factory address

// ============================================
// Wallet Configurations
// ============================================

// Option 1: Smart Wallet with TokenPaymaster (users pay gas with cUSD)
export const smartWalletWithTokenPaymaster = smartWallet({
  chain: celo,
  factoryAddress: SMART_WALLET_FACTORY_ADDRESS,
  overrides: {
    tokenPaymaster: TokenPaymaster.CELO_CUSD, // Pay gas with cUSD instead of CELO
  },
});

// Option 2: Fully Gasless Smart Wallet (you sponsor all gas)
export const gaslessSmartWallet = smartWallet({
  chain: celo,
  factoryAddress: SMART_WALLET_FACTORY_ADDRESS,
  sponsorGas: true, // Enable gas sponsorship
  // Note: You'll need to set up a paymaster contract or use thirdweb's infrastructure
});

// Option 3: In-App Wallet with EIP-7702 (sponsored transactions)
export const gaslessInAppWallet = inAppWallet({
  chain: celo,
  executionMode: {
    mode: "EIP7702",
    sponsorGas: true, // Enable gas sponsorship
  },
});

// ============================================
// Main App Component
// ============================================

export function App() {
  return (
    <ThirdwebProvider>
      <div className="container">
        <h1>Zillopoly - Gasless Payments Demo</h1>
        <ConnectButton
          client={client}
          wallets={[gaslessSmartWallet]} // Choose your wallet configuration
          chain={celo}
        />
        <GameInterface />
      </div>
    </ThirdwebProvider>
  );
}

// ============================================
// Game Interface Component
// ============================================

function GameInterface() {
  const account = useActiveAccount();
  const wallet = useActiveWallet();

  // Get Zillopoly contract instance
  const zillopolyContract = getContract({
    client,
    chain: celo,
    address: ZILLOPOLY_CONTRACT_ADDRESS,
  });

  // Get HOBO token contract instance
  const hoboContract = getContract({
    client,
    chain: celo,
    address: HOBO_TOKEN_ADDRESS,
  });

  // Play game function
  const playGame = async (betAmount, threshold, guess) => {
    if (!account) {
      alert("Please connect your wallet first");
      return;
    }

    try {
      // Step 1: Approve HOBO tokens (if needed)
      // Note: For smart wallets, this might be batched with the play transaction
      const approveTx = prepareContractCall({
        contract: hoboContract,
        method: "approve",
        params: [ZILLOPOLY_CONTRACT_ADDRESS, parseEther(betAmount.toString())],
      });

      // Step 2: Play the game
      const playTx = prepareContractCall({
        contract: zillopolyContract,
        method: "play",
        params: [
          parseEther(betAmount.toString()), // betAmount
          threshold, // threshold (1-99)
          guess, // 0 for UNDER, 1 for OVER
        ],
      });

      // Send transaction (gas will be sponsored or paid with cUSD)
      const result = await sendTransaction({
        account,
        transaction: playTx,
      });

      console.log("Transaction sent:", result);
      alert("Game played! Transaction hash: " + result.transactionHash);
    } catch (error) {
      console.error("Error playing game:", error);
      alert("Error: " + error.message);
    }
  };

  // Get player history
  const getPlayerHistory = async () => {
    if (!account) return;

    try {
      const history = await zillopolyContract.call("getPlayerHistory", [
        account.address,
      ]);
      console.log("Player history:", history);
      return history;
    } catch (error) {
      console.error("Error fetching history:", error);
    }
  };

  if (!account) {
    return (
      <div>
        <p>Please connect your wallet to play</p>
      </div>
    );
  }

  return (
    <div className="game-interface">
      <h2>Play Zillopoly</h2>
      <p>Connected: {account.address}</p>
      <p>
        <strong>Gasless Mode Active!</strong> Transactions will be sponsored or
        paid with cUSD.
      </p>

      <div className="game-controls">
        <div>
          <label>Bet Amount (HOBO):</label>
          <input type="number" id="betAmount" defaultValue="10" min="1" max="100" />
        </div>

        <div>
          <label>Threshold (1-99):</label>
          <input type="number" id="threshold" defaultValue="50" min="1" max="99" />
        </div>

        <div>
          <label>Guess:</label>
          <select id="guess">
            <option value="0">UNDER</option>
            <option value="1">OVER</option>
          </select>
        </div>

        <button
          onClick={() => {
            const betAmount = document.getElementById("betAmount").value;
            const threshold = parseInt(document.getElementById("threshold").value);
            const guess = parseInt(document.getElementById("guess").value);
            playGame(betAmount, threshold, guess);
          }}
        >
          Play Game (Gasless!)
        </button>

        <button onClick={getPlayerHistory}>View My History</button>
      </div>
    </div>
  );
}

// ============================================
// Alternative: Using EIP-5792 for Batched Transactions
// ============================================

import { useSendAndConfirmCalls } from "thirdweb/react";
import { encodeFunctionData } from "thirdweb/utils";

function GameInterfaceWithBatching() {
  const account = useActiveAccount();
  const { mutate: sendCalls, isPending } = useSendAndConfirmCalls();

  const playGameBatched = async (betAmount, threshold, guess) => {
    if (!account) return;

    // Prepare both transactions
    const approveData = encodeFunctionData({
      abi: hoboContractABI, // Your HOBO token ABI
      functionName: "approve",
      args: [ZILLOPOLY_CONTRACT_ADDRESS, parseEther(betAmount.toString())],
    });

    const playData = encodeFunctionData({
      abi: zillopolyContractABI, // Your Zillopoly contract ABI
      functionName: "play",
      args: [
        parseEther(betAmount.toString()),
        threshold,
        guess,
      ],
    });

    // Send batched calls (will be sponsored automatically if supported)
    sendCalls(
      {
        calls: [
          {
            to: HOBO_TOKEN_ADDRESS,
            data: approveData,
          },
          {
            to: ZILLOPOLY_CONTRACT_ADDRESS,
            data: playData,
          },
        ],
      },
      {
        onSuccess: (result) => {
          console.log("Batched transaction successful:", result);
          alert("Game played! Transaction hash: " + result.transactionHash);
        },
        onError: (error) => {
          console.error("Error:", error);
          alert("Error: " + error.message);
        },
      }
    );
  };

  return (
    <div>
      <button
        onClick={() => playGameBatched(10, 50, 1)}
        disabled={isPending}
      >
        {isPending ? "Processing..." : "Play Game (Batched & Gasless!)"}
      </button>
    </div>
  );
}

// ============================================
// Usage Instructions
// ============================================

/*
 * To use this example:
 * 
 * 1. Install dependencies:
 *    npm install thirdweb
 * 
 * 2. Set up environment variables:
 *    NEXT_PUBLIC_THIRDWEB_CLIENT_ID=your_client_id
 * 
 * 3. Update contract addresses:
 *    - ZILLOPOLY_CONTRACT_ADDRESS
 *    - HOBO_TOKEN_ADDRESS
 *    - SMART_WALLET_FACTORY_ADDRESS
 * 
 * 4. Choose your wallet configuration:
 *    - smartWalletWithTokenPaymaster: Users pay gas with cUSD
 *    - gaslessSmartWallet: Fully sponsored (requires paymaster setup)
 *    - gaslessInAppWallet: EIP-7702 sponsored transactions
 * 
 * 5. Import and use in your app:
 *    import { App } from './gasless-integration-example';
 * 
 * 6. For production:
 *    - Set up a paymaster contract for fully gasless transactions
 *    - Fund the paymaster with CELO
 *    - Monitor gas usage and costs
 */

