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
  // State for UI
  const [activeTab, setActiveTab] = useState<'wallet' | 'stats'>('wallet');
  const [balance, setBalance] = useState<string>('0');
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [timeUntilRefresh, setTimeUntilRefresh] = useState<number>(60);
  
  // State for reward tracking
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
          rewardHistory.update(stakingDataResult.earnedRewards);
        }
        
        const stats = rewardHistory.getStats();
        
        // Create a new staking data object with updated values
        const newStakingData: StakingData = {
          ...stakingDataResult,
          stakedTokens: stakingDataResult.stakedTokens || [],
          rewardStats: {
            sessionTotal: currentEarned - initialEarnedNum,
            sessionDurationMinutes: stats.sessionDurationMinutes,
            sessionPerMinute: stats.sessionPerMinute,
            currentRate: {
              perMinute: stats.currentRate.perMinute,
              perHour: stats.currentRate.perHour,
              perDay: stats.currentRate.perDay
            },
            formatted: {
              sessionTotal: formatNumber(currentEarned - initialEarnedNum, 6),
              perMinute: formatNumber(stats.currentRate.perMinute, 6),
              perHour: formatNumber(stats.currentRate.perHour, 6),
              perDay: formatNumber(stats.currentRate.perDay, 6)
            }
          },
          lastUpdateTime: Date.now()
        };
        
        setStakingData(newStakingData);
      } else {
        // If no initial earned amount yet, just update with the current data
        setStakingData(prev => ({
          ...prev,
          ...stakingDataResult,
          stakedTokens: stakingDataResult.stakedTokens || [],
          lastUpdateTime: Date.now()
        }));
      }
      
    } catch (error: any) {
      console.error('Error in fetchData:', error);
    }
  }, [initialEarned, isInitialized]);

  // Set up refresh timer
  useEffect(() => {
    let refreshTimer: NodeJS.Timeout;
    
    const refreshData = () => {
      setTimeUntilRefresh(prev => {
        if (prev <= 1) {
          fetchData();
          return 60;
        }
        return prev - 1;
      });
    };
    
    refreshTimer = setInterval(refreshData, 1000);
    
    // Initial fetch
    fetchData();
    
    return () => {
      if (refreshTimer) clearInterval(refreshTimer);
    };
  }, [fetchData, setTimeUntilRefresh]);
  
  // Update current time every second for real-time duration display
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    
    return () => clearInterval(interval);
  }, [setCurrentTime]);
  
  // Format duration with hours, minutes, and seconds
  const formatDuration = (minutes: number): string => {
    const totalSeconds = Math.floor(minutes * 60);
    const hours = Math.floor(totalSeconds / 3600);
    const remainingSeconds = totalSeconds % 3600;
    const mins = Math.floor(remainingSeconds / 60);
    const secs = Math.floor(remainingSeconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
    } else if (mins > 0) {
      return `${mins}m ${secs.toString().padStart(2, '0')}s`;
    }
    return `${secs}s`;
  };
  
  // Calculate current session duration in minutes
  const getSessionDuration = (): number => {
    if (!stakingData?.rewardStats) return 0;
    
    // If we have a last update time, use that to calculate duration
    if (stakingData.lastUpdateTime) {
      const sessionStartTime = stakingData.lastUpdateTime - (stakingData.rewardStats.sessionDurationMinutes * 60 * 1000);
      return (currentTime - sessionStartTime) / (60 * 1000);
    }
    
    // Fallback to the stored duration if no update time is available
    return stakingData.rewardStats.sessionDurationMinutes;
  };

  const renderTabContent = () => {
    if (activeTab === 'wallet') {
      return (
        <div className="space-y-6">
          {/* Wallet Balance Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Wallet Balance</h3>
            <div className="text-3xl font-bold text-indigo-600">
              {formatNumber(parseFloat(balance))} <span className="text-lg text-gray-500">MYST</span>
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
                  <span className="font-medium">{formatNumber(parseFloat(stakingData.stakedAmount))} MYST</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Earned Rewards:</span>
                  <span className="font-medium text-green-600">
                    {formatNumber(parseFloat(stakingData.earnedRewards))} MYST
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Staked (Network):</span>
                  <span className="font-medium">{formatNumber(parseFloat(stakingData.totalStaked))} MYST</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Reward Rate:</span>
                  <span className="font-medium">
                    {formatNumber(parseFloat(stakingData.rewardRate))} MYST/day
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Session Duration:</span>
                  <span className="font-medium">
                    {formatDuration(getSessionDuration())}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Session Rewards:</span>
                  <span className="font-medium text-green-600">
                    {stakingData.rewardStats?.formatted.sessionTotal || '0'} MYST
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Current Rate:</span>
                  <span className="font-medium">
                    {stakingData.rewardStats?.formatted.perHour || '0'} MYST/hour
                  </span>
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
                      {formatDuration(getSessionDuration())}
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
    <div className="min-h-screen bg-gray-50">
      <div className="refresh-timer fixed top-4 right-4 bg-white shadow-md rounded-full px-4 py-2 flex items-center space-x-2 z-10">
        <span className="hourglass text-gray-600">⏳</span>
        <span className="countdown text-sm font-medium text-gray-700">Refreshing in {timeUntilRefresh}s</span>
      </div>
      
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">MYST Community Dashboard</h1>
          <p className="text-gray-600 mt-2">Track your staking rewards and network statistics</p>
        </header>
        
        {/* Tabs */}
        <div className="flex space-x-4 border-b border-gray-200 mb-6">
          <button
            className={`px-4 py-2 font-medium text-sm ${
              activeTab === 'wallet'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('wallet')}
          >
            Wallet & Staking
          </button>
          <button
            className={`px-4 py-2 font-medium text-sm ${
              activeTab === 'stats'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('stats')}
          >
            Statistics
          </button>
        </div>
        
        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === 'wallet' ? renderTabContent() : <Statistics />}
        </div>
        
        <footer className="mt-12">
          <p className="text-center text-sm text-gray-500">
            Powered by{' '}
            <a
              href="https://www.alchemy.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700"
            >
              Alchemy
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;
