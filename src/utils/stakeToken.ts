import { ethers } from 'ethers';

const STAKING_CONTRACT_ADDRESS = '0xbf9f6b1d910aa207daa400931430ef110570f8ff';

const STAKING_ABI = [
  'function getStakeToken() view returns (address)'
] as const;

const ERC721_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)'
];

const provider = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com/');

export async function getStakeTokenAddress(): Promise<string | null> {
  try {
    const contract = new ethers.Contract(STAKING_CONTRACT_ADDRESS, STAKING_ABI, provider);
    const addr: string = await contract.getStakeToken();
    if (ethers.utils.isAddress(addr)) return addr;
    return null;
  } catch (e) {
    console.warn('getStakeTokenAddress failed:', e);
    return null;
  }
}

export async function getStakeTokenIdsOfOwner(ownerAddress: string): Promise<{ stakeToken: string | null; tokenIds: string[] }> {
  try {
    if (!ethers.utils.isAddress(ownerAddress)) throw new Error('Invalid owner address');
    const stakeToken = await getStakeTokenAddress();
    if (!stakeToken) return { stakeToken: null, tokenIds: [] };
    const erc721 = new ethers.Contract(stakeToken, ERC721_ABI, provider);
    const balanceBn: ethers.BigNumber = await erc721.balanceOf(ownerAddress);
    const balance = balanceBn.toNumber();
    const ids: string[] = [];
    for (let i = 0; i < balance; i++) {
      try {
        const idBn: ethers.BigNumber = await erc721.tokenOfOwnerByIndex(ownerAddress, i);
        ids.push(idBn.toString());
      } catch (err) {
        console.warn(`tokenOfOwnerByIndex failed at ${i}:`, err);
      }
    }
    return { stakeToken, tokenIds: ids };
  } catch (e) {
    console.warn('getStakeTokenIdsOfOwner failed:', e);
    return { stakeToken: null, tokenIds: [] };
  }
}
