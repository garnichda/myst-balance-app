import { Alchemy, Network, AssetTransfersCategory, SortingOrder } from 'alchemy-sdk';

// Define the ABI for the staking contract (keeping for reference)
// const STAKING_CONTRACT_ABI = [
//   'function stake(uint256 amount) external',
//   'function getStake(uint256 tokenId) external view returns (uint256)',
//   'function getStakingReward(uint256 tokenId) external view returns (uint256)'
// ];

// Staking contract address
const STAKING_CONTRACT_ADDRESS = '0xbf9f6b1d910aa207daa400931430ef110570f8ff';

const config = {
  apiKey: import.meta.env.VITE_ALCHEMY_API_KEY,
  network: Network.MATIC_MAINNET,
};

const alchemy = new Alchemy(config);

// Function to get the last staking interaction
/**
 * Get the last time the wallet interacted with the staking contract
 */
export const getLastStakingInteraction = async (walletAddress: string): Promise<Date | null> => {
  try {
    // Get all transactions to the staking contract
    const response = await alchemy.core.getAssetTransfers({
      fromBlock: '0x0',
      toBlock: 'latest',
      fromAddress: walletAddress,
      toAddress: STAKING_CONTRACT_ADDRESS,
      excludeZeroValue: true,
      withMetadata: true,
      category: [
        AssetTransfersCategory.ERC20,
        AssetTransfersCategory.ERC721,
        AssetTransfersCategory.EXTERNAL,
        AssetTransfersCategory.INTERNAL
      ]
    });

    if (response.transfers.length === 0) return null;

    // Sort by block number (descending) to get the most recent transaction
    const lastTx = response.transfers.sort((a, b) => 
      parseInt(b.blockNum, 16) - parseInt(a.blockNum, 16)
    )[0];

    if (!lastTx) return null;

    // Get the block to get the timestamp
    const block = await alchemy.core.getBlock(parseInt(lastTx.blockNum, 16));
    return new Date(block.timestamp * 1000);

  } catch (error) {
    console.error('Error fetching staking interactions:', error);
    return null;
  }
};

/**
 * Get the last stake increase transaction details
 */
export const getLastStakeTransaction = async (walletAddress: string): Promise<{
  timestamp: Date | null;
  amount: string | null;
  tokenId: string | null;
  transactionHash: string | null;
}> => {
  try {
    console.log(`[getLastStakeTransaction] Fetching transactions from ${walletAddress} to ${STAKING_CONTRACT_ADDRESS}`);
    
    // First, try to get the most recent transaction directly between the two addresses
    const response = await alchemy.core.getAssetTransfers({
      fromBlock: '0x0',
      toBlock: 'latest',
      fromAddress: walletAddress.toLowerCase(),
      toAddress: STAKING_CONTRACT_ADDRESS.toLowerCase(),
      excludeZeroValue: true,
      withMetadata: true,
      category: [
        AssetTransfersCategory.EXTERNAL,
        AssetTransfersCategory.INTERNAL,
        AssetTransfersCategory.ERC20,
        AssetTransfersCategory.ERC721
      ],
      order: SortingOrder.DESCENDING,
      maxCount: 1 // We only need the most recent one
    });
    
    console.log(`[getLastStakeTransaction] Found ${response.transfers.length} matching transactions`);

    if (response.transfers.length === 0) {
      console.log(`[getLastStakeTransaction] No direct transactions found between addresses`);
      return { timestamp: null, amount: null, tokenId: null, transactionHash: null };
    }
    
    // Since we're only getting the most recent one, we can process it directly
    const tx = response.transfers[0];
    console.log(`[getLastStakeTransaction] Processing transaction: ${tx.hash}`);

    try {
      // Get the transaction details
      const txDetails = await alchemy.core.getTransaction(tx.hash);
      if (!txDetails?.data) {
        console.log(`[getLastStakeTransaction] ${tx.hash} - No transaction data`);
        return { timestamp: null, amount: null, tokenId: null, transactionHash: null };
      }
      
      console.log(`[getLastStakeTransaction] ${tx.hash} - Raw data: ${txDetails.data.substring(0, 100)}...`);
      
      // Check for both increaseStake (0xbec10cde) and stake (0xa694fc3a) function selectors
      const isIncreaseStake = txDetails.data.startsWith('0xbec10cde');
      const isStake = txDetails.data.startsWith('0xa694fc3a');
      
      if (!isIncreaseStake && !isStake) {
        console.log(`[getLastStakeTransaction] ${tx.hash} - Not a stake/increaseStake transaction (data: ${txDetails.data.substring(0, 10)}...)`);
        return { timestamp: null, amount: null, tokenId: null, transactionHash: null };
      }
      
      // Get the block to get the timestamp
      const block = await alchemy.core.getBlock(parseInt(tx.blockNum, 16));
      
      // Parse the input data
      const inputData = txDetails.data;
      let stakeAmount: string | null = null;
      let tokenId: string | null = null;
      
      if (isIncreaseStake) {
        // For increaseStake function (0xbec10cde):
        // 0xbec10cde - function selector
        // [32 bytes]  - stakeTokenId (uint256)
        // [32 bytes]  - stakeAmountDelta (uint256)
        if (inputData.length >= 138) {
          // Extract tokenId (first parameter after selector)
          const tokenIdHex = '0x' + inputData.slice(10, 74);
          tokenId = BigInt(tokenIdHex).toString();
          
          // Extract stake amount (second parameter)
          const amountHex = '0x' + inputData.slice(74, 138);
          const amount = BigInt(amountHex);
          // Convert from wei to ETH (assuming 18 decimals)
          stakeAmount = (Number(amount) / 1e18).toString();
        }
      } else if (isStake) {
        // For stake function (0xa694fc3a):
        // 0xa694fc3a - function selector
        // [32 bytes] - amount (uint256)
        if (inputData.length >= 74) {
          // For the stake function, we don't have a tokenId yet (it's minted during staking)
          tokenId = '0';
          
          // Extract stake amount (only parameter)
          const amountHex = '0x' + inputData.slice(10, 74);
          const amount = BigInt(amountHex);
          // Convert from wei to ETH (assuming 18 decimals)
          stakeAmount = (Number(amount) / 1e18).toString();
        }
      }
      
      const result = {
        timestamp: new Date(Number(block.timestamp) * 1000),
        amount: stakeAmount,
        tokenId: tokenId,
        transactionHash: tx.hash
      };
      
      console.log(`[getLastStakeTransaction] Found valid stake transaction:`, result);
      return result;
    } catch (error) {
      console.error(`[getLastStakeTransaction] Error processing transaction ${tx.hash}:`, error);
      return { timestamp: null, amount: null, tokenId: null, transactionHash: null };
    }
  } catch (error) {
    console.error('Error fetching stake transactions:', error);
    return { timestamp: null, amount: null, tokenId: null, transactionHash: null };
  }
};
