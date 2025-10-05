import { Alchemy, Network } from 'alchemy-sdk';
import { ethers } from 'ethers';

const ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY;
const ALCHEMY_RPC_URL = `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;

const settings = {
  maxRetries: 3, // Maximum number of retry attempts
  retryDelay: 1000, // Initial retry delay in ms
};

const alchemy = new Alchemy({
  apiKey: import.meta.env.VITE_ALCHEMY_API_KEY,
  network: Network.MATIC_MAINNET,
});

// Cache for storing successful responses
const responseCache = new Map<string, any>();

/**
 * Executes a request with exponential backoff retry logic
 */
async function withRetry<T>(
  request: () => Promise<T>,
  maxRetries: number = settings.maxRetries,
  delay: number = settings.retryDelay
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await request();
    } catch (error: any) {
      lastError = error;
      
      // If it's a rate limit error (429) or server error (5xx), wait and retry
      const status = error.statusCode || error.code;
      if (status === 429 || (status >= 500 && status < 600)) {
        const waitTime = delay * Math.pow(2, attempt);
        console.warn(`API rate limited. Retrying in ${waitTime}ms... (Attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      // For other errors, break and throw
      break;
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

/**
 * Low-level JSON-RPC call to Alchemy endpoint (fallback when SDK fails)
 */
async function rpcCall(method: string, params: any): Promise<any> {
  const res = await fetch(ALCHEMY_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'RPC error');
  return data.result;
}

/**
 * Gets asset transfers with caching and retry logic
 */
async function getAssetTransfersWithRetry(params: any) {
  const cacheKey = JSON.stringify(params);
  
  if (responseCache.has(cacheKey)) {
    return responseCache.get(cacheKey);
  }
  let response: any;
  try {
    response = await withRetry(() => 
      alchemy.core.getAssetTransfers({
        ...params,
        excludeZeroValue: true,
        withMetadata: true,
        category: ['external', 'internal', 'erc20', 'erc721', 'erc1155']
      })
    );
  } catch (sdkErr) {
    // Fallback to direct RPC
    const rpcParams = [{
      fromBlock: params.fromBlock ?? '0x0',
      toBlock: params.toBlock ?? 'latest',
      fromAddress: params.fromAddress,
      toAddress: params.toAddress,
      maxCount: params.maxCount ?? '0x1',
      order: params.order ?? 'desc',
      withMetadata: true,
      excludeZeroValue: true,
      category: ['external', 'internal', 'erc20', 'erc721', 'erc1155']
    }];
    const result = await rpcCall('alchemy_getAssetTransfers', rpcParams);
    response = result; // same shape: { transfers: [...] }
  }
  
  responseCache.set(cacheKey, response);
  return response;
}

// Staking contract address (using directly in function calls)

interface StakeInfo {
  amount: string;
  timestamp: Date;
  transactionHash: string;
}

/**
 * Parse stake amounts from transaction input data for supported methods:
 * - increaseStake(uint256 stakeTokenId, uint256 stakeAmountDelta) -> selector 0xbec10cde
 * - stake(uint256 amount) -> selector 0xa694fc3a
 */
function parseStakeAmount(data: string): { amount: string; method: 'increaseStake' | 'stake'; tokenId?: string } | null {
  try {
    const selector = data.slice(0, 10);
    if (selector === '0xbec10cde') {
      // increaseStake(stakeTokenId, stakeAmountDelta)
      const tokenIdHex = '0x' + data.slice(10, 74);
      const amountHex = '0x' + data.slice(74, 138);
      const tokenId = BigInt(tokenIdHex).toString();
      const amount = ethers.utils.formatEther(amountHex);
      return { amount, method: 'increaseStake', tokenId };
    }
    if (selector === '0xa694fc3a') {
      // stake(amount)
      const amountHex = '0x' + data.slice(10, 74);
      const amount = ethers.utils.formatEther(amountHex);
      return { amount, method: 'stake' };
    }
    return null;
  } catch (error) {
    console.error('Error parsing stake amount:', error);
    return null;
  }
};

interface AssetTransfer {
  value?: string;
  blockNum: string;
  hash: string;
  timestamp?: number;
}

export interface TransactionInfo {
  hash: string;
  timestamp: number;
  value: string;
  blockNumber: number;
}

export async function getLatestTransactionFromAddress(fromAddress: string, toAddress: string): Promise<TransactionInfo | null> {
  try {
    // First try to get transfers using Alchemy's getAssetTransfers
    const response = await getAssetTransfersWithRetry({
      fromBlock: '0x0',
      fromAddress: fromAddress.toLowerCase(),
      toAddress: toAddress.toLowerCase(),
      order: 'desc',
      maxCount: 1
    });

    const latestTransfer = response.transfers?.[0];
    if (!latestTransfer) return null;

    // Get the block to get the timestamp
    let block;
    try {
      block = await withRetry(() => 
        alchemy.core.getBlock(parseInt(latestTransfer.blockNum, 16))
      );
    } catch (sdkErr) {
      // Fallback to RPC
      const bnHex = '0x' + parseInt(latestTransfer.blockNum, 16).toString(16);
      block = await rpcCall('eth_getBlockByNumber', [bnHex, false]);
    }

    return {
      hash: latestTransfer.hash,
      timestamp: block.timestamp * 1000, // Convert to milliseconds
      value: latestTransfer.value || '0',
      blockNumber: parseInt(latestTransfer.blockNum, 16)
    };
  } catch (error) {
    console.error('Error in getLatestTransactionFromAddress:', error);
    return null;
  }
}

export const getLastStakingTransaction = async (walletAddress: string): Promise<StakeInfo | null> => {
  try {
    // Get all transfers to the staking contract with retry logic
    const transfers = await getAssetTransfersWithRetry({
      fromBlock: '0x0',
      toBlock: 'latest',
      fromAddress: walletAddress,
      toAddress: '0xbF9F6b1D910AA207DaA400931430ef110570F8FF',
    });

    // Find the most recent stake transaction
    const stakeTx = (transfers.transfers as AssetTransfer[])
      .filter(tx => tx.value && tx.value !== '0')
      .sort((a, b) => {
        const blockA = parseInt(a.blockNum, 16);
        const blockB = parseInt(b.blockNum, 16);
        return blockB - blockA;
      })[0];

    if (!stakeTx) return null;

    // Get the transaction details with retry logic
    let tx;
    try {
      tx = await withRetry(() => 
        alchemy.core.getTransaction(stakeTx.hash)
      );
    } catch (sdkErr) {
      // Fallback to RPC
      tx = await rpcCall('eth_getTransactionByHash', [stakeTx.hash]);
    }
    
    if (!tx || !tx.data) return null;
    
    // Support known selectors: increaseStake (0xbec10cde) and stake (0xa694fc3a)
    if (tx.data.startsWith('0xbec10cde') || tx.data.startsWith('0xa694fc3a')) {
      try {
        // Parse the staked amount from the input data
        const parsed = parseStakeAmount(tx.data);
        if (!parsed) return null;
        
        // Get the block with retry logic (convert hex to number)
        const blockNumber = parseInt(stakeTx.blockNum, 16);
        let block;
        try {
          block = await withRetry(() => 
            alchemy.core.getBlock(blockNumber)
          );
        } catch (sdkErr) {
          const bnHex = '0x' + blockNumber.toString(16);
          block = await rpcCall('eth_getBlockByNumber', [bnHex, false]);
        }
        
        if (!block) return null;
        
        return {
          amount: parsed.amount,
          timestamp: new Date(Number(block.timestamp) * 1000),
          transactionHash: stakeTx.hash
        };
      } catch (parseError) {
        console.error('Error parsing transaction data:', parseError);
        return null;
      }
    }

    return null;
  } catch (error) {
    console.error('Error in getLastStakingTransaction:', error);
    return null;
  }
};
