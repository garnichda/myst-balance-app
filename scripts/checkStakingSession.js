import { ethers } from 'ethers';

// Contract ABI - minimal ABI needed
const abi = [
  'function balanceOf(address) view returns (uint256)',
  'function earned(address) view returns (uint256)',
  'function rewardRate() view returns (uint256)'
];

// Contract address
const contractAddress = '0xbf9f6b1d910aa207daa400931430ef110570f8ff';

// Wallet address to check
const walletAddress = '0xa26762470fc8F22b4A504fedd83D2f878314A1D9';

// Track session start time and initial earned amount
let sessionStartTime = Date.now();
let initialEarned = '0';
let lastEarned = '0';

async function getStakingInfo() {
  // Connect to the network
  const provider = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com/');
  const contract = new ethers.Contract(contractAddress, abi, provider);
  
  // Get current staking info
  const [stakedBalance, earned, rewardRate] = await Promise.all([
    contract.balanceOf(walletAddress),
    contract.earned(walletAddress),
    contract.rewardRate()
  ]);
  
  return { stakedBalance, earned, rewardRate };
}

// Format numbers with thousand separators and fixed decimal places
function formatNumber(num, decimals = 4) {
  return parseFloat(num).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  });
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hours}h ${minutes}m ${secs}s`;
}

async function checkStaking() {
  try {
    const { stakedBalance, earned, rewardRate } = await getStakingInfo();
    
    // Initialize session tracking on first run
    if (initialEarned === '0') {
      initialEarned = earned.toString();
    }
    
    // Calculate session metrics
    const currentEarned = ethers.utils.formatEther(earned);
    const initialEarnedFormatted = ethers.utils.formatEther(initialEarned);
    const sessionEarned = (parseFloat(currentEarned) - parseFloat(initialEarnedFormatted)).toFixed(6);
    
    // Calculate time since session start
    const sessionDuration = (Date.now() - sessionStartTime) / 1000; // in seconds
    const rewardRatePerSecond = parseFloat(ethers.utils.formatEther(rewardRate));
    const rewardRatePerMinute = rewardRatePerSecond * 60;
    
    // Display information
    console.clear();
    console.log('\x1b[36m=== MYST Staking Session ===\x1b[0m');
    console.log(`Session started: \x1b[33m${new Date(sessionStartTime).toLocaleTimeString()}\x1b[0m`);
    console.log(`Session duration: \x1b[33m${formatDuration(sessionDuration)}\x1b[0m`);
    console.log('─'.repeat(40));
    
    // Staking Info
    console.log(`Staked: \x1b[32m${formatNumber(ethers.utils.formatEther(stakedBalance))} MYST\x1b[0m`);
    console.log(`Total Earned: \x1b[32m${formatNumber(currentEarned, 6)} MYST\x1b[0m`);
    console.log(`Earned This Session: \x1b[32m${formatNumber(sessionEarned, 6)} MYST\x1b[0m`);
    
    // Staked Tokens
    if (stakedBalance.gt(0)) {
      console.log('\n\x1b[36mStaked Tokens\x1b[0m');
      console.log(`Token #${walletAddress.slice(0, 10)}...: \x1b[32m${formatNumber(ethers.utils.formatEther(stakedBalance))} MYST\x1b[0m`);
      console.log(`Rewards: \x1b[32m${formatNumber(currentEarned, 6)} MYST\x1b[0m`);
    }
    
    console.log('─'.repeat(40));
    
    // Session Stats
    console.log('\n\x1b[36mSession Statistics\x1b[0m');
    console.log(`Session Duration: \x1b[33m${formatDuration(sessionDuration)}\x1b[0m`);
    console.log(`Earned This Session: \x1b[32m${formatNumber(sessionEarned, 6)} MYST\x1b[0m`);
    console.log(`Session Rate: \x1b[32m${formatNumber(rewardRatePerMinute, 6)} MYST/min\x1b[0m`);
    
    // Current Rate
    console.log('\n\x1b[36mCurrent Rate (Last 5 min)\x1b[0m');
    console.log(`Per Minute: \x1b[32m${formatNumber(rewardRatePerMinute, 6)} MYST\x1b[0m`);
    console.log(`Per Hour: \x1b[32m${formatNumber(rewardRatePerMinute * 60, 6)} MYST\x1b[0m`);
    console.log(`Per Day: \x1b[32m${formatNumber(rewardRatePerMinute * 1440, 6)} MYST\x1b[0m`);
    
    // Update last earned for next iteration
    lastEarned = currentEarned;
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run check immediately and then every 30 seconds
checkStaking();
setInterval(checkStaking, 30000);
