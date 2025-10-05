import { ethers } from 'ethers';
import { rewardHistory } from './rewardHistory';

// IQ Protocol MYST Rental Pool contract address - verified on PolygonScan
const STAKING_CONTRACT_ADDRESS = '0xbf9f6b1d910aa207daa400931430ef110570f8ff';

// Enterprise/Stake ABI subset based on provided interface
const STAKING_ABI = [
  // Staking interactions
  'function stake(uint256 stakeAmount) external',
  'function increaseStake(uint256 stakeTokenId, uint256 stakeAmountDelta) external',
  'function decreaseStake(uint256 stakeTokenId, uint256 stakeAmountDelta) external',
  'function claimStakingReward(uint256 stakeTokenId) external',
  'function unstake(uint256 stakeTokenId) external',

  // Read functions relevant for dashboard
  'function getStake(uint256 stakeTokenId) view returns (uint256 amount, uint256 shares, uint256 block)',
  'function getStakingReward(uint256 stakeTokenId) view returns (uint256)',
  'function getReserve() view returns (uint256)',

  // Optional generics (some pools expose these; safe to keep if present)
  'function balanceOf(address account) view returns (uint256)',
  'function rewardRate() view returns (uint256)'
] as const;

// Initialize provider preferring Alchemy RPC (to avoid public endpoint rate limits), fallback to public
const ALCHEMY_API_KEY = (import.meta as any).env?.VITE_ALCHEMY_API_KEY;
const RPC_URL = ALCHEMY_API_KEY
  ? `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
  : 'https://polygon-rpc.com/';
const provider = new ethers.providers.JsonRpcProvider(
  RPC_URL,
  { name: 'matic', chainId: 137 }
);

// Interface for staking information
export interface RewardStats {
  sessionTotal: number;
  sessionDurationMinutes: number;
  sessionPerMinute: number;
  currentRate: {
    perMinute: number;
    perHour: number;
    perDay: number;
  };
  formatted: {
    sessionTotal: string;
    perMinute: string;
    perHour: string;
    perDay: string;
  };
}

export interface StakingInfo {
  stakedAmount: string;
  earnedRewards: string;
  totalStaked: string;
  rewardRate: string;
  lastUpdateTime?: number;
  tokenId?: string; // Optional token ID if applicable
  rewardStats?: RewardStats;
  stakedTokens?: Array<{
    tokenId: string;
    stakedAmount: string;
    rewardAmount: string;
  }>;
}

// Interface for staking contract interaction result
export interface StakingContractResult {
  success: boolean;
  data?: StakingInfo;
  error?: string;
}

// Interface for staked amounts (legacy support)
export interface StakedAmounts {
  stakedAmount: string;
  earnedRewards: string;
}

export interface StakeInfo {
  tokenId: string;
  stakedAmount: string;
  rewardAmount: string;
  lastTransaction?: {
    hash: string;
    timestamp: number;
    value: string;
  };
}

/**
 * Get a quick snapshot for a specific stake token ID
 * Returns raw BigNumber strings and formatted ether strings for verification.
 */
export async function getTokenStakingSnapshot(tokenId: string): Promise<{
  tokenId: string;
  rawStakeAmount: string;
  rawReward: string;
  formattedStake: string;
  formattedReward: string;
}> {
  const contract = new ethers.Contract(STAKING_CONTRACT_ADDRESS, STAKING_ABI, provider);
  const safeToBn = (v: any) => {
    if (v === undefined || v === null) return ethers.BigNumber.from(0);
    if (Array.isArray(v)) {
      const first = v[0];
      return ethers.BigNumber.from(first?.toString?.() ?? first ?? 0);
    }
    if (typeof v === 'object' && v?._hex) return ethers.BigNumber.from(v);
    return ethers.BigNumber.from(v.toString());
  };
  try {
    const stakeStruct = await contract.getStake(tokenId);
    const rewardBn = await contract.getStakingReward(tokenId);
    const stakeBn = safeToBn(stakeStruct);
    return {
      tokenId,
      rawStakeAmount: stakeBn.toString(),
      rawReward: rewardBn.toString(),
      formattedStake: ethers.utils.formatEther(stakeBn.toString()),
      formattedReward: ethers.utils.formatEther(rewardBn.toString()),
    };
  } catch (e) {
    console.warn('getTokenStakingSnapshot failed:', e);
    return {
      tokenId,
      rawStakeAmount: '0',
      rawReward: '0',
      formattedStake: '0',
      formattedReward: '0',
    };
  }
}

/**
 * Get staking information for a wallet address
 */
export const getStakingInfo = async (walletAddress: string): Promise<StakingContractResult> => {
  try {
    if (!ethers.utils.isAddress(walletAddress)) {
      throw new Error('Invalid wallet address');
    }

    const contract = new ethers.Contract(STAKING_CONTRACT_ADDRESS, STAKING_ABI, provider);

    // Safe call helper with retry logic and better error handling
    const safeCall = async (method: string, ...args: any[]): Promise<ethers.BigNumber> => {
      const maxRetries = 3;
      let lastError: Error | null = null;
      for (let i = 0; i < maxRetries; i++) {
        try {
          // @ts-ignore - Dynamic method access with error handling
          const result: any = await contract[method](...args);
          if (result === undefined || result === null) return ethers.BigNumber.from(0);
          if (Array.isArray(result)) {
            const first = result[0];
            return ethers.BigNumber.from(first?.toString?.() ?? first ?? 0);
          }
          if (typeof result === 'object' && result?._hex) return ethers.BigNumber.from(result);
          return ethers.BigNumber.from(result.toString());
        } catch (error: any) {
          lastError = error;
          if (error.code === 'INVALID_ARGUMENT' || error.code === 'UNSUPPORTED_OPERATION') break;
          if (i < maxRetries - 1) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
      }
      if (lastError) console.warn(`safeCall ${method} failed:`, lastError.message || lastError);
      return ethers.BigNumber.from(0);
    };

    const walletStaked = await safeCall('balanceOf', walletAddress);
    let networkTotalStaked = ethers.BigNumber.from(0);
    try { networkTotalStaked = await safeCall('getReserve'); } catch {}
    let rewardRateBn = ethers.BigNumber.from(0);
    try {
      const r = await contract.rewardRate();
      if (r) rewardRateBn = r;
    } catch {}

    const formatEther = (v: ethers.BigNumber) => ethers.utils.formatEther(v.toString());
    const result: StakingInfo = {
      stakedAmount: formatEther(walletStaked),
      earnedRewards: '0',
      totalStaked: formatEther(networkTotalStaked),
      rewardRate: formatEther(rewardRateBn),
      lastUpdateTime: Date.now(),
      rewardStats: rewardHistory.getStats()
    };
    return { success: true, data: result };
  } catch (error: any) {
    console.error('Error in getStakingInfo:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch staking info',
      data: {
        stakedAmount: '0',
        earnedRewards: '0',
        totalStaked: '0',
        rewardRate: '0',
        rewardStats: {
          sessionTotal: 0,
          sessionDurationMinutes: 0,
          sessionPerMinute: 0,
          currentRate: { perMinute: 0, perHour: 0, perDay: 0 },
          formatted: { sessionTotal: '0', perMinute: '0', perHour: '0', perDay: '0' }
        }
      }
    };
  }
};

/**
 * Get total staking information for a wallet address with token details
 */
export const getTotalStakingInfo = async (
  walletAddress: string, 
  tokenIds: string[] = []
): Promise<StakingContractResult> => {
  try {
    if (!ethers.utils.isAddress(walletAddress)) {
      throw new Error('Invalid wallet address');
    }

    const contract = new ethers.Contract(STAKING_CONTRACT_ADDRESS, STAKING_ABI, provider);
    
    // Check if contract exists by trying a simple read first (use getReserve which is in the provided ABI)
    let contractExists = false;
    try {
      await contract.getReserve();
      contractExists = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('Staking contract not accessible via getReserve check:', msg);
      contractExists = false;
    }
    
    // If contract doesn't exist, return default values
    if (!contractExists) {
      console.log('Staking contract not accessible, returning default values');
      return {
        success: true,
        data: {
          stakedAmount: '0',
          earnedRewards: '0',
          totalStaked: '0',
          rewardRate: '0',
          lastUpdateTime: Date.now(),
          rewardStats: {
            sessionTotal: 0,
            sessionDurationMinutes: 0,
            sessionPerMinute: 0,
            currentRate: {
              perMinute: 0,
              perHour: 0,
              perDay: 0
            },
            formatted: {
              sessionTotal: '0',
              perMinute: '0',
              perHour: '0',
              perDay: '0'
            }
          },
          stakedTokens: []
        }
      };
    }
    
    // Safe call helper with retry logic and better error handling (tuple-aware)
    const safeCall = async (method: string, ...args: any[]): Promise<ethers.BigNumber> => {
      const maxRetries = 3;
      let lastError: Error | null = null;
      
      for (let i = 0; i < maxRetries; i++) {
        try {
          // @ts-ignore - Dynamic method access with error handling
          const result: any = await contract[method](...args);
          if (result === undefined || result === null) {
            return ethers.BigNumber.from(0);
          }
          // Handle tuple/array return values by taking the first element
          if (Array.isArray(result)) {
            const first = result[0];
            return ethers.BigNumber.from(first?.toString?.() ?? first ?? 0);
          }
          // Handle objects with _hex (BigNumber-like)
          if (typeof result === 'object' && result?._hex) {
            return ethers.BigNumber.from(result);
          }
          return ethers.BigNumber.from(result.toString());
        } catch (error: any) {
          lastError = error;
          // Don't retry for invalid method calls
          if (error.code === 'INVALID_ARGUMENT' || error.code === 'UNSUPPORTED_OPERATION') {
            console.warn(`Invalid call to ${method}:`, error.message);
            break;
          }
          console.warn(`Attempt ${i + 1}/${maxRetries} failed for ${method}:`, error.message);
          if (i < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
          }
        }
      }
      
      console.error(`All ${maxRetries} attempts failed for ${method} with args:`, args);
      if (lastError) {
        console.error('Last error details:', lastError);
      }
      return ethers.BigNumber.from(0);
    };
    
    // No initial aggregate values yet; rewardRate kept as 0 unless available
    let rewardRate = ethers.BigNumber.from(0);
    try {
      const rate = await contract.rewardRate();
      if (rate) rewardRate = rate;
    } catch (e) {
      // Optional function; ignore if not present
    }
    
    // Format values
    const formatEther = (value: ethers.BigNumber) => {
      try {
        return ethers.utils.formatEther(value.toString());
      } catch (e) {
        console.error('Error formatting value:', value, e);
        return '0';
      }
    };
    
    // (We will compute formatted values and reward stats after aggregating per-token data)

    // Aggregation buckets
    let stakedSum = ethers.BigNumber.from(0);
    let rewardSum = ethers.BigNumber.from(0);
    let networkTotalStaked = ethers.BigNumber.from(0);

    // Get token-specific staking information if token IDs are provided
    let stakedTokens: StakingInfo['stakedTokens'] = [];
    if (tokenIds && tokenIds.length > 0) {
      try {
        stakedTokens = await Promise.all(tokenIds.map(async (tokenId) => {
          try {
            // Read stake struct (amount, shares, block) and reward
            const rawStake = await safeCall('getStake', tokenId);
            const rawReward = await safeCall('getStakingReward', tokenId);
            const staked = rawStake; // safeCall extracts first tuple element (amount)
            const reward = rawReward;

            // Debug logs to validate live values
            console.debug('[staking] token', tokenId, 'rawStake', rawStake.toString(), 'rawReward', rawReward.toString());

            // Aggregate totals
            stakedSum = stakedSum.add(staked);
            rewardSum = rewardSum.add(reward);

            return {
              tokenId,
              stakedAmount: formatEther(staked),
              rewardAmount: formatEther(reward)
            };
          } catch (error) {
            console.warn(`Error fetching info for token ${tokenId}:`, error);
            return {
              tokenId,
              stakedAmount: '0',
              rewardAmount: '0'
            };
          }
        }));
      } catch (error) {
        console.error('Error fetching staked tokens:', error);
      }
    }

    // Get network total staked (reserve)
    try {
      networkTotalStaked = await safeCall('getReserve');
    } catch (e) {
      // ignore, default 0
    }
    
    // Now compute formatted values after aggregation
    const formattedStaked = formatEther(stakedSum);
    const formattedEarned = formatEther(rewardSum);
    
    // Update reward history and get stats - only if we have a valid earned amount
    if (rewardSum.gt(0)) {
      // Pass human-readable (ether) value to reward history for consistency
      rewardHistory.update(formattedEarned);
    }
    const rewardStats = rewardHistory.getStats();
    
    // If we have no reward rate but have earned rewards, estimate a rate
    if (rewardRate.isZero() && rewardSum.gt(0) && rewardStats.sessionDurationMinutes > 0) {
      const rate = parseFloat(ethers.utils.formatEther(rewardSum)) / 
                  (rewardStats.sessionDurationMinutes / 60);
      // Update the reward rate in the stats if needed
      if (rate > 0) {
        rewardStats.currentRate.perMinute = rate;
        rewardStats.currentRate.perHour = rate * 60;
        rewardStats.currentRate.perDay = rate * 60 * 24;
      }
    }
    
    const result: StakingInfo = {
      stakedAmount: formattedStaked,
      earnedRewards: formattedEarned,
      totalStaked: formatEther(networkTotalStaked),
      rewardRate: formatEther(rewardRate),
      lastUpdateTime: Date.now(),
      rewardStats: rewardStats,
      stakedTokens: stakedTokens.length > 0 ? stakedTokens : undefined
    };
    
    return {
      success: true,
      data: result
    };
  } catch (error: any) {
    console.error('Error in getTotalStakingInfo:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch total staking info',
      data: {
        stakedAmount: '0',
        earnedRewards: '0',
        totalStaked: '0',
        rewardRate: '0',
        rewardStats: {
          sessionTotal: 0,
          sessionDurationMinutes: 0,
          sessionPerMinute: 0,
          currentRate: {
            perMinute: 0,
            perHour: 0,
            perDay: 0
          },
          formatted: {
            sessionTotal: '0',
            perMinute: '0',
            perHour: '0',
            perDay: '0'
          }
        }
      }
    };
  }
};
