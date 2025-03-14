import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://jsdlzltqkmnhrsdafgjl.supabase.co',
  '[REMOVED]'
);

// Helper function to determine status from action text
function determineStatusFromAction(actionText) {
  if (!actionText) return null;
  actionText = actionText.toLowerCase();
  
  if (actionText.includes('signed by president') || actionText.includes('became public law')) {
    return 'signed_into_law';
  }
  if (actionText.includes('veto overridden')) {
    return 'veto_overridden';
  }
  if (actionText.includes('vetoed by president')) {
    return 'vetoed';
  }
  if (actionText.includes('presented to president')) {
    return 'presented_to_president';
  }
  if (actionText.includes('passed senate') && actionText.includes('passed house')) {
    return 'passed_both_chambers';
  }
  if (actionText.includes('passed senate') || actionText.includes('passed house')) {
    return 'passed_chamber';
  }
  if (actionText.includes('reported by') && actionText.includes('committee')) {
    return 'reported_by_committee';
  }
  if (actionText.includes('referred to') && actionText.includes('committee')) {
    return 'referred_to_committee';
  }
  if (actionText.includes('introduced')) {
    return 'introduced';
  }
  return null;
}

async function analyzeDatabase() {
  console.log('Analyzing bills table...\n');
  
  // Get bills with their latest actions
  const { data: bills, error: billsError } = await supabase
    .from('bills')
    .select('id, status, latest_action_text')
    .limit(100); // Get a good sample size

  if (billsError) {
    console.error('Error fetching bills:', billsError);
    return;
  }

  // Analyze status vs action text mismatch
  console.log('Status vs Action Text Analysis:');
  let mismatchCount = 0;
  bills.forEach(bill => {
    const expectedStatus = determineStatusFromAction(bill.latest_action_text);
    if (expectedStatus && expectedStatus !== bill.status) {
      mismatchCount++;
      console.log('\nMismatch found:');
      console.log('Current status:', bill.status);
      console.log('Expected status:', expectedStatus);
      console.log('Action text:', bill.latest_action_text);
    }
  });
  console.log(`\nFound ${mismatchCount} status mismatches out of ${bills.length} bills\n`);

  // Check bill_status_history table
  console.log('Analyzing bill_status_history table...\n');
  const { data: history, error: historyError } = await supabase
    .from('bill_status_history')
    .select('*')
    .limit(50);

  if (historyError) {
    console.error('Error fetching history:', historyError);
    return;
  }

  if (!history || history.length === 0) {
    console.log('No entries found in bill_status_history table!');
  } else {
    console.log(`Found ${history.length} entries in bill_status_history table`);
    console.log('\nSample entries:');
    history.slice(0, 3).forEach(entry => {
      console.log({
        billId: entry.bill_id,
        status: entry.status,
        changedAt: entry.changed_at,
        actionText: entry.action_text
      });
    });
  }

  // Get unique action texts to understand all possible states
  console.log('\nAnalyzing unique action texts...\n');
  const { data: actions, error: actionsError } = await supabase
    .from('bills')
    .select('latest_action_text')
    .not('latest_action_text', 'is', null);

  if (actionsError) {
    console.error('Error fetching actions:', actionsError);
    return;
  }

  const uniqueActions = new Set(actions.map(a => a.latest_action_text));
  console.log('Sample of unique action texts:');
  Array.from(uniqueActions).slice(0, 10).forEach(action => {
    console.log(`- ${action}`);
    console.log(`  Determined status: ${determineStatusFromAction(action)}`);
  });
}

analyzeDatabase(); 