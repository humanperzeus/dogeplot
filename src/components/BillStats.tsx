import React, { useState, useEffect } from "react";
import { Loader2, Database, Calendar, Zap, FileText, BarChart2, RefreshCw } from "lucide-react";
import { useBillStats } from "@/lib/contexts/BillStatsContext";
import { Button } from "./ui/button";

const BillStats: React.FC = () => {
  // Use our custom hook to get stats from context
  const { stats, loading, error, refreshStats } = useBillStats();
  
  // Animation states
  const [animatedTotal, setAnimatedTotal] = useState(0);
  const [animatedCongress118, setAnimatedCongress118] = useState(0);
  const [animatedCongress119, setAnimatedCongress119] = useState(0);
  const [isAnimated, setIsAnimated] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const canRefresh = new Date(stats.lastRefreshed).getTime() + 24 * 60 * 60 * 1000 <= Date.now();

  // Start animation when stats are loaded
  useEffect(() => {
    if (!loading && stats) {
      const totalBills = stats.congress118Count + stats.congress119Count;
      
      // Animate from 0 to actual values over 1.5 seconds
      const duration = 1500;
      const startTime = Date.now();
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function for a smoother animation
        const easeOutQuad = (t: number) => t * (2 - t);
        const easedProgress = easeOutQuad(progress);
        
        setAnimatedTotal(Math.round(totalBills * easedProgress));
        setAnimatedCongress118(Math.round(stats.congress118Count * easedProgress));
        setAnimatedCongress119(Math.round(stats.congress119Count * easedProgress));
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setIsAnimated(true);
        }
      };
      
      animate();
    }
  }, [loading, stats]);

  // Format date to US format MM/DD/YYYY
  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return `CUTOFF DATE: ${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear()}`;
  };

  // Handle refresh click
  const handleRefresh = async () => {
    if (!canRefresh) return;
    setIsRefreshing(true);
    try {
      await refreshStats();
      // Reset animation to show new numbers
      setIsAnimated(false);
    } finally {
      setIsRefreshing(false);
    }
  };
  
  // Format short date (for mobile)
  const formatShortDate = (dateString: string) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    
    // Very compact format for small screens
    return date.toLocaleDateString("en-US", { 
      month: "numeric", 
      day: "numeric", 
      year: "2-digit" 
    });
  };

  // Calculate total bills
  const totalBills = stats ? stats.congress118Count + stats.congress119Count : 0;
  
  // Format numbers with commas
  const formatNumber = (num: number) => {
    if (!num) return '0';
    return num.toLocaleString();
  };

  return (
    <div className="glass-panel p-2 sm:p-3 md:p-4 mb-3 sm:mb-5 bg-zinc-900/60 backdrop-blur-sm border border-zinc-800/50 rounded-lg shadow-lg">
      {loading ? (
        <div className="flex items-center justify-center h-full py-2">
          <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin text-primary-light mr-2" />
          <span className="text-xs sm:text-sm text-zinc-300 font-medium">Loading statistics...</span>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-full py-2">
          <span className="text-xs sm:text-sm text-zinc-400">Unable to load statistics</span>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6">
          {/* Header Section */}
          <div className="flex items-center gap-2 sm:border-r border-zinc-800/80 pr-0 sm:pr-6">
            <div className="bg-primary-light/10 p-1.5 sm:p-2 rounded-lg">
              <Database className="h-4 w-4 sm:h-5 sm:w-5 text-primary-light" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-semibold text-zinc-200">Bill Statistics</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-6 w-6 hover:bg-primary-light/10 ${!canRefresh || isRefreshing ? 'cursor-not-allowed opacity-50' : ''}`}
                  onClick={handleRefresh}
                  disabled={!canRefresh || isRefreshing || loading}
                  title={canRefresh ? 'Refresh statistics' : 'Can refresh again in 24 hours'}
                >
                  <RefreshCw 
                    className={`h-3 w-3 text-primary-light ${isRefreshing || loading ? 'animate-spin' : ''}`}
                  />
                </Button>
              </div>
              <span className="text-[10px] text-zinc-400 hidden sm:block">
                {formatDate(stats.lastRefreshed)}
              </span>
            </div>
          </div>
          
          {/* Stats Grid - Responsive Layout */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 w-full sm:w-auto">
            {/* Total Bills */}
            <div className="flex flex-col p-2 sm:p-3 bg-zinc-800/30 rounded-lg hover:bg-zinc-800/50 transition-colors">
              <span className="text-[10px] text-zinc-400 flex items-center gap-1.5">
                <BarChart2 className="h-3 w-3 text-primary-light" />
                Total Bills
              </span>
              <span className="text-sm sm:text-base font-bold text-primary-light">
                {isAnimated ? formatNumber(totalBills) : formatNumber(animatedTotal)}
              </span>
            </div>
            
            {/* 118th Congress */}
            <div className="flex flex-col p-2 sm:p-3 bg-zinc-800/30 rounded-lg hover:bg-zinc-800/50 transition-colors">
              <span className="text-[10px] text-zinc-400 flex items-center gap-1.5">
                <FileText className="h-3 w-3 text-primary-light" />
                118th Congress
              </span>
              <span className="text-sm sm:text-base font-bold text-zinc-200">
                {isAnimated ? formatNumber(stats.congress118Count) : formatNumber(animatedCongress118)}
              </span>
            </div>
            
            {/* 119th Congress */}
            <div className="flex flex-col p-2 sm:p-3 bg-zinc-800/30 rounded-lg hover:bg-zinc-800/50 transition-colors">
              <span className="text-[10px] text-zinc-400 flex items-center gap-1.5">
                <FileText className="h-3 w-3 text-primary-light" />
                119th Congress
              </span>
              <span className="text-sm sm:text-base font-bold text-zinc-200">
                {isAnimated ? formatNumber(stats.congress119Count) : formatNumber(animatedCongress119)}
              </span>
            </div>
            
            {/* AI Status */}
            <div className="flex flex-col p-2 sm:p-3 bg-zinc-800/30 rounded-lg hover:bg-zinc-800/50 transition-colors">
              <span className="text-[10px] text-zinc-400 flex items-center gap-1.5">
                <Zap className="h-3 w-3 text-primary-light" />
                All Bills Vectorized
              </span>
              <span className="text-sm sm:text-base font-bold text-zinc-200">
                {stats.isVectorized ? (
                  <span className="text-emerald-400">Yes</span>
                ) : (
                  <span className="text-zinc-500">No</span>
                )}
              </span>
            </div>
          </div>
          
          {/* Mobile-only update info */}
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 sm:hidden mt-1">
            <Calendar className="h-3 w-3 text-zinc-500" />
            {formatDate(stats.lastRefreshed)}
          </div>
        </div>
      )}
    </div>
  );
};

export default BillStats; 