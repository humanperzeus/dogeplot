/**
 * This script resets the bill statistics in the database
 * It clears the cached_statistics table and regenerates fresh statistics
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.production' });

// Create Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials. Make sure .env.production file exists with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function resetStats() {
  console.log('🧹 Starting statistics reset process...');
  
  try {
    // Step 1: Clear the cached_statistics table
    console.log('🧹 Clearing cached_statistics table...');
    const { error: deleteError } = await supabase
      .from('cached_statistics')
      .delete()
      .in('id', ['bill_stats', 'bill_stats_refresh', 'trending_bills']);
    
    if (deleteError) {
      console.error('❌ Error clearing cached_statistics table:', deleteError);
    } else {
      console.log('✅ Database cache cleared successfully');
    }
    
    // Step 2: Get fresh counts directly from the database
    console.log('🔍 Getting fresh counts from database...');
    
    // Get count for 118th Congress
    const { count: congress118Count, error: error118 } = await supabase
      .from('bills')
      .select('*', { count: 'exact', head: true })
      .eq('congress', '118');
    
    if (error118) {
      console.error('❌ Error fetching 118th Congress count:', error118);
    }
    
    // Get count for 119th Congress
    const { count: congress119Count, error: error119 } = await supabase
      .from('bills')
      .select('*', { count: 'exact', head: true })
      .eq('congress', '119');
    
    if (error119) {
      console.error('❌ Error fetching 119th Congress count:', error119);
    }
    
    // Step 3: Check if bills are vectorized
    const { count: vectorizedCount, error: vectorizedError } = await supabase
      .from('bill_embeddings')
      .select('*', { count: 'exact', head: true });
    
    if (vectorizedError) {
      console.error('❌ Error checking vectorization status:', vectorizedError);
    }
    
    // Step 4: Create fresh statistics
    const freshStats = {
      congress118Count: congress118Count || 0,
      congress119Count: congress119Count || 0,
      latestCutoffDate: new Date().toISOString().split('T')[0],
      isVectorized: vectorizedCount > 0,
      lastRefreshed: new Date().toISOString()
    };
    
    console.log('📊 Fresh statistics:', JSON.stringify(freshStats, null, 2));
    
    // Step 5: Store the fresh statistics in the database
    console.log('💾 Storing fresh statistics in database...');
    const { error: insertError } = await supabase
      .from('cached_statistics')
      .upsert({
        id: 'bill_stats',
        data: freshStats,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hour expiry
      });
    
    if (insertError) {
      console.error('❌ Error storing fresh statistics:', insertError);
    } else {
      console.log('✅ Fresh statistics stored successfully');
    }
    
    // Step 6: Update the refresh timestamp
    const { error: refreshError } = await supabase
      .from('cached_statistics')
      .upsert({
        id: 'bill_stats_refresh',
        data: { lastRefreshed: new Date().toISOString() },
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hour expiry
      });
    
    if (refreshError) {
      console.error('❌ Error updating refresh timestamp:', refreshError);
    } else {
      console.log('✅ Refresh timestamp updated successfully');
    }
    
    console.log('✅ Statistics reset complete!');
    console.log(`118th Congress: ${freshStats.congress118Count}`);
    console.log(`119th Congress: ${freshStats.congress119Count}`);
    console.log(`Total Bills: ${freshStats.congress118Count + freshStats.congress119Count}`);
  } catch (error) {
    console.error('❌ Error resetting statistics:', error);
  }
}

// Execute the reset function
resetStats().catch(console.error); 