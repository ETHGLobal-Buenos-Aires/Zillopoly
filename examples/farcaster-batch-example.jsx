/**
 * Farcaster Mini App - Batch Transactions Example
 * 
 * This example shows how to batch multiple transactions in a Farcaster Mini App
 * so users only need to sign once for multiple operations.
 * 
 * Installation:
 * npm install @farcaster/miniapp-sdk viem
 */

import { sdk } from '@farcaster/miniapp-sdk';
import { useState, useEffect } from 'react';
import { encodeFunctionData, parseEther } from 'viem';

// ============================================
// Contract ABIs (simplified - use full ABIs in production)
// ============================================

const HOBO_TOKEN_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

const ZILLOPOLY_ABI = [
  {
    inputs: [
      { name: 'betAmount', type: 'uint256' },
      { name: 'threshold', type: 'uint256' },
      { name: 'guess', type: 'uint8' },
    ],
    name: 'play',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

// ============================================
// Configuration
// ============================================

const HOBO_TOKEN_ADDRESS = '0x...'; // Your HOBO token address
const ZILLOPOLY_ADDRESS = '0x...'; // Your Zillopoly contract address

// ============================================
// Utility Functions
// ============================================

/**
 * Check if the connected wallet supports batch transactions (EIP-5792)
 */
async function checkBatchSupport() {
  try {
    const capabilities = await sdk.actions.request({
      method: 'wallet_getCapabilities',
      params: [],
    });
    return capabilities?.wallet_sendCalls !== undefined;
  } catch (error) {
    console.error('Error checking capabilities:', error);
    return false;
  }
}

/**
 * Get the current chain ID from the wallet
 */
async function getChainId() {
  try {
    const chainId = await sdk.actions.request({
      method: 'eth_chainId',
      params: [],
    });
    return chainId;
  } catch (error) {
    console.error('Error getting chain ID:', error);
    throw error;
  }
}

/**
 * Wait for transaction receipt
 */
async function waitForTransactionReceipt(txHash) {
  // Poll for receipt
  let receipt = null;
  let attempts = 0;
  const maxAttempts = 30;

  while (!receipt && attempts < maxAttempts) {
    try {
      receipt = await sdk.actions.request({
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      });
      if (receipt) break;
    } catch (error) {
      console.error('Error getting receipt:', error);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
    attempts++;
  }

  return receipt;
}

// ============================================
// Batch Transaction Functions
// ============================================

/**
 * Play game with batched approve + play transactions
 * User signs once for both operations
 */
async function playGameBatched(betAmount, threshold, guess) {
  try {
    // Get chain ID
    const chainId = await getChainId();

    // Prepare the batch: approve + play
    const calls = [
      {
        to: HOBO_TOKEN_ADDRESS,
        data: encodeFunctionData({
          abi: HOBO_TOKEN_ABI,
          functionName: 'approve',
          args: [ZILLOPOLY_ADDRESS, parseEther(betAmount.toString())],
        }),
        value: '0x0',
      },
      {
        to: ZILLOPOLY_ADDRESS,
        data: encodeFunctionData({
          abi: ZILLOPOLY_ABI,
          functionName: 'play',
          args: [
            parseEther(betAmount.toString()),
            threshold,
            guess, // 0 = UNDER, 1 = OVER
          ],
        }),
        value: '0x0',
      },
    ];

    // Send batched transaction - user signs once
    const result = await sdk.actions.request({
      method: 'wallet_sendCalls',
      params: [
        {
          version: '1.0',
          chainId: chainId,
          calls: calls,
        },
      ],
    });

    console.log('Batch transaction sent:', result);

    // Wait for receipt
    if (result.batchHash) {
      const receipt = await waitForTransactionReceipt(result.batchHash);
      return { result, receipt };
    }

    return { result };
  } catch (error) {
    console.error('Error in batch transaction:', error);
    throw error;
  }
}

/**
 * Fallback: Send transactions sequentially if batching not supported
 */
async function playGameSequential(betAmount, threshold, guess) {
  try {
    // First: Approve
    const approveTx = await sdk.actions.request({
      method: 'eth_sendTransaction',
      params: [
        {
          to: HOBO_TOKEN_ADDRESS,
          data: encodeFunctionData({
            abi: HOBO_TOKEN_ABI,
            functionName: 'approve',
            args: [ZILLOPOLY_ADDRESS, parseEther(betAmount.toString())],
          }),
        },
      ],
    });

    // Wait for approval
    await waitForTransactionReceipt(approveTx);

    // Second: Play
    const playTx = await sdk.actions.request({
      method: 'eth_sendTransaction',
      params: [
        {
          to: ZILLOPOLY_ADDRESS,
          data: encodeFunctionData({
            abi: ZILLOPOLY_ABI,
            functionName: 'play',
            args: [
              parseEther(betAmount.toString()),
              threshold,
              guess,
            ],
          }),
        },
      ],
    });

    return { approveTx, playTx };
  } catch (error) {
    console.error('Error in sequential transactions:', error);
    throw error;
  }
}

/**
 * Smart function that tries batch first, falls back to sequential
 */
async function playGame(betAmount, threshold, guess) {
  const supportsBatch = await checkBatchSupport();

  if (supportsBatch) {
    console.log('Using batch transactions');
    return await playGameBatched(betAmount, threshold, guess);
  } else {
    console.log('Batch not supported, using sequential transactions');
    return await playGameSequential(betAmount, threshold, guess);
  }
}

// ============================================
// React Component
// ============================================

export function ZillopolyGameComponent() {
  const [supportsBatch, setSupportsBatch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [betAmount, setBetAmount] = useState('10');
  const [threshold, setThreshold] = useState('50');
  const [guess, setGuess] = useState('1'); // 0 = UNDER, 1 = OVER

  useEffect(() => {
    checkAndSetBatchSupport();
  }, []);

  const checkAndSetBatchSupport = async () => {
    const supported = await checkBatchSupport();
    setSupportsBatch(supported);
    setStatus(supported ? 'Batch transactions supported ✓' : 'Batch not supported - will use sequential');
  };

  const handlePlayGame = async () => {
    setLoading(true);
    setStatus('Preparing transaction...');

    try {
      setStatus('Sending transaction (you\'ll sign once for both approve + play)...');
      
      const result = await playGame(
        betAmount,
        parseInt(threshold),
        parseInt(guess)
      );

      setStatus(`Success! Transaction hash: ${result.result?.batchHash || result.approveTx || 'N/A'}`);
      
      // Show success message
      alert('Game played successfully! Check the status above for transaction details.');
    } catch (error) {
      console.error('Error playing game:', error);
      setStatus(`Error: ${error.message || 'Transaction failed'}`);
      alert('Error: ' + (error.message || 'Transaction failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui' }}>
      <h1>Zillopoly Game</h1>
      
      <div style={{ marginBottom: '20px', padding: '10px', background: '#f0f0f0', borderRadius: '8px' }}>
        <p><strong>Batch Support:</strong> {supportsBatch ? '✓ Yes' : '✗ No'}</p>
        <p><strong>Status:</strong> {status || 'Ready'}</p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>
          Bet Amount (HOBO):
        </label>
        <input
          type="number"
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
          min="1"
          max="100"
          style={{ padding: '8px', width: '100%', maxWidth: '200px' }}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>
          Threshold (1-99):
        </label>
        <input
          type="number"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          min="1"
          max="99"
          style={{ padding: '8px', width: '100%', maxWidth: '200px' }}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>
          Guess:
        </label>
        <select
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          style={{ padding: '8px', width: '100%', maxWidth: '200px' }}
        >
          <option value="0">UNDER</option>
          <option value="1">OVER</option>
        </select>
      </div>

      <button
        onClick={handlePlayGame}
        disabled={loading}
        style={{
          padding: '12px 24px',
          fontSize: '16px',
          backgroundColor: loading ? '#ccc' : '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Processing...' : supportsBatch ? 'Play Game (Batched - One Sign!)' : 'Play Game'}
      </button>

      {supportsBatch && (
        <p style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
          ✓ With batch support, you'll only need to sign once for both approve and play operations!
        </p>
      )}
    </div>
  );
}

// ============================================
// Advanced: Multiple Operations Batch
// ============================================

/**
 * Example: Batch multiple game plays or other operations
 */
async function batchMultipleOperations(operations) {
  const chainId = await getChainId();

  const calls = operations.map((op) => ({
    to: op.contractAddress,
    data: encodeFunctionData({
      abi: op.abi,
      functionName: op.functionName,
      args: op.args,
    }),
    value: op.value || '0x0',
  }));

  const result = await sdk.actions.request({
    method: 'wallet_sendCalls',
    params: [
      {
        version: '1.0',
        chainId: chainId,
        calls: calls,
      },
    ],
  });

  return result;
}

// Example usage:
// await batchMultipleOperations([
//   {
//     contractAddress: HOBO_TOKEN_ADDRESS,
//     abi: HOBO_TOKEN_ABI,
//     functionName: 'approve',
//     args: [ZILLOPOLY_ADDRESS, parseEther('10')],
//   },
//   {
//     contractAddress: ZILLOPOLY_ADDRESS,
//     abi: ZILLOPOLY_ABI,
//     functionName: 'play',
//     args: [parseEther('10'), 50, 1],
//   },
//   // Add more operations...
// ]);

// ============================================
// Usage in Your Mini App
// ============================================

/*
 * 1. Import this component in your Mini App
 * 2. Make sure to call sdk.actions.ready() when your app is ready
 * 3. Update the contract addresses
 * 4. Include full ABIs (not just the snippets above)
 * 
 * Example app setup:
 * 
 * import { sdk } from '@farcaster/miniapp-sdk';
 * import { ZillopolyGameComponent } from './farcaster-batch-example';
 * 
 * function App() {
 *   useEffect(() => {
 *     // Tell Farcaster the app is ready
 *     sdk.actions.ready();
 *   }, []);
 * 
 *   return <ZillopolyGameComponent />;
 * }
 */

