import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://jsdlzltqkmnhrsdafgjl.supabase.co',
  '[REMOVED]'
);

async function verifyStatuses() {
  console.log('Checking current status distribution...\n');

  // Get status counts
  const { data: bills, error: billsError } = await supabase
    .from('bills')
    .select('status, latest_action_text');

  if (billsError) {
    console.error('Error:', billsError);
    return;
  }

  // Calculate status distribution
  const statusCounts = bills.reduce((acc, bill) => {
    acc[bill.status] = (acc[bill.status] || 0) + 1;
    return acc;
  }, {});

  console.log('Current Status Distribution:');
  console.log('---------------------------');
  Object.entries(statusCounts)
    .sort(([, a], [, b]) => b - a)
    .forEach(([status, count]) => {
      console.log(`${status}: ${count} bills (${((count / bills.length) * 100).toFixed(1)}%)`);
    });

  // Check history table
  const { data: history, error: historyError } = await supabase
    .from('bill_status_history')
    .select('*');

  if (historyError) {
    console.error('Error fetching history:', historyError);
    return;
  }

  console.log('\nStatus History:');
  console.log('--------------');
  console.log(`Total history entries: ${history.length}`);
  
  if (history.length > 0) {
    console.log('\nSample history entries:');
    history.slice(0, 3).forEach(entry => {
      console.log({
        status: entry.status,
        changedAt: entry.changed_at,
        actionText: entry.action_text?.substring(0, 100) + '...'
      });
    });
  }
}

verifyStatuses()
  .then(() => console.log('\nVerification completed'))
  .catch(err => console.error('Error:', err)); 