import { supabase } from "./supabase";
import type { Bill } from "@/types/supabase";
import { billCache, searchResultsCache, billStatsCache } from "./cache";

// Get the base API URL based on environment
const API_URL = (() => {
  // Log environment for debugging
  console.log('Environment Mode:', import.meta.env.MODE);
  console.log('VITE_MODE:', import.meta.env.VITE_MODE);
  console.log('Is Development:', import.meta.env.DEV);
  
  // In development, always use localhost
  if (import.meta.env.DEV) {
    return 'http://localhost:3001';
  }
  
  // In production/staging, always use the current origin
  // This ensures the proxy works correctly in all environments
  return window.location.origin;
})();

// Add proxy function for PDFs
export async function proxyPdf(url: string): Promise<Response> {
  const proxyEndpoint = `${API_URL}/proxy/pdf`;
  console.log('Proxying PDF request to:', proxyEndpoint);
  console.log('Original PDF URL:', url);
  
  try {
    // Properly encode the URL parameter
    const encodedUrl = encodeURIComponent(url);
    const proxyUrl = `${proxyEndpoint}?url=${encodedUrl}`;
    
    const response = await fetch(proxyUrl, {
      // Use cors mode to allow cross-origin requests
      mode: 'cors',
      credentials: 'include',
      headers: {
        'Accept': 'application/pdf,application/octet-stream,*/*'
      }
    });
    
    if (!response.ok) {
      console.error('Proxy request failed:', {
        status: response.status,
        statusText: response.statusText,
        url: proxyUrl
      });
      throw new Error('Failed to proxy PDF');
    }
    
    console.log('Proxy request successful');
    return response;
  } catch (error) {
    console.error('Error in proxyPdf:', error);
    throw error;
  }
}

interface FetchBillsParams {
  page?: number;
  limit?: number;
  filters?: {
    year?: string;
    billType?: string;
    status?: string;
    chamber?: string;
    showWithText?: boolean;
    showWithPdf?: boolean;
  };
  searchQuery?: string;
  billIds?: string[];
}

interface FetchBillsResponse {
  bills: Bill[];
  total: number;
  hasMore: boolean;
}

// Fetch bills with pagination and filters
export const fetchBills = async ({
  page = 1,
  limit = 25,
  filters = {},
  searchQuery = '',
  billIds = []
}: FetchBillsParams): Promise<FetchBillsResponse> => {
  try {
    // If fetching specific bill IDs, bypass cache
    if (billIds && billIds.length > 0) {
      return await fetchBillsFromDatabase({ page, limit, filters, searchQuery, billIds });
    }

    // Generate cache key based on parameters
    const cacheKey = JSON.stringify({ page, limit, filters, searchQuery });
    
    // Check if we have this result in cache
    const cachedResult = searchResultsCache.get(cacheKey);
    if (cachedResult) {
      console.log('🔄 Using cached bills data');
      return cachedResult;
    }
    
    // Fetch from database if no cache available
    const result = await fetchBillsFromDatabase({ page, limit, filters, searchQuery, billIds });
    
    // Cache the result
    searchResultsCache.set(cacheKey, result);
    
    return result;
  } catch (error) {
    console.error('Error in fetchBills:', error);
    return { bills: [], total: 0, hasMore: false };
  }
};

// The original fetchBills implementation, renamed to fetchBillsFromDatabase
async function fetchBillsFromDatabase({
  page = 1,
  limit = 25,
  filters = {},
  searchQuery = '',
  billIds = []
}: FetchBillsParams): Promise<FetchBillsResponse> {
  try {
    // Temporarily revert back to selecting all fields to fix the display issue
    // We'll use a more targeted approach once we identify exactly which fields are needed
    let query = supabase
      .from('bills')
      .select('*', { count: 'exact' });

    if (billIds && billIds.length > 0) {
      console.log(`Fetching ${billIds.length} specific bills by ID`);
      query = query.in('id', billIds);
    } else {
      // Apply regular filters only if not fetching by ID
      
      // Apply filters
      if (filters.year && filters.year !== 'all') {
        query = query.eq('congress', filters.year);
      }

      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      if (filters.showWithText) {
        query = query.eq('has_full_text', true);
      }

      if (filters.showWithPdf) {
        query = query.not('pdf_url', 'is', null);
      }

      if (filters.chamber && filters.chamber !== 'all') {
        if (filters.chamber === 'house') {
          query = query.ilike('bill_type', 'h%');
        } else if (filters.chamber === 'senate') {
          query = query.ilike('bill_type', 's%');
        }
      }

      // Apply bill type filters
      if (filters.billType && filters.billType !== 'all') {
        switch (filters.billType) {
          case 'bill':
            query = query.in('bill_type', ['hr', 's']);
            break;
          case 'simple-resolution':
            query = query.in('bill_type', ['hres', 'sres']);
            break;
          case 'joint-resolution':
            query = query.in('bill_type', ['hjres', 'sjres']);
            break;
          case 'concurrent-resolution':
            query = query.in('bill_type', ['hconres', 'sconres']);
            break;
          case 'amendment':
            query = query.in('bill_type', ['hamdt', 'samdt']);
            break;
        }
      }

      // Apply search query with improved handling
      if (searchQuery.trim()) {
        const cleanQuery = searchQuery.trim().toLowerCase();
        console.log('Search query:', cleanQuery);
        
        // First try to match bill pattern (e.g., "hres", "hres1", "hres146")
        const billPattern = cleanQuery.match(/^([a-z]+)(\d*)$/);
        
        if (billPattern) {
          const billType = billPattern[1];
          const billNumber = billPattern[2] || '';
          
          // Check bill type
          if (['hr', 's', 'hres', 'sres', 'hjres', 'sjres', 'hconres', 'sconres'].includes(billType)) {
            if (billNumber) {
              query = query
                .eq('bill_type', billType)
                .eq('bill_number', billNumber);
            } else {
              query = query.eq('bill_type', billType);
            }
          } else {
            // Not a valid bill type, search in title
            query = query.ilike('title', `%${cleanQuery}%`);
          }
        } else {
          // Not a bill pattern, search in title
          query = query.ilike('title', `%${cleanQuery}%`);
        }
      }
    }

    const offset = (page - 1) * limit;
    
    // Execute the query
    const { data, error, count } = await query
      .order('introduction_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    // Add extra logging to help debug
    console.log(`📊 Fetched ${data?.length || 0} bills from database`);
    if (data && data.length > 0) {
      console.log('Sample bill data:', data[0]);
    }

    // We'll reimplement selective field projection once we identify the specific issue
    return {
      bills: data || [],
      total: count || 0,
      hasMore: count ? offset + limit < count : false
    };
  } catch (error) {
    console.error('Error fetching bills from database:', error);
    throw error;
  }
}

// Fetch unique congress years (can be cached)
export const fetchCongressYears = async (): Promise<string[]> => {
  try {
    // Only select the congress field instead of all fields
    const { data, error } = await supabase
      .from('bills')
      .select('congress')
      .order('congress', { ascending: false });

    if (error) {
      throw new Error('Failed to fetch congress years');
    }

    // Create a Set of unique years and convert back to array for deduplication
    const uniqueYears = Array.from(new Set(data?.map(d => d.congress) || []));
    
    console.log(`📅 Fetched ${uniqueYears.length} unique congress years`);
    
    return uniqueYears;
  } catch (error) {
    console.error('Error fetching congress years:', error);
    return [];
  }
};

// Define server-side memory caches
// These will persist between requests but will be cleared if server restarts
let billStatsMemoryCache: {
  data: {
    congress118Count: number;
    congress119Count: number;
    latestCutoffDate: string;
    isVectorized: boolean;
  } | null;
  lastUpdated: number;
} = { data: null, lastUpdated: 0 };

let trendingBillsMemoryCache: {
  data: Bill[] | null;
  lastUpdated: number;
} = { data: null, lastUpdated: 0 };

// Cache TTL (24 hours in milliseconds)
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Define cache TTL constants
const SERVER_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLIENT_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Constants for cache keys
const TRENDING_BILLS_CACHE_KEY = 'trending_bills';
const BILL_STATS_CACHE_KEY = 'bill_stats';

// Flag to track if server-side caching is available
let isServerCacheAvailable = false;

/**
 * Initialize the caching system - call this once during application startup
 */
export const initCacheSystem = async (): Promise<void> => {
  try {
    console.log('🔄 Initializing caching system...');
    
    // Check if the cached_statistics table exists
    const { error: tableCheckError } = await supabase
      .from('cached_statistics')
      .select('id')
      .limit(1);
    
    // If no error, table exists and we have permission
    if (!tableCheckError) {
      console.log('✅ Server-side caching is available');
      isServerCacheAvailable = true;
      return;
    }
    
    // If error code is 42P01 (relation does not exist), table might need to be created
    if (tableCheckError.code === '42P01') {
      console.warn('⚠️ cached_statistics table does not exist - server caching disabled');
      isServerCacheAvailable = false;
      return;
    }
    
    // Permission error (42501)
    if (tableCheckError.code === '42501') {
      console.warn('⚠️ Permission denied for cached_statistics table - server caching disabled');
      isServerCacheAvailable = false;
      return;
    }
    
    // Unknown error
    console.error('❌ Unexpected error checking cache table:', tableCheckError);
    isServerCacheAvailable = false;
  } catch (error) {
    console.error('❌ Error initializing cache system:', error);
    isServerCacheAvailable = false;
  }
};

/**
 * Get data from server cache in Supabase
 * Now checks the isServerCacheAvailable flag
 */
async function getFromServerCache<T>(cacheKey: string): Promise<{ data: T | null, found: boolean }> {
  try {
    // Skip server cache if not available
    if (!isServerCacheAvailable) {
      return { data: null, found: false };
    }
    
    // Try to get from cache
    const { data: cachedData, error: cacheError } = await supabase
      .from('cached_statistics')
      .select('data, expires_at')
      .eq('id', cacheKey)
      .single();
    
    // If we have valid cache that hasn't expired, return it
    if (!cacheError && cachedData && new Date(cachedData.expires_at) > new Date()) {
      console.log(`🔄 Using server cache for ${cacheKey}`);
      return { data: cachedData.data as T, found: true };
    }
    
    return { data: null, found: false };
  } catch (error) {
    console.warn(`Error accessing server cache for ${cacheKey}:`, error);
    return { data: null, found: false };
  }
}

/**
 * Store data in server cache in Supabase
 * Now checks the isServerCacheAvailable flag
 */
async function storeInServerCache<T>(cacheKey: string, data: T): Promise<boolean> {
  try {
    // Skip server cache if not available
    if (!isServerCacheAvailable) {
      return false;
    }
    
    // Calculate expiration time (24 hours from now)
    const expiresAt = new Date();
    expiresAt.setTime(expiresAt.getTime() + SERVER_CACHE_TTL_MS);
    
    // Store in cache (upsert to update if exists or insert if not)
    const { error: upsertError } = await supabase
      .from('cached_statistics')
      .upsert({
        id: cacheKey,
        data: data,
        expires_at: expiresAt.toISOString()
      });
    
    if (upsertError) {
      console.warn(`Error updating server cache for ${cacheKey}:`, upsertError);
      return false;
    }
    
    console.log(`📦 Server cache updated for ${cacheKey}`);
    return true;
  } catch (error) {
    console.warn(`Error storing in server cache for ${cacheKey}:`, error);
    return false;
  }
}

/**
 * Get data from client cache in localStorage
 */
function getFromClientCache<T>(cacheKey: string): { data: T | null, found: boolean } {
  try {
    const localStorageKey = `cache-${cacheKey}`;
    const cachedData = localStorage.getItem(localStorageKey);
    
    if (cachedData) {
      const { data, timestamp } = JSON.parse(cachedData);
      const now = Date.now();
      const cacheAge = now - timestamp;
      
      // If cache is valid and not expired (12 hour TTL)
      if (data && cacheAge < CLIENT_CACHE_TTL_MS) {
        console.log(`📱 Using client cache for ${cacheKey} (age: ${Math.round(cacheAge/1000/60)} minutes)`);
        return { data, found: true };
      } else {
        console.log(`📱 Client cache expired for ${cacheKey} (age: ${Math.round(cacheAge/1000/60)} minutes)`);
      }
    }
    
    return { data: null, found: false };
  } catch (error) {
    console.warn(`Error accessing client cache for ${cacheKey}:`, error);
    return { data: null, found: false };
  }
}

/**
 * Store data in client cache in localStorage
 */
function storeInClientCache<T>(cacheKey: string, data: T): boolean {
  try {
    const localStorageKey = `cache-${cacheKey}`;
    localStorage.setItem(localStorageKey, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
    console.log(`📱 Client cache updated for ${cacheKey}`);
    return true;
  } catch (error) {
    console.warn(`Error storing in client cache for ${cacheKey}:`, error);
    return false;
  }
}

/**
 * Get trending bills with dual caching (server + client)
 * @returns List of trending bills
 */
export const fetchTrendingBills = async (): Promise<Bill[]> => {
  // Initialize caching system if not done already
  if (!isServerCacheAvailable) {
    await initCacheSystem();
  }
  
  // Define a constant for the number of trending bills
  const TRENDING_BILLS_LIMIT = 3;

  try {
    // Force clear any existing cache to ensure our new limit takes effect
    try {
      // Clear client cache
      localStorage.removeItem(`cache-${TRENDING_BILLS_CACHE_KEY}`);
      
      // Clear server cache if available
      if (isServerCacheAvailable) {
        await supabase
          .from('cached_statistics')
          .delete()
          .eq('id', TRENDING_BILLS_CACHE_KEY);
        console.log('🧹 Cleared trending bills cache to ensure new limit takes effect');
      }
    } catch (cacheError) {
      console.warn('Error clearing cache:', cacheError);
    }
    
    // Fetch from database directly - skip cache temporarily
    console.log(`🔄 Fetching fresh trending bills data (limit: ${TRENDING_BILLS_LIMIT})`);
    const { data, error } = await supabase
      .from('bills')
      .select(`
        id, 
        bill_number,
        congress, 
        title, 
        introduction_date, 
        status, 
        bill_type,
        latest_action_date,
        latest_action_text,
        summary,
        cosponsors_count,
        actions_count,
        policy_area,
        sponsors,
        key_points,
        analysis_status
      `)
      // Instead of using a trending column, sort by actions_count to get trending bills
      .order('actions_count', { ascending: false })
      .order('introduction_date', { ascending: false })
      .limit(TRENDING_BILLS_LIMIT); // Explicitly limit to 3 trending bills
      
    if (error) {
      console.error('Error fetching trending bills:', error);
      return [];
    }
    
    // Cast data to Bill[] type
    const bills = data as unknown as Bill[];
    
    // Verify we got the correct number of bills
    console.log(`✅ Retrieved ${bills.length}/${TRENDING_BILLS_LIMIT} trending bills`);
    
    // Store in both caches for future requests
    storeInServerCache(TRENDING_BILLS_CACHE_KEY, bills).catch(err => 
      console.warn('Failed to update server cache:', err)
    );
    storeInClientCache(TRENDING_BILLS_CACHE_KEY, bills);
    
    return bills;
  } catch (error) {
    console.error('Error in fetchTrendingBills:', error);
    return [];
  }
};

/**
 * Type definition for Bill Stats
 */
export type BillStats = {
  congress118Count: number;
  congress119Count: number;
  latestCutoffDate: string;
  isVectorized: boolean;
  lastRefreshed: string;
};

/**
 * Get bill statistics with dual caching (server + client)
 */
export const getCachedBillStats = async (): Promise<BillStats> => {
  // Initialize caching system if not done already
  if (!isServerCacheAvailable) {
    await initCacheSystem();
  }
  
  try {
    // Try to get from server cache first
    const { data: serverCachedStats, found: foundInServerCache } = 
      await getFromServerCache<BillStats>(BILL_STATS_CACHE_KEY);
    
    if (foundInServerCache && serverCachedStats) {
      console.log('📦 Using server-cached bill statistics');
      return {
        ...serverCachedStats,
        lastRefreshed: serverCachedStats.lastRefreshed || new Date().toISOString()
      };
    }
    
    // Try to get from client cache
    const clientCacheResult = getFromClientCache<BillStats>(BILL_STATS_CACHE_KEY);
    if (clientCacheResult.found && clientCacheResult.data) {
      console.log('📦 Using client-cached bill statistics');
      // Refresh server cache in background
      storeInServerCache(BILL_STATS_CACHE_KEY, {
        ...clientCacheResult.data,
        lastRefreshed: clientCacheResult.data.lastRefreshed || new Date().toISOString()
      }).catch(err => 
        console.warn('Failed to update server cache with client cache data:', err)
      );
      return {
        ...clientCacheResult.data,
        lastRefreshed: clientCacheResult.data.lastRefreshed || new Date().toISOString()
      };
    }
    
    // If not in cache, fetch fresh data
    console.log('🔄 Fetching fresh bill statistics data');
    const stats = await fetchBillStats();
    
    // Store in both caches
    storeInServerCache(BILL_STATS_CACHE_KEY, stats).catch(err => 
      console.warn('Failed to update server cache:', err)
    );
    storeInClientCache(BILL_STATS_CACHE_KEY, stats);
    
    return stats;
  } catch (error) {
    console.error('Error in getCachedBillStats:', error);
    // Fallback to fresh data in case of cache error
    return await fetchBillStats();
  }
};

export async function fetchBillById(id: string): Promise<Bill> {
  const { data, error } = await supabase
    .from("bills")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  if (!data) throw new Error("Bill not found");

  return {
    analysis_status: data.analysis_status || 'pending',
    id: data.id,
    bill_number: data.bill_number,
    congress: data.congress,
    title: data.title,
    introduction_date: data.introduction_date,
    key_points: data.key_points || [],
    analysis: data.analysis,
    status: data.status,
    sponsors: data.sponsors || [],
    committee: data.committee || undefined,
    full_text: data.full_text || undefined,
    related_bills: typeof data.related_bills === 'string' ? JSON.parse(data.related_bills) : data.related_bills || [],
    created_at: data.created_at,
    updated_at: data.updated_at,
    bill_type: data.bill_type,
    origin_chamber: data.origin_chamber,
    origin_chamber_code: data.origin_chamber_code,
    latest_action_date: data.latest_action_date,
    latest_action_text: data.latest_action_text,
    constitutional_authority_text: data.constitutional_authority_text,
    policy_area: data.policy_area,
    subjects: data.subjects || [],
    summary: data.summary,
    cbo_cost_estimates: typeof data.cbo_cost_estimates === 'string' ? JSON.parse(data.cbo_cost_estimates) : data.cbo_cost_estimates || [],
    laws: typeof data.laws === 'string' ? JSON.parse(data.laws) : data.laws || [],
    committees_count: data.committees_count,
    cosponsors_count: data.cosponsors_count,
    withdrawn_cosponsors_count: data.withdrawn_cosponsors_count,
    actions_count: data.actions_count,
    update_date: data.update_date,
    update_date_including_text: data.update_date_including_text,
    pdf_url: data.pdf_url
  };
}

interface SemanticSearchParams {
  query: string;
  threshold?: number;
  limit?: number;
  modelFilter?: string;
  versionFilter?: number;
}

// Perform semantic search without generating embeddings on the client
export const semanticSearchBillsByText = async ({
  query,
  threshold = 0.2,
  limit = 20,
  modelFilter,
  versionFilter
}: SemanticSearchParams): Promise<Bill[]> => {
  try {
    // Here we use a special endpoint approach to avoid generating embeddings in the frontend
    // This endpoint will proxy the request to the server, which will generate the embedding
    // and then perform the search using the vector database
    const params = new URLSearchParams();
    params.append('query', query);
    params.append('threshold', threshold.toString());
    params.append('limit', limit.toString());
    
    if (modelFilter) {
      params.append('modelFilter', modelFilter);
    }
    
    if (versionFilter) {
      params.append('versionFilter', versionFilter.toString());
    }
    
    const proxyEndpoint = `${API_URL}/proxy/semantic-search?${params.toString()}`;
    console.log('🔍 Calling semantic search endpoint:', proxyEndpoint);
    
    const response = await fetch(proxyEndpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error('Semantic search request failed:', response.status, response.statusText);
      throw new Error('Failed to perform semantic search');
    }
    
    const data = await response.json();
    console.log('🔍 Semantic search API response structure:', Object.keys(data));
    
    // Check if we have a results field (from hybrid mode) or bills field (from legacy mode)
    if (data.results) {
      console.log(`🔍 Found ${data.results.length} results in 'results' field`);
      return data.results || [];
    } else if (data.bills) {
      console.log(`🔍 Found ${data.bills.length} results in 'bills' field`);
      return data.bills || [];
    } else {
      console.error('🔍 No bills or results found in API response:', data);
      return [];
    }
  } catch (error) {
    console.error('Error performing semantic search:', error);
    return [];
  }
};

// Find bills similar to a given bill by its ID
export const findSimilarBills = async (
  billId: string,
  threshold = 0.7,
  limit = 5,
  modelFilter?: string,
  versionFilter?: number
): Promise<Bill[]> => {
  try {
    const { data, error } = await supabase.rpc('find_similar_bills', {
      input_bill_id: billId,
      input_match_threshold: threshold,
      input_match_count: limit,
      input_model_filter: modelFilter,
      input_version_filter: versionFilter
    });

    if (error) {
      console.error('Error finding similar bills:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Exception finding similar bills:', error);
    return [];
  }
};

// Find bills similar to a bill identified by bill number (e.g., "hr1234", "S. 123")
export const findSimilarBillsByNumber = async (
  billNumber: string,
  threshold = 0.7,
  limit = 5,
  modelFilter?: string,
  versionFilter?: number
): Promise<{bills: Bill[], billId?: string}> => {
  try {
    // First, normalize and find the bill ID for the given bill number
    // Normalize the bill number
    let normalizedBillNumber = billNumber.toLowerCase().trim();
    
    // Handle various formats like "h.r. 1234", "hr1234", "s 123", etc.
    // Remove spaces, dots and extra characters
    normalizedBillNumber = normalizedBillNumber.replace(/\s+/g, '');
    normalizedBillNumber = normalizedBillNumber.replace(/\./g, '');
    
    // Separate the bill type and number
    let billType, billNumberOnly;
    
    // Common formats: hr1234, s123, hjres123, sconres123
    const typeMatch = normalizedBillNumber.match(/^([a-z]+)(\d+)$/);
    if (!typeMatch) {
      console.error('Invalid bill number format. Examples of valid formats: hr1234, s123, hjres45');
      return {bills: []};
    }
    
    billType = typeMatch[1];
    billNumberOnly = typeMatch[2];
    
    // Map common abbreviations to standard types
    const typeMapping: Record<string, string> = {
      'hr': 'hr',
      'h': 'hr',
      'house': 'hr',
      's': 's',
      'senate': 's',
      'hjres': 'hjres',
      'hjr': 'hjres',
      'sjres': 'sjres',
      'sjr': 'sjres',
      'hconres': 'hconres',
      'hcr': 'hconres',
      'sconres': 'sconres',
      'scr': 'sconres',
      'hres': 'hres',
      'hresr': 'hres', // Changed from 'hr' to 'hresr' to avoid duplicate key
      'sres': 'sres',
      'sr': 'sres'
    };
    
    // Special case for hr/hres ambiguity
    if (billType === 'hr' && normalizedBillNumber.match(/^hr\d+$/)) {
      // If it's "hr" followed by a number with no other indicators, it's a House Bill
      billType = 'hr';
    } else {
      billType = typeMapping[billType] || billType;
    }
    
    // Find the bill ID based on the bill type and number
    const { data: billData, error: billError } = await supabase
      .from('bills')
      .select('id')
      .eq('bill_type', billType)
      .eq('bill_number', billNumberOnly)
      .limit(1);
    
    if (billError || !billData || billData.length === 0) {
      console.error('Bill not found:', billError || 'No matching bill');
      return {bills: []};
    }
    
    const billId = billData[0].id;
    
    // Now find similar bills using the bill ID
    const { data, error } = await supabase.rpc('find_similar_bills', {
      input_bill_id: billId,
      input_match_threshold: threshold,
      input_match_count: limit,
      input_model_filter: modelFilter,
      input_version_filter: versionFilter
    });

    if (error) {
      console.error('Error finding similar bills:', error);
      return {bills: [], billId};
    }

    return {bills: data || [], billId};
  } catch (error) {
    console.error('Exception finding similar bills by number:', error);
    return {bills: []};
  }
};

// Fetch bill statistics including counts by congress and latest cutoff date
export const fetchBillStats = async (): Promise<BillStats> => {
  try {
    // Get count for 118th Congress
    const { count: congress118Count, error: error118 } = await supabase
      .from('bills')
      .select('*', { count: 'exact', head: true })
      .eq('congress', '118');
    
    if (error118) {
      console.error('Error fetching 118th Congress count:', error118);
      throw error118;
    }
    
    // Get count for 119th Congress
    const { count: congress119Count, error: error119 } = await supabase
      .from('bills')
      .select('*', { count: 'exact', head: true })
      .eq('congress', '119');
    
    if (error119) {
      console.error('Error fetching 119th Congress count:', error119);
      throw error119;
    }
    
    // Get the latest bill to determine cutoff date
    const { data: latestBills, error: latestError } = await supabase
      .from('bills')
      .select('introduction_date, latest_action_date')
      .order('latest_action_date', { ascending: false })
      .limit(1);
    
    if (latestError) {
      console.error('Error fetching latest bill date:', latestError);
      throw latestError;
    }
    
    // Always use current date as latestCutoffDate when refreshing stats
    const latestCutoffDate = new Date().toISOString().split('T')[0];
    
    // Check if bills are vectorized (has embeddings)
    const { count: vectorizedCount, error: vectorizedError } = await supabase
      .from('bill_embeddings')
      .select('*', { count: 'exact', head: true });
    
    if (vectorizedError) {
      console.error('Error checking vectorization status:', vectorizedError);
      throw vectorizedError;
    }

    // Get or update last refresh time
    const { data: refreshData, error: refreshError } = await supabase
      .from('cached_statistics')
      .select('data')
      .eq('id', 'bill_stats_refresh')
      .single();

    if (refreshError && refreshError.code !== 'PGRST116') {
      console.error('Error getting refresh timestamp:', refreshError);
      throw refreshError;
    }

    // Always use current date when stats are refreshed
    const lastRefreshed = new Date().toISOString();
    
    // Update the refresh timestamp in the database
    const { error: updateError } = await supabase
      .from('cached_statistics')
      .upsert({
        id: 'bill_stats_refresh',
        data: { lastRefreshed },
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hour expiry
      });

    if (updateError) {
      console.error('Error updating refresh timestamp:', updateError);
    }
    
    return {
      congress118Count: congress118Count || 0,
      congress119Count: congress119Count || 0,
      latestCutoffDate,
      isVectorized: vectorizedCount > 0,
      lastRefreshed
    };
  } catch (error) {
    console.error('Error in fetchBillStats:', error);
    // Return default values in case of error
    return {
      congress118Count: 0,
      congress119Count: 0,
      latestCutoffDate: new Date().toISOString().split('T')[0],
      isVectorized: false,
      lastRefreshed: new Date().toISOString()
    };
  }
};

// Debug function to verify if localStorage caching is working properly
export const checkServerCache = (): { 
  billStatsCache: { exists: boolean, itemCount: number, age: string },
  trendingBillsCache: { exists: boolean, itemCount: number, age: string } 
} => {
  const now = Date.now();
  
  // Check bill stats cache in localStorage
  let billStatsCacheExists = false;
  let billStatsCacheAge = 0;
  let billStatsCacheAgeStr = 'N/A';
  
  try {
    const statsCache = localStorage.getItem('bill-stats-cache');
    if (statsCache) {
      const { timestamp } = JSON.parse(statsCache);
      billStatsCacheExists = true;
      billStatsCacheAge = now - timestamp;
      billStatsCacheAgeStr = `${Math.round(billStatsCacheAge / 1000 / 60)} minutes`;
    }
  } catch (e) {
    console.warn('Error checking bill stats localStorage cache:', e);
  }
  
  // Check trending bills cache in localStorage
  let trendingBillsCacheExists = false;
  let trendingBillsCount = 0;
  let trendingBillsCacheAge = 0;
  let trendingBillsCacheAgeStr = 'N/A';
  
  try {
    const trendingCache = localStorage.getItem('trending-bills-cache');
    if (trendingCache) {
      const { data, timestamp } = JSON.parse(trendingCache);
      trendingBillsCacheExists = true;
      trendingBillsCount = data?.length || 0;
      trendingBillsCacheAge = now - timestamp;
      trendingBillsCacheAgeStr = `${Math.round(trendingBillsCacheAge / 1000 / 60)} minutes`;
    }
  } catch (e) {
    console.warn('Error checking trending bills localStorage cache:', e);
  }
  
  console.log('🔍 LOCALSTORAGE CACHE STATUS:');
  console.log(`📊 Bill Stats Cache: ${billStatsCacheExists ? 'EXISTS' : 'EMPTY'} (Age: ${billStatsCacheAgeStr})`);
  console.log(`🔥 Trending Bills Cache: ${trendingBillsCacheExists ? 'EXISTS' : 'EMPTY'} (Count: ${trendingBillsCount}, Age: ${trendingBillsCacheAgeStr})`);
  
  return {
    billStatsCache: {
      exists: billStatsCacheExists,
      itemCount: billStatsCacheExists ? 1 : 0,
      age: billStatsCacheAgeStr
    },
    trendingBillsCache: {
      exists: trendingBillsCacheExists,
      itemCount: trendingBillsCount,
      age: trendingBillsCacheAgeStr
    }
  };
};

/**
 * Make sure the cached_statistics table exists or create it
 * This is optional but helps ensure the cache table is available
 */
export const ensureCacheTableExists = async (): Promise<boolean> => {
  try {
    console.log('🔍 Checking if cached_statistics table exists...');
    // Try to select from the table to check if it exists
    const { error: tableCheckError } = await supabase
      .from('cached_statistics')
      .select('id')
      .limit(1);
    
    // If no error, table exists
    if (!tableCheckError) {
      console.log('✅ cached_statistics table exists');
      return true;
    }
    
    // If error code is 42P01, table does not exist
    if (tableCheckError.code === '42P01') {
      console.log('⚠️ cached_statistics table does not exist, attempting to create it...');
      
      // Use raw SQL to create the table (requires permission)
      const { error: createError } = await supabase.rpc('create_cache_table', {});
      
      if (createError) {
        console.error('❌ Failed to create cached_statistics table:', createError);
        return false;
      }
      
      console.log('✅ Successfully created cached_statistics table');
      return true;
    }
    
    // For permission errors (42501), we don't have permission to check/create
    if (tableCheckError.code === '42501') {
      console.warn('⚠️ Permission denied for cached_statistics table - server cache will be disabled');
      return false;
    }
    
    console.error('❌ Unexpected error checking cache table:', tableCheckError);
    return false;
  } catch (error) {
    console.error('❌ Error ensuring cache table exists:', error);
    return false;
  }
};

/**
 * Create a function to check cache table permissions and create 
 * This is called once during app initialization
 */
export const createCacheTable = async (): Promise<void> => {
  try {
    // Define the SQL to create a function that creates the cache table
    const createFunctionSQL = `
    CREATE OR REPLACE FUNCTION create_cache_table()
    RETURNS BOOLEAN
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      -- Create the table if it doesn't exist
      CREATE TABLE IF NOT EXISTS cached_statistics (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
      );
      
      -- Grant permissions to authenticated and anon roles
      GRANT SELECT, INSERT, UPDATE, DELETE ON cached_statistics TO authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON cached_statistics TO anon;
      
      RETURN TRUE;
    END;
    $$;
    `;
    
    // Execute the SQL to create the function
    const { error } = await supabase.rpc('create_function', { sql: createFunctionSQL });
    
    if (error) {
      console.error('❌ Failed to create cache table function:', error);
      return;
    }
    
    console.log('✅ Created function to manage cache table');
    
    // Now call the function to create the table
    await ensureCacheTableExists();
  } catch (error) {
    console.error('❌ Error creating cache table setup:', error);
  }
};

/**
 * Clear server-side caches for deployment and updates
 * Now checks the isServerCacheAvailable flag
 */
export const clearServerCaches = async (): Promise<void> => {
  try {
    // Skip if server cache not available
    if (!isServerCacheAvailable) {
      console.log('🧹 Server caching is not available - nothing to clear');
      return;
    }
    
    console.log('🧹 Clearing server-side caches...');
    
    // Delete trending bills cache
    const { error: trendingDeleteError } = await supabase
      .from('cached_statistics')
      .delete()
      .eq('id', TRENDING_BILLS_CACHE_KEY);
    
    if (trendingDeleteError) {
      console.error('Error clearing trending bills cache:', trendingDeleteError);
    } else {
      console.log('✅ Trending bills cache cleared');
    }
    
    // Delete bill stats cache
    const { error: statsDeleteError } = await supabase
      .from('cached_statistics')
      .delete()
      .eq('id', BILL_STATS_CACHE_KEY);
    
    if (statsDeleteError) {
      console.error('Error clearing bill stats cache:', statsDeleteError);
    } else {
      console.log('✅ Bill stats cache cleared');
    }
    
    console.log('🧹 Server-side cache clearing complete');
  } catch (error) {
    console.error('Failed to clear server caches:', error);
  }
};
