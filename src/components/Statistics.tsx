import React, { useEffect, useState } from 'react';
import { getLastStakeTransaction } from '../utils/alchemy';
import { getLatestTransactionFromAddress } from '../utils/transactions';
import { formatNumber } from '../utils/format';
import type { TransactionInfo } from '../utils/transactions';

const formatDate = (date: Date | null): string => {
  if (!date) return 'Never';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(date);
};

const Statistics: React.FC = () => {
  const [lastStake, setLastStake] = useState<{
    timestamp: Date;
    amount: string | null;
    tokenId: string | null;
    transactionHash: string | null;
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [latestTx, setLatestTx] = useState<TransactionInfo | null>(null);
  const [txLoading, setTxLoading] = useState<boolean>(true);
  const [txError, setTxError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLastStake = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await getLastStakeTransaction('0xa26762470fc8F22b4A504fedd83D2f878314A1D9');
        if (result && result.timestamp && result.amount && result.tokenId) {
          setLastStake({
            timestamp: result.timestamp,
            amount: result.amount,
            tokenId: result.tokenId,
            transactionHash: result.transactionHash || null
          });
        } else {
          setLastStake(null);
        }
      } catch (err) {
        console.error('Error fetching last stake:', err);
        setError('Failed to load staking history');
      } finally {
        setLoading(false);
      }
    };

    const fetchLatestTx = async () => {
      try {
        setTxLoading(true);
        setTxError(null);
        const tx = await getLatestTransactionFromAddress(
          '0x80Ed28d84792d8b153bf2F25F0C4B7a1381dE4ab',
          '0xa26762470fc8F22b4A504fedd83D2f878314A1D9'
        );
        setLatestTx(tx);
      } catch (err) {
        console.error('Error fetching latest transaction:', err);
        setTxError('Failed to load transaction history');
      } finally {
        setTxLoading(false);
      }
    };

    fetchLastStake();
    fetchLatestTx();
    
    // Refresh every 60 seconds to match the main app refresh
    const stakeInterval = setInterval(fetchLastStake, 60000);
    const txInterval = setInterval(fetchLatestTx, 60000);
    
    return () => {
      clearInterval(stakeInterval);
      clearInterval(txInterval);
    };
  }, []);


  return (
    <div className="statistics">
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Latest Node Reward</h3>
          {txLoading ? (
            <div className="stat-value">Loading...</div>
          ) : txError ? (
            <div className="error">{txError}</div>
          ) : latestTx ? (
            <div className="last-tx">
              <div className="tx-amount">
                {parseFloat(latestTx.value) > 0 ? `+${formatNumber(latestTx.value)} MYST` : 'Transaction'}
              </div>
              <div className="tx-timestamp">
                {formatDate(new Date(latestTx.timestamp))}
              </div>
              <a 
                href={`https://polygonscan.com/tx/${latestTx.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="tx-link"
              >
                View on Polygonscan
              </a>
            </div>
          ) : (
            <div className="stat-value">No transactions found</div>
          )}
        </div>
        
        <div className="stat-card">
          <h3>Latest Stake Increase</h3>
          <div className="stat-value">
            {loading ? (
              <span>Loading...</span>
            ) : error ? (
              <span className="error">{error}</span>
            ) : lastStake ? (
              <div className="last-stake">
                <div className="stake-amount">
                  +{formatNumber(lastStake.amount || '0')} MYST
                </div>
                <div className="stake-timestamp">
                  {formatDate(lastStake.timestamp)}
                </div>
                <a 
                  href="https://polygonscan.com/tx/0x6c4b4a4cbe9a4dd4e29cc9c730e2ef06db2072ad22453850ad12c11204acf59d"
                  title={lastStake.transactionHash ? `View transaction on Polygonscan` : `Token ID: ${lastStake.tokenId || 'N/A'}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="view-tx"
                >
                  View on Polygonscan
                </a>
              </div>
            ) : (
              <span>No staking history found</span>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Statistics;
