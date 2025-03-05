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

async function analyzeStatuses() {
  try {
    console.log('\n=== Bill Status Analysis ===');
    
    // 1. Get overall status distribution
    console.log('\n1. Status Distribution:');
    const { data: statusCounts, error: statusError } = await supabase.rpc('get_status_counts');
    if (statusError) {
      console.error('Status count error:', statusError);
    } else {
      console.table(statusCounts);
    }

    // 2. Check bills with history entries
    console.log('\n2. Status History Analysis:');
    const { data: historyStats, error: historyError } = await supabase
      .from('bill_status_history')
      .select('bill_id, status, changed_at, action_text');
    
    if (historyError) {
      console.error('History error:', historyError);
    } else {
      const billsWithHistory = new Set(historyStats?.map(h => h.bill_id) || []);
      console.log(`Bills with status history: ${billsWithHistory.size}`);
      
      // Sample some bills with multiple status changes
      const statusChangesByBill = {};
      historyStats?.forEach(h => {
        if (!statusChangesByBill[h.bill_id]) {
          statusChangesByBill[h.bill_id] = [];
        }
        statusChangesByBill[h.bill_id].push(h);
      });

      const billsWithMultipleChanges = Object.entries(statusChangesByBill)
        .filter(([_, changes]) => changes.length > 1)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 5);

      if (billsWithMultipleChanges.length > 0) {
        console.log('\nSample Bills with Multiple Status Changes:');
        for (const [billId, changes] of billsWithMultipleChanges) {
          const { data: bill } = await supabase
            .from('bills')
            .select('bill_type, bill_number, congress')
            .eq('id', billId)
            .single();

          if (bill) {
            console.log(`\n${bill.bill_type}${bill.bill_number} (Congress ${bill.congress}):`);
            changes
              .sort((a, b) => new Date(a.changed_at) - new Date(b.changed_at))
              .forEach(change => {
                console.log(`  ${new Date(change.changed_at).toISOString()}: ${change.status}`);
                if (change.action_text) {
                  console.log(`    Action: ${change.action_text}`);
                }
              });
          }
        }
      }
    }

    // 3. Check for inconsistencies
    console.log('\n3. Consistency Check:');
    const { data: bills, error: billsError } = await supabase
      .from('bills')
      .select('id, bill_type, bill_number, congress, status, latest_action_text, latest_action_date')
      .order('latest_action_date', { ascending: false })
      .limit(1000);

    if (billsError) {
      console.error('Bills error:', billsError);
    } else {
      // Check for bills that might be in wrong status
      const potentialIssues = bills.filter(bill => {
        const text = bill.latest_action_text?.toLowerCase() || '';
        const status = bill.status;

        // Check for mismatches
        if (text.includes('became public law') && status !== 'signed_into_law') {
          return true;
        }
        if (text.includes('passed') && text.includes('senate') && text.includes('house') && 
            !['passed_both_chambers', 'presented_to_president', 'signed_into_law', 'vetoed', 'veto_overridden'].includes(status)) {
          return true;
        }
        if (text.includes('vetoed') && !['vetoed', 'veto_overridden'].includes(status)) {
          return true;
        }
        return false;
      });

      if (potentialIssues.length > 0) {
        console.log('\nPotential Status Issues Found:');
        potentialIssues.forEach(bill => {
          console.log(`\n${bill.bill_type}${bill.bill_number} (Congress ${bill.congress}):`);
          console.log(`Status: ${bill.status}`);
          console.log(`Latest Action: ${bill.latest_action_text}`);
        });
      } else {
        console.log('No obvious status inconsistencies found');
      }
    }

    // 4. Text Content Analysis
    console.log('\n4. Text Content Analysis:');
    const { data: textStats, error: textError } = await supabase
      .from('bills')
      .select('has_full_text, text_source')
      .not('has_full_text', 'is', null);

    if (textError) {
      console.error('Text stats error:', textError);
    } else {
      const withText = textStats?.filter(b => b.has_full_text)?.length || 0;
      const totalBills = textStats?.length || 0;
      const bySource = textStats?.reduce((acc, bill) => {
        if (bill.text_source) {
          acc[bill.text_source] = (acc[bill.text_source] || 0) + 1;
        }
        return acc;
      }, {});

      console.log('\nText Statistics:');
      console.log(`Total Bills: ${totalBills}`);
      console.log(`Bills with text: ${withText}`);
      console.log(`Bills without text: ${totalBills - withText}`);
      if (bySource) {
        console.log('\nBy Source:');
        console.table(bySource);
      }
    }

  } catch (error) {
    console.error('Error analyzing statuses:', error);
  }
}

// Run the analysis
analyzeStatuses().catch(console.error); 