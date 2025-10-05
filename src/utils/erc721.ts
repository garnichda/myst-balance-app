import { ethers } from 'ethers';

// ERC-721 ABI with only the functions we need
const ERC721_ABI = [
  'function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)',
  'function balanceOf(address owner) external view returns (uint256)'
];

// Default ERC-721 contract address
const DEFAULT_ERC721_CONTRACT = '0x8aE66d7858578764d573FfB0ece58Db59E569bC1';

// Initialize provider with Alchemy-first RPC and static network to avoid noNetwork issues
const ALCHEMY_API_KEY = (import.meta as any).env?.VITE_ALCHEMY_API_KEY;
const ERC721_RPC_URL = ALCHEMY_API_KEY
  ? `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
  : 'https://polygon-rpc.com/';
const provider = new ethers.providers.StaticJsonRpcProvider(
  {
    url: ERC721_RPC_URL,
    timeout: 20000
  },
  { name: 'matic', chainId: 137 }
);

/**
 * Get all NFT token IDs owned by an address from a specific ERC-721 contract
 * @param ownerAddress The wallet address to check for NFTs
 * @param contractAddress The ERC-721 contract address (defaults to the specified contract)
 * @returns Array of token IDs as strings
 */
export const getTokensOfOwner = async (ownerAddress: string, contractAddress: string = DEFAULT_ERC721_CONTRACT): Promise<string[]> => {
  try {
    if (!ethers.utils.isAddress(ownerAddress)) {
      throw new Error('Invalid owner address');
    }
    if (!ethers.utils.isAddress(contractAddress)) {
      throw new Error('Invalid contract address');
    }

    const contract = new ethers.Contract(contractAddress, ERC721_ABI, provider);
    
    // Get the number of tokens owned by the address
    const balance = await contract.balanceOf(ownerAddress);
    const tokenCount = balance.toNumber();
    
    // Get each token ID using tokenOfOwnerByIndex
    const tokenPromises: Promise<string | null>[] = [];
    for (let i = 0; i < tokenCount; i++) {
      tokenPromises.push(
        contract.tokenOfOwnerByIndex(ownerAddress, i)
          .then((tokenId: ethers.BigNumber) => tokenId.toString())
          .catch((err: Error) => {
            console.error(`Error getting token at index ${i}:`, err);
            return null;
          })
      );
    }
    
    // Wait for all token IDs to be fetched and filter out any errors
    const tokenIds = await Promise.all(tokenPromises);
    return tokenIds.filter((tokenId): tokenId is string => tokenId !== null);
    
  } catch (error) {
    console.error('Error in getTokensOfOwner:', error);
    return [];
  }
};

/**
 * Get all NFT token IDs from the default ERC-721 contract
 * @param ownerAddress The wallet address to check for NFTs
 * @returns Array of token IDs as strings
 */
export const getDefaultContractTokens = async (ownerAddress: string): Promise<string[]> => {
  return getTokensOfOwner(ownerAddress, DEFAULT_ERC721_CONTRACT);
};
