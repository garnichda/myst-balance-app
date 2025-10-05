import { BigNumber, utils } from 'ethers';
import { formatNumber } from './format';

interface RewardPoint {
  timestamp: number;
  amount: string; // In wei
}

interface RateStats {
  perMinute: number;
  perHour: number;
  perDay: number;
}

interface FormattedStats {
  sessionTotal: string;
  perMinute: string;
  perHour: string;
  perDay: string;
}

interface RewardStats {
  // Current session stats
  sessionTotal: number;
  sessionDurationMinutes: number;
  sessionPerMinute: number;
  
  // Current rate stats (based on recent activity)
  currentRate: RateStats;
  
  // Formatted values for display
  formatted: FormattedStats;
}

class RewardHistory {
  private history: RewardPoint[] = [];
  private lastAmount: string = '0';
  private initialAmount: string | null = null;
  private startTime: number = Date.now();
  private readonly windowMs: number = 5 * 60 * 1000; // 5 minute window
  private initialized: boolean = false;
  
  /**
   * Convert any number format to wei string
   */
  private toWeiString(amount: string | number): string {
    try {
      // If it's a number or numeric string, convert to wei
      if (typeof amount === 'number' || /^\d+(\.\d+)?$/.test(amount.toString())) {
        return utils.parseEther(amount.toString()).toString();
      }
      // If it's already in wei format, return as is
      return amount;
    } catch (e) {
      console.warn('Error converting amount to wei:', amount, e);
      return '0';
    }
  }
  
  /**
   * Initialize with some sample data for immediate feedback
   */
  private initialize(): void {
    if (this.initialized) return;
    
    const now = Date.now();
    // Add some sample data points for the last 5 minutes
    for (let i = 4; i >= 0; i--) {
      this.history.push({
        timestamp: now - (i * 60 * 1000), // One point per minute
        amount: this.toWeiString('0.0001') // 0.0001 MYST in wei
      });
    }
    
    this.initialized = true;
  }

  /**
   * Add a new reward amount and track the difference from the last amount
   */
  public update(currentAmount: string | number): void {
    try {
      console.log('Updating reward history with amount:', currentAmount);
      
      const currentWeiStr = this.toWeiString(currentAmount);
      const currentTime = Date.now();
      
      // If this is the first update, set initial amount
      if (!this.initialized) {
        console.log('Setting initial amount to:', currentWeiStr);
        this.initialAmount = currentWeiStr;
        this.lastAmount = currentWeiStr;
        this.startTime = currentTime;
        this.initialized = true;
        
        // Add an initial point to start tracking
        this.history.push({
          timestamp: currentTime,
          amount: '0'
        });
        
        console.log('Initial amount set, history length:', this.history.length);
        return;
      }
      
      const currentWei = BigNumber.from(currentWeiStr);
      const lastWei = BigNumber.from(this.lastAmount || '0');
      
      console.log('Current wei:', currentWei.toString(), 'Last wei:', lastWei.toString());
      
      if (currentWei.lt(lastWei)) {
        console.log('Detected claim or reset, resetting tracking');
        this.history = [];
        this.lastAmount = currentWeiStr;
        this.initialAmount = currentWeiStr;
        this.startTime = currentTime;
        
        // Add an initial point after reset
        this.history.push({
          timestamp: currentTime,
          amount: '0'
        });
        
        return;
      }
      
      // Calculate the difference since last update
      const difference = currentWei.sub(lastWei);
      console.log('Difference since last update:', difference.toString());
      
      // Always add a point, even if difference is 0, to maintain time tracking
      const newPoint = {
        timestamp: currentTime,
        amount: difference.toString()
      };
      
      if (difference.gt(0)) {
        console.log('Adding new reward point:', newPoint);
        this.history.push(newPoint);
        this.lastAmount = currentWeiStr;
      } else {
        // For zero difference, just update the timestamp of the last point
        if (this.history.length > 0) {
          this.history[this.history.length - 1].timestamp = currentTime;
          console.log('Updated timestamp of last point to current time');
        } else {
          // Shouldn't happen, but just in case
          this.history.push(newPoint);
        }
      }
      
      // Clean up old entries
      this.cleanup();
      console.log('History after update:', this.history);
    } catch (error) {
      console.error('Error updating reward history:', error);
    }
  }
  
  /**
   * Get reward statistics
   */
  public getStats(): RewardStats {
    this.cleanup();
    this.initialize(); // Ensure we have data to show
    
    const now = Date.now();
    const fiveMinutesAgo = now - this.windowMs;
    const sessionDurationMs = now - this.startTime;
    const sessionDurationMinutes = Math.max(1, sessionDurationMs / (60 * 1000)); // At least 1 minute to avoid division by zero
    
    console.log('--- Getting Stats ---');
    console.log('Session duration (ms):', sessionDurationMs, 'minutes:', sessionDurationMinutes);
    console.log('Initial amount:', this.initialAmount, 'Last amount:', this.lastAmount);
    console.log('History points:', this.history.length);
    
    // Filter points within the time window
    const recentPoints = this.history.filter(p => p.timestamp >= fiveMinutesAgo);
    console.log('Recent points in window (5 min):', recentPoints.length);
    
    // Calculate total rewards in the window
    const totalRewards = recentPoints.reduce((sum: BigNumber, point: RewardPoint) => {
      return sum.add(BigNumber.from(point.amount));
    }, BigNumber.from(0));
    
    console.log('Total rewards in window (5 min):', utils.formatEther(totalRewards.toString()), 'MYST');
    
    // Calculate session total (since page was opened)
    let sessionTotal = BigNumber.from(0);
    if (this.initialAmount && this.lastAmount) {
      sessionTotal = BigNumber.from(this.lastAmount).sub(BigNumber.from(this.initialAmount));
      sessionTotal = sessionTotal.gt(0) ? sessionTotal : BigNumber.from(0);
    }
    
    console.log('Session total:', utils.formatEther(sessionTotal.toString()), 'MYST');
    
    // Calculate rewards per minute (average over the window)
    const minutesInWindow = 5;
    const perMinute = totalRewards.div(minutesInWindow);
    
    // Calculate session rate based on actual session duration
    let sessionPerMinute = BigNumber.from(0);
    if (sessionDurationMs > 0) {
      // Calculate rate per millisecond and scale to per minute (60,000 ms)
      sessionPerMinute = sessionTotal.mul(60000).div(sessionDurationMs);
    }
    
    console.log('Rate - 5 min window:', utils.formatEther(perMinute.toString()), 'MYST/min');
    console.log('Rate - Session avg:', utils.formatEther(sessionPerMinute.toString()), 'MYST/min');
    
    // Calculate estimated rewards per hour and per day
    const perHour = perMinute.mul(60);
    const perDay = perHour.mul(24);
    
    // Format values using the utility function
    const formatValue = (value: BigNumber, decimals: number = 6): string => {
      try {
        const num = parseFloat(utils.formatEther(value.toString()));
        return num.toFixed(decimals);
      } catch (e) {
        console.error('Error formatting value:', e);
        return '0';
      }
    };
    
    // Calculate raw values
    const sessionTotalNum = parseFloat(utils.formatEther(sessionTotal.toString()));
    const perMinuteNum = parseFloat(utils.formatEther(perMinute.toString()));
    const perHourNum = parseFloat(utils.formatEther(perHour.toString()));
    const perDayNum = parseFloat(utils.formatEther(perDay.toString()));
    const sessionPerMinuteNum = parseFloat(utils.formatEther(sessionPerMinute.toString()));
    
    console.log('--- End Stats ---');
    
    return {
      // Current session stats
      sessionTotal: sessionTotalNum,
      sessionDurationMinutes,
      sessionPerMinute: sessionPerMinuteNum,
      
      // Current rate stats (based on recent activity)
      currentRate: {
        perMinute: perMinuteNum,
        perHour: perHourNum,
        perDay: perDayNum
      },
      
      // Formatted values for display
      formatted: {
        sessionTotal: formatNumber(sessionTotalNum, 6),
        perMinute: formatNumber(perMinuteNum, 6),
        perHour: formatNumber(perHourNum, 2),
        perDay: formatNumber(perDayNum, 2)
      }
    };
  }
  
  /**
   * Clean up old entries outside the window
   */
  private cleanup(): void {
    const cutoff = Date.now() - this.windowMs;
    this.history = this.history.filter(point => point.timestamp >= cutoff);
  }
  
  /**
   * Reset the reward history to start a new session
   */
  public reset(): void {
    console.log('Resetting reward history');
    this.history = [];
    this.lastAmount = '0';
    this.initialAmount = null;
    this.startTime = Date.now();
    this.initialized = false;
    console.log('Reward history reset complete');
  }
  
  /**
   * Set the initial amount for reward tracking
   * @param amount Initial amount in wei or human-readable format
   */
  public setInitialAmount(amount: string | number): void {
    const weiAmount = this.toWeiString(amount);
    console.log('Setting initial amount to:', weiAmount);
    this.initialAmount = weiAmount;
    this.lastAmount = weiAmount;
    this.startTime = Date.now();
    this.initialized = true;
    console.log('Initial amount set, history length:', this.history.length);
  }
}

// Export a singleton instance of RewardHistory
export const rewardHistory = new RewardHistory();

export default RewardHistory;
