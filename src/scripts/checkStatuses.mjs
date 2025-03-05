import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.join(__dirname, '../../.env.production');
console.log('Loading environment from:', envPath);
dotenv.config({ path: envPath });

console.log('Environment variables:');
console.log('VITE_SUPABASE_URL:', process.env.VITE_SUPABASE_URL);
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '[REDACTED]' : 'undefined');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables:');
  console.error('VITE_SUPABASE_URL:', supabaseUrl ? 'defined' : 'undefined');
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? 'defined' : 'undefined');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStatuses() {
  try {
    // Get status distribution
    const { data: statusCounts, error: statusError } = await supabase
      .from('bills')
      .select('status', { count: 'exact' })
      .eq('congress', 118)
      .then(result => {
        const counts = {};
        result.data.forEach(row => {
          counts[row.status] = (counts[row.status] || 0) + 1;
        });
        return { data: counts };
      });

    if (statusError) {
      console.error('Error getting status counts:', statusError);
      return;
    }

    console.log('\nStatus Distribution:');
    Object.entries(statusCounts)
      .sort(([, a], [, b]) => b - a)
      .forEach(([status, count]) => {
        console.log(`${status}: ${count}`);
      });

    // Get bills with status history
    const { data: historyCount, error: historyError } = await supabase
      .from('bill_status_history')
      .select('bill_id', { count: 'exact', distinct: true });

    if (historyError) {
      console.error('Error getting history count:', historyError);
      return;
    }

    console.log('\nStatus History:');
    console.log(`Bills with status changes: ${historyCount.length}`);

    // Sample some bills with multiple status changes
    const { data: samples, error: sampleError } = await supabase
      .from('bill_status_history')
      .select(`
        bill_id,
        status,
        action_text,
        changed_at
      `)
      .order('changed_at', { ascending: true })
      .limit(10);

    if (sampleError) {
      console.error('Error getting samples:', sampleError);
      return;
    }

    if (samples.length > 0) {
      console.log('\nSample Status Changes:');
      const groupedSamples = {};
      samples.forEach(change => {
        if (!groupedSamples[change.bill_id]) {
          groupedSamples[change.bill_id] = [];
        }
        groupedSamples[change.bill_id].push(change);
      });

      Object.entries(groupedSamples).forEach(([billId, changes]) => {
        console.log(`\nBill ${billId}:`);
        changes.forEach(change => {
          console.log(`  ${new Date(change.changed_at).toISOString()}: ${change.status}`);
          if (change.action_text) {
            console.log(`    Action: ${change.action_text}`);
          }
        });
      });
    }

  } catch (error) {
    console.error('Error checking statuses:', error);
  }
}

checkStatuses(); 