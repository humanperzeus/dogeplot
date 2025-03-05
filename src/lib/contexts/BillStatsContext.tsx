import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { getCachedBillStats, clearServerCaches } from '@/lib/api';

// Define the shape of our statistics data
// This context provides global statistics about bills
export interface BillStats {
  congress118Count: number;
  congress119Count: number;
  latestCutoffDate: string;
  isVectorized: boolean;
  lastRefreshed: string;
}

// Create a context with default values
export interface BillStatsContextType {
  stats: BillStats;
  loading: boolean;
  error: Error | null;
  refreshStats: () => Promise<void>;
}

// Default stats values to prevent UI jumps
const defaultStats: BillStats = {
  congress118Count: 0,
  congress119Count: 0,
  latestCutoffDate: new Date().toISOString().split('T')[0],
  isVectorized: false,
  lastRefreshed: new Date().toISOString()
};

// Create the context with default values
const BillStatsContext = createContext<BillStatsContextType>({
  stats: defaultStats,
  loading: false,
  error: null,
  refreshStats: async () => {}
});

// Provider component that will wrap the app
export const BillStatsProvider = ({ children }: { children: ReactNode }) => {
  const [stats, setStats] = useState<BillStats>(defaultStats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const canRefresh = (lastRefreshed: string): boolean => {
    const lastRefreshDate = new Date(lastRefreshed);
    const now = new Date();
    const hoursSinceLastRefresh = (now.getTime() - lastRefreshDate.getTime()) / (1000 * 60 * 60);
    return hoursSinceLastRefresh >= 24;
  };

  const fetchStats = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);

      if (forceRefresh) {
        // Clear server caches before fetching fresh data
        await clearServerCaches();
      }

      const freshStats = await getCachedBillStats();
      setStats(freshStats);
    } catch (err) {
      console.error('Error fetching bill stats:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch bill statistics'));
    } finally {
      setLoading(false);
    }
  };

  const refreshStats = async () => {
    if (!canRefresh(stats.lastRefreshed)) {
      console.log('Cannot refresh yet - 24 hour cooldown period not elapsed');
      return;
    }
    await fetchStats(true);
  };

  useEffect(() => {
    fetchStats();
    // Set up an interval to fetch stats every hour
    const interval = setInterval(() => {
      fetchStats();
    }, 60 * 60 * 1000); // 1 hour

    return () => clearInterval(interval);
  }, []);

  return (
    <BillStatsContext.Provider value={{ stats, loading, error, refreshStats }}>
      {children}
    </BillStatsContext.Provider>
  );
};

// Custom hook to use the bill stats context
export const useBillStats = () => {
  const context = useContext(BillStatsContext);
  if (!context) {
    throw new Error('useBillStats must be used within a BillStatsProvider');
  }
  return context;
};

// Export the context as default
export default BillStatsContext; 