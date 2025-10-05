import { ethers } from 'ethers';

interface RewardDataPoint {
  timestamp: number;
  reward: string; // In wei as string for precision
}

class RewardTracker {
  private rewardHistory: RewardDataPoint[] = [];
  private readonly maxAgeMs = 60 * 1000; // 1 minute in milliseconds
  private lastProcessedReward = '0';

  // Add a new reward data point
  public addReward(reward: string): void {
    const now = Date.now();
    const rewardWei = ethers.BigNumber.from(reward).toString();
    
    // Add new data point
    this.rewardHistory.push({
      timestamp: now,
      reward: rewardWei
    });
    
    // Clean up old data points
    this.cleanupOldData();
  }

  // Get rewards from the last minute
  public getRewardsLastMinute(): { total: string; perMinute: string; dataPoints: RewardDataPoint[] } {
    this.cleanupOldData();
    
    if (this.rewardHistory.length === 0) {
      return {
        total: '0',
        perMinute: '0',
        dataPoints: []
      };
    }

    // Calculate total rewards in the last minute
    const totalWei = this.rewardHistory.reduce((sum, point) => {
      return sum.add(ethers.BigNumber.from(point.reward));
    }, ethers.BigNumber.from(0));

    // Calculate rewards per minute (extrapolated from the available data)
    const firstPoint = this.rewardHistory[0];
    const lastPoint = this.rewardHistory[this.rewardHistory.length - 1];
    const timeSpanMs = lastPoint.timestamp - firstPoint.timestamp;
    
    let perMinuteWei = '0';
    if (timeSpanMs > 0) {
      const timeFactor = (60 * 1000) / timeSpanMs; // Scale to 1 minute
      perMinuteWei = totalWei.mul(Math.floor(timeFactor * 1000)).div(1000).toString();
    } else {
      perMinuteWei = totalWei.toString();
    }

    return {
      total: ethers.utils.formatEther(totalWei.toString()),
      perMinute: ethers.utils.formatEther(perMinuteWei),
      dataPoints: [...this.rewardHistory]
    };
  }

  // Clean up data points older than maxAgeMs
  private cleanupOldData(): void {
    const now = Date.now();
    const cutoff = now - this.maxAgeMs;
    
    // Find the first index that's not too old
    const firstValidIndex = this.rewardHistory.findIndex(
      point => point.timestamp >= cutoff
    );
    
    if (firstValidIndex > 0) {
      this.rewardHistory = this.rewardHistory.slice(firstValidIndex);
    }
  }

  // Calculate reward difference since last check
  public getRewardDifference(currentReward: string): string {
    const currentWei = ethers.BigNumber.from(currentReward);
    const lastWei = ethers.BigNumber.from(this.lastProcessedReward || '0');
    
    // Update last processed reward
    this.lastProcessedReward = currentWei.toString();
    
    // If current reward is less than last processed, it might be a reset or claim
    if (currentWei.lt(lastWei)) {
      return '0';
    }
    
    return currentWei.sub(lastWei).toString();
  }
}

// Export a singleton instance
export const rewardTracker = new RewardTracker();
