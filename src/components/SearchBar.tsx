import React, { useCallback, useState, useEffect, useRef } from "react";
import { Input } from "./ui/input";
import { Search, Loader2 } from "lucide-react";
import debounce from "lodash/debounce";
import { Switch } from "./ui/switch";
import { Slider } from "./ui/slider";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Settings } from "lucide-react";

interface SearchBarProps {
  onSearch: (term: string) => void;
  onSemanticSearch?: (query: string, threshold: number) => void;
  onFilterChange: (filters: {
    showActive: boolean;
    showIntroduced: boolean;
    year: string;
    billType: string;
    showWithText: boolean;
    showWithPdf: boolean;
    status: string;
    chamber: string;
  }) => void;
  filters: {
    showActive: boolean;
    showIntroduced: boolean;
    year: string;
    billType: string;
    showWithText: boolean;
    showWithPdf: boolean;
    status: string;
    chamber: string;
  };
  availableCongressYears?: string[];
  isLoading?: boolean;
}

const SearchBar: React.FC<SearchBarProps> = ({ 
  onSearch, 
  onSemanticSearch,
  onFilterChange, 
  filters,
  availableCongressYears = [],
  isLoading = false
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isSemanticMode, setIsSemanticMode] = useState(false);
  const [semanticThreshold, setSemanticThreshold] = useState(0.25);
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState(filters);
  const debounceTimerRef = useRef(null);
  // Add a ref to track if semantic search is already in progress
  const semanticSearchInProgressRef = useRef(false);

  // Create a debounced search function
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce((term: string) => {
      console.log('🔍 Debounced search triggered with:', term);
      onSearch(term);
    }, 350), // 350ms debounce delay - good balance between responsiveness and performance
    [onSearch]
  );

  // Cleanup debounced function on unmount
  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  const handleSearchTermChange = (e) => {
    const newTerm = e.target.value;
    setSearchTerm(newTerm);
    
    // Trigger regular search automatically when not in semantic mode
    if (!isSemanticMode) {
      debouncedSearch(newTerm);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    
    // Cancel any pending debounced searches
    debouncedSearch.cancel();
    
    // For semantic search
    if (isSemanticMode) {
      // Don't search if already in progress or no search term
      if (semanticSearchInProgressRef.current || !searchTerm.trim()) return;
      
      console.log('🔍 AI search button clicked:', searchTerm);
      semanticSearchInProgressRef.current = true;
      
      // Use a small timeout to ensure UI updates first - the BillFeed component will check the cache
      setTimeout(() => {
        onSemanticSearch(searchTerm, semanticThreshold);
        // Reset flag after execution
        semanticSearchInProgressRef.current = false;
      }, 100);
    } else {
      // For regular search
      console.log('🔍 Regular search submitted:', searchTerm);
      onSearch(searchTerm);
    }
  };

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleSemanticToggleChange = (checked: boolean) => {
    // Prevent multiple searches if we're already in the requested mode
    if (checked === isSemanticMode) return;
    
    // Update mode first
    setIsSemanticMode(checked);
    
    // Cancel any pending debounced searches
    debouncedSearch.cancel();
    
    // Prevent multiple semantic searches
    if (semanticSearchInProgressRef.current) return;
    
    // When toggling, perform appropriate search based on the new mode
    if (checked) {
      // Switching to semantic mode
      semanticSearchInProgressRef.current = true;
      
      // If there's a search term, use it; otherwise use "latest bills"
      const query = searchTerm.trim() || "latest bills";
      console.log('🔍 Switching to AI search mode with query:', query);
      
      // Use a small timeout to ensure UI updates first - the BillFeed component will check the cache
      setTimeout(() => {
        onSemanticSearch(query, semanticThreshold);
        // Reset flag after execution
        semanticSearchInProgressRef.current = false;
      }, 100);
    } else {
      // Switching to regular mode - perform regular search
      console.log('🔍 Switching to regular search mode');
      onSearch(searchTerm);
    }
  };

  const handleThresholdChange = (values: number[]) => {
    const threshold = values[0];
    setSemanticThreshold(threshold);
    // Don't automatically trigger search when changing threshold
  };

  const handleFilterChange = (key: keyof typeof filters, value: any) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const sortedCongressYears = [...availableCongressYears].sort((a, b) => Number(b) - Number(a));

  // Initial regular search on component mount
  useEffect(() => {
    // Only run on initial mount
    console.log('🔍 Running initial regular search');
    // Use a small timeout to ensure the UI is rendered first
    setTimeout(() => {
      onSearch("");
    }, 100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper function to display the default search term when semantic search is triggered with empty query
  const getPlaceholderOrDefault = () => {
    if (isLoading && isSemanticMode && !searchTerm) {
      return "latest bills";
    }
    return isSemanticMode
      ? "AI search (e.g. 'bills about climate change')" 
      : "Search bills by title or keyword...";
  };

  return (
    <div className="glass-panel p-3 sm:p-4">
      <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3 items-start">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <Input
            type="text"
            placeholder={getPlaceholderOrDefault()}
            onChange={handleSearchTermChange}
            className="pl-10 bg-zinc-800/50 border-zinc-700 text-zinc-300 placeholder:text-zinc-500 text-sm sm:text-base w-full"
            value={searchTerm}
          />
          {isLoading && isSemanticMode && !searchTerm && (
            <div className="absolute right-3 top-2 text-xs text-primary-light/70 italic max-w-[150px] sm:max-w-none truncate">
              Searching for "latest bills"...
            </div>
          )}
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Search button - only visible in semantic mode */}
          {isSemanticMode && (
            <Button 
              type="submit"
              variant="default" 
              size="sm" 
              className="h-8 bg-primary-light/80 hover:bg-primary-light/90 border border-primary-light/30 flex-shrink-0"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  <span className="whitespace-nowrap">Searching...</span>
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-1" />
                  <span className="whitespace-nowrap">AI Search</span>
                </>
              )}
            </Button>
          )}
          
          <div className="flex items-center space-x-2 flex-shrink-0">
            <Switch
              id="semantic-search"
              checked={isSemanticMode}
              onCheckedChange={handleSemanticToggleChange}
              className={isSemanticMode ? "data-[state=checked]:bg-primary-light" : ""}
              disabled={isLoading}
            />
            <label htmlFor="semantic-search" className="text-xs sm:text-sm cursor-pointer flex items-center">
              <span className={isSemanticMode ? "text-primary-light font-medium" : "text-zinc-300"}>
                AI Search
              </span>
              {isSemanticMode ? (
                <span className="text-[10px] bg-primary-light/20 text-primary-light px-1 py-0.5 rounded ml-1 flex items-center">
                  {isLoading ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      <span className="whitespace-nowrap">SEARCHING</span>
                    </>
                  ) : (
                    'ON'
                  )}
                </span>
              ) : (
                <span className="text-[10px] bg-zinc-700/50 text-zinc-400 px-1 py-0.5 rounded ml-1">
                  OFF
                </span>
              )}
            </label>
          </div>
          
          <Popover open={isAdvancedFiltersOpen} onOpenChange={setIsAdvancedFiltersOpen}>
            <PopoverTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 px-2 bg-zinc-800/50 border-zinc-700 ml-auto md:ml-0 flex-shrink-0"
                type="button"
              >
                <Settings className="h-4 w-4 text-zinc-400" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] sm:w-80 bg-zinc-900 border-zinc-700">
              <div className="space-y-4">
                <h4 className="font-medium text-zinc-300 text-sm flex items-center">
                  <span className="text-primary-light mr-1.5">AI</span> 
                  Search Settings
                </h4>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <label className="text-xs text-zinc-400">Similarity Threshold</label>
                    <span className="text-xs font-medium" style={{ color: `hsl(${semanticThreshold * 100}, 80%, 60%)` }}>
                      {(semanticThreshold * 100).toFixed(0)}%
                    </span>
                  </div>
                  <Slider
                    value={[semanticThreshold]}
                    min={0.1}
                    max={0.9}
                    step={0.05}
                    onValueChange={handleThresholdChange}
                    disabled={!isSemanticMode}
                    className="data-[disabled=false]:bg-primary-light/10"
                  />
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>More Results</span>
                    <span>Higher Accuracy</span>
                  </div>
                </div>
                
                <div className="text-xs text-zinc-400 bg-zinc-800/50 p-2 rounded">
                  <p className="text-primary-light/90 font-medium mb-1">About AI Search</p>
                  <p>AI search finds bills based on meaning, not just keywords.</p>
                  <p className="mt-1">• Lower threshold: More results, broader matches</p>
                  <p className="mt-1">• Higher threshold: Fewer, more precise results</p>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        
        {/* Loading indicator for semantic search */}
        {isSemanticMode && isLoading && (
          <div className="w-full mt-3 p-3 border border-primary-light/20 bg-primary-light/5 rounded-md flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <div className="h-8 w-8 rounded-full border-2 border-primary-light/20 border-t-primary-light animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Search className="h-3 w-3 text-primary-light" />
              </div>
            </div>
            <div className="min-w-0">
              <p className="font-medium text-primary-light text-sm truncate">AI Search in progress</p>
              <p className="text-xs text-zinc-400 truncate">Finding semantically similar bills based on your query...</p>
            </div>
          </div>
        )}
      </form>

      <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 flex-wrap">
        {isSemanticMode && (
          <div className="flex items-center bg-primary-light/10 text-primary-light text-xs px-3 py-1.5 rounded-full">
            <span className="mr-1">AI Search Mode</span>
            <span className="text-[10px] bg-primary-light/20 px-1.5 py-0.5 rounded">
              {(semanticThreshold * 100).toFixed(0)}% Threshold
            </span>
          </div>
        )}
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center space-x-2 text-xs sm:text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={filters.showWithText}
              onChange={(e) => handleFilterChange('showWithText', e.target.checked)}
              className="rounded border-zinc-700 bg-zinc-800/50"
            />
            <span>Bills with Text</span>
          </label>
          <label className="flex items-center space-x-2 text-xs sm:text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={filters.showWithPdf}
              onChange={(e) => handleFilterChange('showWithPdf', e.target.checked)}
              className="rounded border-zinc-700 bg-zinc-800/50"
            />
            <span>Bills with PDF</span>
          </label>
        </div>
        
        <div className="flex flex-wrap gap-4 w-full sm:w-auto">
          <select
            value={filters.year}
            onChange={(e) => handleFilterChange('year', e.target.value)}
            className="bg-zinc-800/50 border border-zinc-700 rounded px-3 py-1 text-xs sm:text-sm text-zinc-300 w-full sm:w-auto"
          >
            <option value="all">All Congresses</option>
            {sortedCongressYears.map((year) => (
              <option key={year} value={year}>
                {year}th Congress ({Number(year) * 2 + 1787}-{Number(year) * 2 + 1788})
              </option>
            ))}
          </select>
          <select
            value={filters.chamber}
            onChange={(e) => handleFilterChange('chamber', e.target.value)}
            className="bg-zinc-800/50 border border-zinc-700 rounded px-3 py-1 text-xs sm:text-sm text-zinc-300 w-full sm:w-auto"
          >
            <option value="all">All Chambers</option>
            <option value="house">House</option>
            <option value="senate">Senate</option>
          </select>
          <select
            value={filters.billType}
            onChange={(e) => handleFilterChange('billType', e.target.value)}
            className="bg-zinc-800/50 border border-zinc-700 rounded px-3 py-1 text-xs sm:text-sm text-zinc-300 w-full sm:w-auto"
          >
            <option value="all">All Types</option>
            <optgroup label="Bills">
              <option value="bill">Bills (H.R. / S.)</option>
            </optgroup>
            <optgroup label="Resolutions">
              <option value="simple-resolution">Simple Resolutions (H.Res. / S.Res.)</option>
              <option value="joint-resolution">Joint Resolutions (H.J.Res. / S.J.Res.)</option>
              <option value="concurrent-resolution">Concurrent Resolutions (H.Con.Res. / S.Con.Res.)</option>
            </optgroup>
            <optgroup label="Amendments">
              <option value="amendment">Amendments (H.Amdt. / S.Amdt.)</option>
            </optgroup>
          </select>
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="bg-zinc-800/50 border border-zinc-700 rounded px-3 py-1 text-xs sm:text-sm text-zinc-300 w-full sm:w-auto"
          >
            <option value="all">All Statuses</option>
            <optgroup label="Initial States">
              <option value="introduced">Introduced</option>
              <option value="referred_to_committee">Referred to Committee</option>
              <option value="reported_by_committee">Reported by Committee</option>
            </optgroup>
            <optgroup label="Progress States">
              <option value="passed_chamber">Passed Chamber</option>
              <option value="passed_both_chambers">Passed Both Chambers</option>
              <option value="presented_to_president">Presented to President</option>
            </optgroup>
            <optgroup label="Final States">
              <option value="signed_into_law">Signed into Law</option>
              <option value="vetoed">Vetoed</option>
              <option value="veto_overridden">Veto Overridden</option>
              <option value="failed">Failed</option>
            </optgroup>
          </select>
        </div>
      </div>
    </div>
  );
};

export default SearchBar;
