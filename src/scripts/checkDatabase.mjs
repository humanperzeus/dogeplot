import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load production environment
const envPath = join(__dirname, '../../.env.production');
if (fs.existsSync(envPath)) {
  config({ path: envPath });
} else {
  console.warn('Production env not found, falling back to default');
  config();
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function checkDatabase() {
  try {
    console.log('\n=== Database Status Check ===');
    
    // 1. Check bill status distribution
    console.log('\nChecking bill status distribution...');
    const { data: statusCounts, error: statusError } = await supabase.rpc('get_status_counts');
    if (statusError) {
      console.error('Status count error:', statusError);
    } else {
      console.log('\nStatus Distribution:');
      console.table(statusCounts);
    }

    // 2. Check text content statistics
    console.log('\nChecking text content statistics...');
    const { data: textStats, error: textError } = await supabase
      .from('bills')
      .select('has_full_text, text_source')
      .not('has_full_text', 'is', null);
    
    if (textError) {
      console.error('Text stats error:', textError);
    } else {
      const withText = textStats?.filter(b => b.has_full_text)?.length || 0;
      const totalBills = textStats?.length || 0;
      
      console.log('\nText Content Statistics:');
      console.log(`Total Bills: ${totalBills}`);
      console.log(`Bills with text: ${withText}`);
      console.log(`Bills without text: ${totalBills - withText}`);
    }

    // 3. Check status history
    console.log('\nChecking status history...');
    const { data: historyStats, error: historyError } = await supabase
      .from('bill_status_history')
      .select('status, changed_at')
      .order('changed_at', { ascending: false })
      .limit(5);

    if (historyError) {
      console.error('History stats error:', historyError);
    } else {
      console.log('\nRecent Status Changes:');
      historyStats?.forEach(change => {
        console.log(`${change.status} at ${new Date(change.changed_at).toLocaleString()}`);
      });
    }

    // 4. Check determineBillStatus function implementation
    console.log('\nChecking bill status determination...');
    const { data: sampleBill, error: sampleError } = await supabase
      .from('bills')
      .select('latest_action_text, status')
      .limit(5);

    if (sampleError) {
      console.error('Sample bill error:', sampleError);
    } else {
      console.log('\nSample Bill Actions vs Status:');
      sampleBill?.forEach(bill => {
        console.log(`Status: ${bill.status}`);
        console.log(`Latest Action: ${bill.latest_action_text}`);
        console.log('---');
      });
    }

  } catch (error) {
    console.error('Error checking database:', error);
  }
}

// Run the check
checkDatabase().catch(console.error); 