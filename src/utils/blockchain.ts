const ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY;
const MYST_TOKEN_ADDRESS = import.meta.env.VITE_MYST_TOKEN_ADDRESS;

// ERC-20 function selectors
const DECIMALS_SELECTOR = '0x313ce567';
const BALANCE_OF_SELECTOR = '0x70a08231';

// Helper function to make Alchemy API calls
async function alchemyCall(params: any) {
  const response = await fetch(`https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      ...params
    })
  });
  
  const data = await response.json();
  return data.result;
}

// Helper function to pad address to 32 bytes
function padAddress(address: string): string {
  return address.toLowerCase().replace('0x', '').padStart(64, '0');
}

export const getMystBalance = async (walletAddress: string): Promise<string> => {
  try {
    // Default values
    let decimals = 18; // Most tokens use 18 decimals
    let balance = 0n;
    
    try {
      // Get decimals
      const decimalsResult = await alchemyCall({
        method: 'eth_call',
        params: [{
          to: MYST_TOKEN_ADDRESS,
          data: DECIMALS_SELECTOR
        }, 'latest']
      });
      
      if (decimalsResult && decimalsResult !== '0x') {
        decimals = parseInt(decimalsResult, 16);

      }
    } catch (decimalsError) {
      console.error('Error getting decimals, using default (18)');
    }
    
    try {
      // Get balance
      const data = BALANCE_OF_SELECTOR + padAddress(walletAddress);
      const balanceResult = await alchemyCall({
        method: 'eth_call',
        params: [{
          to: MYST_TOKEN_ADDRESS,
          data
        }, 'latest']
      });
      
      if (balanceResult && balanceResult !== '0x') {
        balance = BigInt(balanceResult);
      }
    } catch (balanceError) {
      console.error('Error getting balance:', balanceError);
      throw new Error('Failed to fetch token balance');
    }
    
    // Convert from wei to token units and return as number
    return (Number(balance) / Math.pow(10, decimals)).toString();
  } catch (error) {
    console.error('Error in getMystBalance:', error);
    return '0.00'; // Return '0.00' as string on error
  }
};
