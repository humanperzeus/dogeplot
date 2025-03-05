import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, FileText, Link2, Info, Smartphone, X } from 'lucide-react';
import type { Bill } from '@/types/supabase';
import { Button } from './ui/button';

// Maximum number of bills to show in the visualization
const MAX_VISUALIZATION_BILLS = 12;

interface SemanticBillGraphProps {
  bills: Bill[];
  centralBill?: Bill | null;
  onBillClick?: (bill: Bill) => void;
  similarityThreshold?: number;
}

const SemanticBillGraph: React.FC<SemanticBillGraphProps> = ({
  bills,
  centralBill = null,
  onBillClick,
  similarityThreshold = 0.2,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hoveredBill, setHoveredBill] = useState<Bill | null>(null);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  
  // Automatically select the first bill as the central bill if none is provided
  const [internalCentralBill, setInternalCentralBill] = useState<Bill | null>(null);
  
  // Filter bills for visualization (top bills by similarity)
  const visualizationBills = React.useMemo(() => {
    // Sort by similarity (highest first)
    const sortedBills = [...bills].sort((a, b) => {
      const simA = a.similarity || 0;
      const simB = b.similarity || 0;
      return simB - simA;
    });
    
    // Take only the top bills for visualization
    return sortedBills.slice(0, MAX_VISUALIZATION_BILLS);
  }, [bills]);
  
  // Update internal central bill when bills change
  useEffect(() => {
    if (!centralBill && visualizationBills.length > 0) {
      // Find the bill with highest similarity or use the first bill
      const highestSimilarityBill = visualizationBills.reduce((highest, current) => {
        const currentSim = current.similarity || 0;
        const highestSim = highest.similarity || 0;
        return currentSim > highestSim ? current : highest;
      }, visualizationBills[0]);
      
      setInternalCentralBill(highestSimilarityBill);
    } else {
      setInternalCentralBill(centralBill);
    }
  }, [visualizationBills, centralBill]);
  
  // Use internalCentralBill instead of centralBill in the component
  const effectiveCentralBill = internalCentralBill;

  // Detect if user is on mobile device
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      setIsMobile(mobile);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: Math.max(500, containerRef.current.offsetHeight),
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Calculate positions for the bills in a radial layout
  const getBillPositions = () => {
    const { width, height } = dimensions;
    const centerX = width / 2;
    const centerY = height / 2;
    
    // Adjust radius based on screen size for better mobile experience
    const radius = Math.min(width, height) * (isMobile ? 0.28 : 0.35);
    
    // If we have a central bill, place it in the center
    const positions: { [key: string]: { x: number; y: number; scale: number } } = {};
    
    if (effectiveCentralBill) {
      // Ensure the central bill is exactly at center
      positions[effectiveCentralBill.id] = { x: centerX, y: centerY, scale: 1.2 };
      
      // Place other bills in a circle around the central bill
      const otherBills = visualizationBills.filter(bill => bill.id !== effectiveCentralBill.id);
      otherBills.forEach((bill, index) => {
        const angle = (index / otherBills.length) * 2 * Math.PI;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        
        // Calculate scale based on similarity if available
        const similarity = bill.similarity || 0.5;
        const scale = 0.7 + similarity * 0.5; // Scale between 0.7 and 1.2 based on similarity
        
        positions[bill.id] = { x, y, scale };
      });
    } else {
      // If no central bill, arrange all bills in a circle
      visualizationBills.forEach((bill, index) => {
        const angle = (index / visualizationBills.length) * 2 * Math.PI;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        positions[bill.id] = { x, y, scale: 1 };
      });
    }
    
    return positions;
  };

  const positions = getBillPositions();

  // Format bill type and number
  const formatBillId = (bill: Bill) => {
    if (!bill.bill_type || !bill.bill_number) return 'Unknown';
    return `${bill.bill_type.toUpperCase()}${bill.bill_number}`;
  };

  // Calculate similarity percentage
  const getSimilarityPercentage = (bill: Bill) => {
    if (!bill.similarity) return null;
    return Math.round(bill.similarity * 100);
  };

  // Get color based on similarity
  const getSimilarityColor = (similarity: number | undefined) => {
    if (!similarity) return 'rgb(161, 161, 170)'; // zinc-400
    if (similarity > 0.7) return 'rgb(132, 204, 22)'; // lime-500
    if (similarity > 0.4) return 'rgb(234, 179, 8)';  // yellow-500
    return 'rgb(249, 115, 22)'; // orange-500
  };

  // Truncate text
  const truncateText = (text: string, maxLength: number) => {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  // Handle bill node click
  const handleBillClick = (bill: Bill) => {
    if (isMobile) {
      // On mobile, show detail panel instead of tooltip
      setSelectedBill(bill);
    } else {
      // On desktop, go straight to detailed view
      if (onBillClick) onBillClick(bill);
    }
  };

  return (
    <div className="glass-panel p-3 sm:p-6 mb-4 sm:mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-6 gap-2">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary-light" />
          <h3 className="text-base sm:text-lg font-bold gradient-text">Semantic Bill Network</h3>
          {bills.length > MAX_VISUALIZATION_BILLS && (
            <span className="text-xs text-zinc-400 bg-zinc-800/50 px-2 py-0.5 rounded">
              Showing top {MAX_VISUALIZATION_BILLS} of {bills.length} results
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isMobile && (
            <div className="flex items-center mr-2">
              <Smartphone className="h-4 w-4 text-primary-light mr-1" />
              <span className="text-xs text-zinc-400">Tap bills to explore</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span>Similarity: {similarityThreshold * 100}%+</span>
            <div className="h-1.5 w-16 bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary-light rounded-full"
                style={{ width: `${similarityThreshold * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {effectiveCentralBill && (
        <div className="mb-4 p-2 bg-primary-light/10 rounded text-sm text-zinc-300 flex gap-2 items-center">
          <span className="text-primary-light font-medium">Central Bill:</span>
          <span className="font-mono text-xs bg-primary-light/20 px-2 py-0.5 rounded">
            {formatBillId(effectiveCentralBill)}
          </span>
          <span className="text-zinc-400 text-xs line-clamp-1 flex-1">
            {truncateText(effectiveCentralBill.title || '', 60)}
          </span>
        </div>
      )}
      
      {/* Debug info */}
      {visualizationBills.length > 0 && !effectiveCentralBill && (
        <div className="mb-4 p-2 bg-red-900/20 border border-red-900/30 rounded text-sm text-red-300">
          Warning: No central bill selected. Found {visualizationBills.length} bills but couldn't determine central bill.
        </div>
      )}

      {visualizationBills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-lg text-zinc-400">No semantically related bills found</p>
          <p className="text-sm text-zinc-500 mt-2">Try adjusting the similarity threshold</p>
        </div>
      ) : (
        <div 
          ref={containerRef} 
          className="relative w-full h-[500px] sm:h-[600px] bg-zinc-900/30 rounded-lg overflow-hidden"
        >
          {/* Connection lines between bills - single SVG container for all lines */}
          {effectiveCentralBill && (
            <svg className="absolute top-0 left-0 w-full h-full z-10 pointer-events-none">
              {visualizationBills.map(bill => {
                if (bill.id === effectiveCentralBill.id) return null;
                const centralPos = positions[effectiveCentralBill.id];
                const billPos = positions[bill.id];
                
                // Make sure similarity is never undefined for line drawing
                const similarity = bill.similarity || 0.5;
                
                return (
                  <g key={`line-${bill.id}`}>
                    <line
                      x1={centralPos.x}
                      y1={centralPos.y}
                      x2={billPos.x}
                      y2={billPos.y}
                      stroke={getSimilarityColor(similarity)}
                      strokeWidth={1 + (similarity) * 3}
                      strokeOpacity={0.6}
                      strokeDasharray={similarity > 0.6 ? "none" : "5,5"}
                    />
                    {/* Small debug circles to show exact connection points */}
                    <circle 
                      cx={billPos.x} 
                      cy={billPos.y} 
                      r="2" 
                      fill="white" 
                      opacity="0.5"
                    />
                  </g>
                );
              })}
            </svg>
          )}
          
          {/* Bill nodes */}
          {visualizationBills.map(bill => {
            const position = positions[bill.id];
            const isCentral = effectiveCentralBill && bill.id === effectiveCentralBill.id;
            const similarityPct = getSimilarityPercentage(bill);
            
            return (
              <div
                key={bill.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${position.x}px`,
                  top: `${position.y}px`,
                  zIndex: isCentral ? 20 : 10
                }}
              >
                <motion.div
                  className={`cursor-pointer`}
                  style={{
                    transformOrigin: 'center center',
                  }}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ 
                    opacity: 1, 
                    scale: position.scale
                  }}
                  transition={{ 
                    type: "spring",
                    stiffness: 260,
                    damping: 20,
                    delay: isCentral ? 0 : 0.1 + Math.random() * 0.3
                  }}
                  onClick={() => handleBillClick(bill)}
                  onMouseEnter={() => !isMobile && setHoveredBill(bill)}
                  onMouseLeave={() => !isMobile && setHoveredBill(null)}
                >
                  <div 
                    className={`
                      relative p-3 rounded-lg 
                      ${isCentral 
                        ? 'bg-primary-light/20 border border-primary-light/40' 
                        : 'bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/40'}
                      transition-all duration-200 ease-in-out
                      ${hoveredBill?.id === bill.id || selectedBill?.id === bill.id ? 'shadow-lg shadow-primary-light/20' : ''}
                      ${isMobile ? 'touch-manipulation' : ''}
                    `}
                    style={{ 
                      width: isMobile ? (isCentral ? '140px' : '120px') : (isCentral ? '180px' : '150px'),
                    }}
                  >
                    {/* Central debug dot to show center point */}
                    <div className="absolute w-1 h-1 rounded-full bg-white opacity-50 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50" />
                    
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-primary-light" />
                        <span className="text-xs font-medium text-zinc-200">
                          {formatBillId(bill)}
                        </span>
                      </div>
                      {similarityPct !== null && !isCentral && (
                        <div 
                          className="px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                          style={{ 
                            backgroundColor: `${getSimilarityColor(bill.similarity)}20`,
                            color: getSimilarityColor(bill.similarity)
                          }}
                        >
                          {similarityPct}%
                        </div>
                      )}
                    </div>
                    
                    <h4 className="text-[11px] leading-tight text-zinc-300 mb-2 line-clamp-2 h-[28px]">
                      {truncateText(bill.title || 'Untitled Bill', isMobile ? 40 : 60)}
                    </h4>
                    
                    {isCentral && (
                      <div className="absolute -top-2 -right-2 bg-primary-light text-black text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                        Central
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            );
          })}
          
          {/* Hover tooltip (desktop only) */}
          {!isMobile && hoveredBill && (
            <div 
              className="absolute z-30 bg-zinc-900/95 border border-zinc-700 rounded-lg p-3 shadow-xl max-w-xs"
              style={{
                left: Math.min(positions[hoveredBill.id].x + 20, dimensions.width - 280),
                top: Math.min(positions[hoveredBill.id].y + 20, dimensions.height - 200),
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-zinc-200">
                  {formatBillId(hoveredBill)}
                </span>
                {hoveredBill.similarity && (
                  <div 
                    className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ 
                      backgroundColor: `${getSimilarityColor(hoveredBill.similarity)}20`,
                      color: getSimilarityColor(hoveredBill.similarity)
                    }}
                  >
                    {getSimilarityPercentage(hoveredBill)}% Similar
                  </div>
                )}
              </div>
              
              <h4 className="text-xs text-zinc-300 mb-2">
                {hoveredBill.title}
              </h4>
              
              {hoveredBill.summary && (
                <p className="text-[10px] text-zinc-400 line-clamp-3">
                  {hoveredBill.summary}
                </p>
              )}
              
              <div className="mt-2 text-[10px] text-primary-light">
                Click to view bill details
              </div>
            </div>
          )}
          
          {/* Mobile detail panel (overlays the visualization) */}
          <AnimatePresence>
            {isMobile && selectedBill && (
              <motion.div 
                className="absolute inset-0 z-40 bg-black/80 backdrop-blur-sm p-4 overflow-auto"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 max-w-md mx-auto my-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary-light" />
                      <h3 className="text-base font-medium text-zinc-100">
                        {formatBillId(selectedBill)}
                      </h3>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="h-8 w-8 p-0 rounded-full"
                      onClick={() => setSelectedBill(null)}
                    >
                      <X className="h-4 w-4 text-zinc-400" />
                    </Button>
                  </div>
                  
                  {selectedBill.similarity && (
                    <div className="mb-4 flex items-center">
                      <div 
                        className="px-3 py-1 rounded-full text-sm font-medium"
                        style={{ 
                          backgroundColor: `${getSimilarityColor(selectedBill.similarity)}20`,
                          color: getSimilarityColor(selectedBill.similarity)
                        }}
                      >
                        {getSimilarityPercentage(selectedBill)}% Similarity Match
                      </div>
                    </div>
                  )}
                  
                  <h4 className="text-sm text-zinc-200 mb-3 font-medium">
                    {selectedBill.title}
                  </h4>
                  
                  {selectedBill.summary && (
                    <div className="mb-4">
                      <h5 className="text-xs text-zinc-400 mb-1">Summary</h5>
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        {selectedBill.summary}
                      </p>
                    </div>
                  )}
                  
                  <div className="flex flex-wrap gap-2 mb-4">
                    {selectedBill.policy_area && (
                      <div className="px-2 py-1 rounded-full text-xs bg-zinc-800 text-zinc-300">
                        {selectedBill.policy_area}
                      </div>
                    )}
                    <div className="px-2 py-1 rounded-full text-xs bg-zinc-800 text-zinc-300">
                      {selectedBill.congress}th Congress
                    </div>
                    <div className="px-2 py-1 rounded-full text-xs bg-zinc-800 text-zinc-300">
                      {selectedBill.cosponsors_count || 0} Sponsors
                    </div>
                  </div>
                  
                  <Button 
                    className="w-full bg-primary-light hover:bg-primary-light/90 text-black"
                    onClick={() => {
                      setSelectedBill(null);
                      if (onBillClick) onBillClick(selectedBill);
                    }}
                  >
                    View Full Bill Details
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
      
      <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-zinc-500 gap-2">
        <div className="flex items-center gap-1">
          <Info className="h-3.5 w-3.5" />
          <span>{isMobile ? "Tap" : "Hover over"} bills to see details. {isMobile ? "Tap 'View Details'" : "Click"} for full analysis.</span>
        </div>
        <div className="flex items-center gap-2">
          <span>Line thickness indicates similarity strength</span>
          <Link2 className="h-3.5 w-3.5" />
        </div>
      </div>
    </div>
  );
};

export default SemanticBillGraph; 