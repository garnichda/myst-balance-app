import { useState, useEffect, useCallback } from 'react';
import { getMystBalance } from './utils/blockchain';
import { getTotalStakingInfo, type StakingContractResult } from './utils/staking';
import { getTokensOfOwner } from './utils/erc721';
import { formatNumber } from './utils/format';
import { rewardHistory } from './utils/rewardHistory';
import Statistics from './components/Statistics';
import './App.css';

// Type definitions
interface StakedToken {
  tokenId: string;
  stakedAmount: string;
  rewardAmount: string;
}

interface RewardStats {
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

interface StakingData {
  stakedAmount: string;
  earnedRewards: string;
  totalStaked: string;
  rewardRate: string;
  stakedTokens: StakedToken[];
  rewardStats?: RewardStats;
  lastUpdateTime?: number;
  tokenId?: string;
}

// Utility function to shorten wallet address
export const shortenAddress = (address: string, chars = 4): string => {
  return `${address.substring(0, chars + 2)}...${address.substring(address.length - chars)}`;
};

const WALLET_ADDRESS = '0xa26762470fc8F22b4A504fedd83D2f878314A1D9';

function App() {
  const [balance, setBalance] = useState<string>('0');
  
  // Track initial earned amount for session calculation
  const [initialEarned, setInitialEarned] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Initialize reward history when the component mounts
  useEffect(() => {
    console.log('Component mounted, initializing reward history');
    
    // Only reset if we're not already initialized
    if (!isInitialized) {
      rewardHistory.reset();
      setIsInitialized(true);
      console.log('Reward history initialized');
    }
    
    // Cleanup function
    return () => {
      console.log('Component unmounting');
    };
  }, [isInitialized]);
  
  const [stakingData, setStakingData] = useState<StakingData>({
    stakedAmount: '0',
    earnedRewards: '0',
    totalStaked: '0',
    rewardRate: '0',
    stakedTokens: [],
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
    lastUpdateTime: Date.now()
  });
  const [timeUntilRefresh, setTimeUntilRefresh] = useState<number>(60);
  const [activeTab, setActiveTab] = useState<'wallet' | 'stats'>('wallet');

  const fetchData = useCallback(async () => {
    console.log('Fetching balance and staking info...');
    
    try {
      // Fetch balance first
      console.log('Fetching wallet balance...');
      const balanceResult = await getMystBalance(WALLET_ADDRESS);
      console.log('Wallet balance:', balanceResult);
      
      // Fetch token IDs from the specified ERC-721 stake token contract
      const fixedStakeTokenAddress = '0x8aE66d7858578764d573FfB0ece58Db59E569bC1';
      console.log('Fetching token IDs from fixed stake token address:', fixedStakeTokenAddress);
      const tokenIds = await getTokensOfOwner(WALLET_ADDRESS, fixedStakeTokenAddress).catch((err: Error) => {
        console.error('Error fetching token IDs from fixed stake token contract:', err);
        return [] as string[];
      });
      console.log('Found token IDs:', tokenIds);
      
      // Then fetch staking info with token details
      console.log('Fetching staking info...');
      const stakingInfo = await getTotalStakingInfo(WALLET_ADDRESS, tokenIds).catch((err: Error) => {
        console.error('Error getting staking info:', err);
        return {
          success: false,
          error: err.message,
          data: {
            stakedAmount: '0',
            earnedRewards: '0',
            totalStaked: '0',
            rewardRate: '0',
            stakedTokens: []
          }
        } as StakingContractResult;
      });
      
      console.log('Staking info response:', JSON.stringify(stakingInfo, null, 2));
      
      // Handle staking info response
      if (!stakingInfo?.success) {
        console.error('Failed to fetch staking info:', stakingInfo?.error || 'Unknown error');
        // Continue with default values instead of throwing
      }
      
      const stakingDataResult = stakingInfo.data || {
        stakedAmount: '0',
        earnedRewards: '0',
        totalStaked: '0',
        rewardRate: '0',
        stakedTokens: []
      };
      
      console.log('Processed staking data:', {
        stakedAmount: stakingDataResult.stakedAmount,
        earnedRewards: stakingDataResult.earnedRewards,
        stakedTokensCount: stakingDataResult.stakedTokens?.length || 0
      });
      
      console.log('Data fetched successfully:', {
        balance: balanceResult,
        stakingData: {
          ...stakingDataResult,
          // Include a preview of staked tokens if they exist
          stakedTokensPreview: stakingDataResult.stakedTokens?.slice(0, 3)
        }
      });
      
      // Debug: Log the raw values before formatting
      console.log('Raw values before formatting:', {
        stakedAmount: stakingDataResult.stakedAmount,
        earnedRewards: stakingDataResult.earnedRewards,
        totalStaked: stakingDataResult.totalStaked,
        rewardRate: stakingDataResult.rewardRate
      });
      
      // Log the raw staking data we received
      console.log('Raw staking data result:', {
        stakedAmount: stakingDataResult.stakedAmount,
        earnedRewards: stakingDataResult.earnedRewards,
        totalStaked: stakingDataResult.totalStaked,
        rewardRate: stakingDataResult.rewardRate,
        stakedTokens: stakingDataResult.stakedTokens
      });

      // Update balance
      setBalance(balanceResult);
      
      // Set initial earned amount on first load if not set
      if (initialEarned === null) {
        console.log('Setting initial earned amount:', stakingDataResult.earnedRewards);
        setInitialEarned(stakingDataResult.earnedRewards);
        
        // Set the initial amount in the reward history
        rewardHistory.setInitialAmount(stakingDataResult.earnedRewards);
        
        // Get updated stats after setting initial amount
        const initialStats = rewardHistory.getStats();
        console.log('Initial reward stats:', initialStats);
        
        // Don't return here - we want to continue with the rest of the function
      }
      
      // Get the current earned amount
      const currentEarned = parseFloat(stakingDataResult.earnedRewards);
      const initialEarnedNum = parseFloat(initialEarned || '0');
      
      // Only update if we have a valid initial amount and the amount has changed
      if (initialEarned !== null) {
        console.log('Current earned:', currentEarned, 'Initial earned:', initialEarnedNum);
        
        // Only update if the amount has increased (new rewards)
        if (currentEarned > initialEarnedNum) {
          console.log('Updating reward history with new rewards:', currentEarned - initialEarnedNum);
          rewardHistory.update(currentEarned.toString());
        }
      }
      
      // Get the latest stats after update
      const rewardStats = rewardHistory.getStats();
      
      // Calculate session earned from reward stats to ensure consistency
      const sessionEarned = rewardStats.sessionTotal;
      
      console.log('Reward tracking:', {
        currentEarned,
        initialEarned: initialEarnedNum,
        sessionEarned,
        sessionDuration: rewardStats.sessionDurationMinutes,
        currentRate: rewardStats.currentRate
      });
      
      // Create a new staking data object with updated values
      const newStakingData: StakingData = {
        stakedAmount: stakingDataResult.stakedAmount,
        earnedRewards: stakingDataResult.earnedRewards,
        totalStaked: stakingDataResult.totalStaked,
        rewardRate: stakingDataResult.rewardRate,
        stakedTokens: stakingDataResult.stakedTokens || [],
        rewardStats: {
          sessionTotal: sessionEarned,
          sessionDurationMinutes: rewardStats.sessionDurationMinutes,
          sessionPerMinute: rewardStats.sessionPerMinute,
          currentRate: {
            perMinute: rewardStats.currentRate.perMinute,
            perHour: rewardStats.currentRate.perHour,
            perDay: rewardStats.currentRate.perDay
          },
          formatted: {
            sessionTotal: formatNumber(sessionEarned, 6),
            perMinute: formatNumber(rewardStats.currentRate.perMinute, 6),
            perHour: formatNumber(rewardStats.currentRate.perHour, 6),
            perDay: formatNumber(rewardStats.currentRate.perDay, 6)
          }
        },
        lastUpdateTime: Date.now(),
      };
      
      setStakingData(newStakingData);
      
    } catch (error: any) {
      console.error('Error in fetchData:', error);
    }
  }, [WALLET_ADDRESS]);

  useEffect(() => {
    let refreshTimer: NodeJS.Timeout;
    
    const refreshData = () => {
      if (timeUntilRefresh <= 0) {
        fetchData();
        setTimeUntilRefresh(60);
      } else {
        setTimeUntilRefresh(prev => prev - 1);
      }
    };
    
    refreshTimer = setInterval(refreshData, 1000);
    
    // Initial fetch
    fetchData();
    
    return () => {
      if (refreshTimer) clearInterval(refreshTimer);
    };
  }, [fetchData, timeUntilRefresh]);

  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = Math.floor(minutes % 60);
    
    if (hours > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${remainingMinutes} minutes`;
  };

  const renderTabContent = () => {
    if (activeTab === 'wallet') {
      return (
        <div className="space-y-6">
          {/* Wallet Balance Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Wallet Balance</h3>
            <div className="text-3xl font-bold text-indigo-600">
              {formatNumber(balance)} <span className="text-lg text-gray-500">MYST</span>
            </div>
            <div className="mt-2 text-sm text-gray-500" title={WALLET_ADDRESS}>
              {shortenAddress(WALLET_ADDRESS)}
            </div>
          </div>

          {/* Staking Overview */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Staking Overview</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Staked Amount:</span>
                  <span className="font-medium">{formatNumber(stakingData.stakedAmount)} MYST</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Earned Rewards:</span>
                  <span className="font-medium text-green-600">{formatNumber(stakingData.earnedRewards)} MYST</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Staked (Network):</span>
                  <span className="font-medium">{formatNumber(stakingData.totalStaked)} MYST</span>
                </div>
              </div>

            </div>
          </div>

          {/* Reward Statistics */}
          {stakingData.rewardStats && (
            <div className="space-y-6">
              {/* Session Statistics */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Session Statistics</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-gray-50 p-4 rounded">
                    <div className="text-sm text-gray-500">Session Duration</div>
                    <div className="text-xl font-semibold">
                      {formatDuration(stakingData.rewardStats.sessionDurationMinutes)}
                    </div>
                  </div>
                  <div className="bg-green-50 p-4 rounded">
                    <div className="text-sm text-green-600">Earned This Session</div>
                    <div className="text-xl font-semibold text-green-700">
                      {stakingData.rewardStats.formatted.sessionTotal} MYST
                    </div>
                  </div>
                  <div className="bg-blue-50 p-4 rounded">
                    <div className="text-sm text-blue-600">Session Rate</div>
                    <div className="text-xl font-semibold text-blue-700">
                      {formatNumber(stakingData.rewardStats.sessionPerMinute, 6)} MYST/min
                    </div>
                  </div>
                </div>
              </div>

              {/* Current Rate Statistics */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Current Rate (Last 5 min)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-indigo-50 p-4 rounded">
                    <div className="text-sm text-indigo-600">Per Minute</div>
                    <div className="text-xl font-semibold text-indigo-700">
                      {stakingData.rewardStats.formatted.perMinute} MYST
                    </div>
                  </div>
                  <div className="bg-purple-50 p-4 rounded">
                    <div className="text-sm text-purple-600">Per Hour</div>
                    <div className="text-xl font-semibold text-purple-700">
                      {stakingData.rewardStats.formatted.perHour} MYST
                    </div>
                  </div>
                  <div className="bg-pink-50 p-4 rounded">
                    <div className="text-sm text-pink-600">Per Day</div>
                    <div className="text-xl font-semibold text-pink-700">
                      {stakingData.rewardStats.formatted.perDay} MYST
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }
    
    return <Statistics />;
  };

  return (
    <div className="app">
      <div className="refresh-timer">
        <span className="hourglass">⏳</span>
        <span className="countdown">{timeUntilRefresh}s</span>
      </div>
      <header>
        <h1>MYST Community Dashboard</h1>
      </header>

      <main>
        <div className="tabs">
          <button 
            className={`tab ${activeTab === 'wallet' ? 'active' : ''}`}
            onClick={() => setActiveTab('wallet')}
          >
            Wallet
          </button>
          <button 
            className={`tab ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => setActiveTab('stats')}
          >
            Statistics
          </button>
        </div>
        
        <div className="tab-content">
          {renderTabContent()}
        </div>
      </main>

      <footer>
        <p>
          Powered by{' '}
          <a href="https://www.alchemy.com/" target="_blank" rel="noopener noreferrer">
            Alchemy
          </a>
        </p>
      </footer>
    </div>
  );
}

export default App;
