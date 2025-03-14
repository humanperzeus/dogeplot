#!/usr/bin/env node

/**
 * This script resets the bill statistics cache using the server API
 * It's a convenience wrapper to make it easier to run from the command line
 */

// Use ES modules import since the project is configured with "type": "module"
import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.production' });

console.log('🔄 Running statistics reset script...');

// Determine the server URL
const serverUrl = process.env.SERVER_URL || 'http://localhost:3001';

async function resetStats() {
  let serverRunning = false;
  
  try {
    // Call the server API to reset the cache
    console.log(`🔄 Calling server API at ${serverUrl}/api/bill-stats/reset`);
    
    try {
      const response = await fetch(`${serverUrl}/api/bill-stats/reset`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        console.warn(`⚠️ Warning: Server returned ${response.status}: ${response.statusText}`);
        console.warn('⚠️ Cache reset may not be complete.');
      } else {
        const result = await response.json();
        console.log('✅ Server cache cleared:', result.message);
        serverRunning = true;
      }
    } catch (connectionError) {
      console.error(`❌ Error: Could not connect to server at ${serverUrl}`);
      console.error('❌ Please make sure the server is running with one of these commands:');
      console.error('   nr dev:local:staging    # For staging environment');
      console.error('   nr dev:local:production # For production environment');
      console.error(`❌ Error details: ${connectionError.message}`);
      
      // Simulate success for testing purposes only
      if (process.env.SIMULATE_SUCCESS === 'true') {
        console.warn('⚠️ SIMULATING SUCCESS FOR TESTING PURPOSES ONLY');
        serverRunning = true;
      } else {
        process.exit(1);
      }
    }
    
    // Now fetch fresh statistics to populate the cache
    console.log('🔄 Fetching fresh statistics...');
    
    try {
      const statsResponse = await fetch(`${serverUrl}/api/bill-stats`);
      
      if (!statsResponse.ok) {
        console.warn(`⚠️ Warning: Statistics endpoint returned ${statsResponse.status}: ${statsResponse.statusText}`);
      } else {
        const stats = await statsResponse.json();
        console.log('✅ Fresh statistics loaded into cache:');
        console.log(`118th Congress: ${stats.congress118Count}`);
        console.log(`119th Congress: ${stats.congress119Count}`);
        console.log(`Total Bills: ${stats.congress118Count + stats.congress119Count}`);
        console.log(`Last Refreshed: ${new Date(stats.lastRefreshed).toLocaleString()}`);
        serverRunning = true;
      }
    } catch (statsError) {
      if (serverRunning) {
        console.warn('⚠️ Warning: Failed to fetch statistics:', statsError.message);
      }
    }
    
    // Also fetch fresh trending bills to populate that cache
    console.log('🔄 Fetching fresh trending bills...');
    
    try {
      const trendingResponse = await fetch(`${serverUrl}/api/trending-bills`);
      
      if (!trendingResponse.ok) {
        console.warn(`⚠️ Warning: Trending bills endpoint returned ${trendingResponse.status}: ${trendingResponse.statusText}`);
        console.warn('⚠️ Trending bills cache may not be updated.');
      } else {
        const trendingBills = await trendingResponse.json();
        console.log(`✅ Fresh trending bills loaded into cache (${Array.isArray(trendingBills) ? trendingBills.length : 0} bills)`);
        serverRunning = true;
      }
    } catch (trendingError) {
      if (serverRunning) {
        console.warn('⚠️ Warning: Failed to fetch trending bills:', trendingError.message);
        console.warn('⚠️ Trending bills cache may not be updated.');
      }
    }
    
    // Also reset semantic search cache
    console.log('🔄 Resetting semantic search cache...');
    
    try {
      // Try the API endpoint first
      let semanticResponse = await fetch(`${serverUrl}/api/semantic-search/reset`, {
        method: 'POST',
      });
      
      // If that fails, try the proxy endpoint
      if (!semanticResponse.ok && semanticResponse.status === 404) {
        console.log('⚠️ API endpoint not found, trying proxy endpoint...');
        semanticResponse = await fetch(`${serverUrl}/proxy/semantic-search/reset`, {
          method: 'POST',
        });
      }
      
      if (!semanticResponse.ok) {
        console.warn(`⚠️ Warning: Semantic search reset endpoint returned ${semanticResponse.status}: ${semanticResponse.statusText}`);
        console.warn('⚠️ Semantic search cache may not be updated.');
      } else {
        const semanticResult = await semanticResponse.json();
        console.log('✅ Semantic search cache cleared:', semanticResult.message);
        serverRunning = true;
      }
    } catch (semanticError) {
      if (serverRunning) {
        console.warn('⚠️ Warning: Failed to reset semantic search cache:', semanticError.message);
        console.warn('⚠️ Semantic search cache may not be updated.');
      }
    }
    
    if (serverRunning) {
      console.log('✅ Reset process completed with available endpoints.');
    } else {
      console.error('❌ Reset process failed. Server does not appear to be running.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Error executing reset script:', error);
    process.exit(1);
  }
}

// Execute the reset function
resetStats().catch(console.error); 