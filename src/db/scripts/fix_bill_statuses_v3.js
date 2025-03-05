import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Validate environment variables
if (!process.env.SUPABASE_URL) {
  throw new Error('SUPABASE_URL is required')
}
if (!process.env.SUPABASE_KEY) {
  throw new Error('SUPABASE_KEY is required')
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

const STATUS_PROGRESSION = {
  'introduced': ['referred_to_committee', 'failed'],
  'referred_to_committee': ['reported_by_committee', 'failed'],
  'reported_by_committee': ['passed_chamber', 'failed'],
  'passed_chamber': ['passed_both_chambers', 'failed'],
  'passed_both_chambers': ['presented_to_president', 'failed'],
  'presented_to_president': ['signed_into_law', 'vetoed', 'failed'],
  'vetoed': ['veto_overridden', 'failed'],
  'veto_overridden': ['signed_into_law', 'failed'],
  'signed_into_law': [],
  'failed': []
}

function isValidStatusProgression(currentStatus, newStatus) {
  if (!currentStatus || !newStatus) return true
  if (currentStatus === newStatus) return true
  if (newStatus === 'failed') return true
  
  // Allow any progression from introduced since we don't have full history
  if (currentStatus === 'introduced') return true
  
  // Allow progression to reported_by_committee from any earlier state
  if (newStatus === 'reported_by_committee' && 
      ['introduced', 'referred_to_committee'].includes(currentStatus)) return true
  
  // Allow progression to passed_chamber from any earlier state
  if (newStatus === 'passed_chamber' && 
      ['introduced', 'referred_to_committee', 'reported_by_committee'].includes(currentStatus)) return true
  
  // Allow progression to passed_both_chambers from any earlier state
  if (newStatus === 'passed_both_chambers' && 
      ['introduced', 'referred_to_committee', 'reported_by_committee', 'passed_chamber'].includes(currentStatus)) return true
  
  // Allow progression to presented_to_president from any earlier state
  if (newStatus === 'presented_to_president' && 
      ['introduced', 'referred_to_committee', 'reported_by_committee', 'passed_chamber', 'passed_both_chambers'].includes(currentStatus)) return true
  
  // Allow progression to signed_into_law from any earlier state
  if (newStatus === 'signed_into_law' && 
      ['introduced', 'referred_to_committee', 'reported_by_committee', 'passed_chamber', 'passed_both_chambers', 'presented_to_president'].includes(currentStatus)) return true
  
  // Allow progression to vetoed from any earlier state
  if (newStatus === 'vetoed' && 
      ['introduced', 'referred_to_committee', 'reported_by_committee', 'passed_chamber', 'passed_both_chambers', 'presented_to_president'].includes(currentStatus)) return true
  
  // Allow progression to veto_overridden from any earlier state
  if (newStatus === 'veto_overridden' && 
      ['introduced', 'referred_to_committee', 'reported_by_committee', 'passed_chamber', 'passed_both_chambers', 'presented_to_president', 'vetoed'].includes(currentStatus)) return true
  
  return false
}

function determineStatusFromAction(actionText) {
  if (!actionText) return null
  actionText = actionText.toLowerCase()
  
  // Final statuses first
  if (actionText.includes('became public law') || 
      actionText.includes('became private law') ||
      actionText.includes('signed by president') ||
      actionText.includes('public law no:') ||
      actionText.includes('private law no:') ||
      actionText.includes('enacted') ||
      actionText.includes('enacted into law')) {
    return 'signed_into_law'
  }

  if (actionText.includes('veto message received') ||
      actionText.includes('vetoed by president') ||
      actionText.includes('presidential veto') ||
      actionText.includes('received veto message')) {
    return 'vetoed'
  }

  if (actionText.includes('passed over president') || 
      actionText.includes('veto overridden') ||
      actionText.includes('override the veto') ||
      actionText.includes('overriding the veto')) {
    return 'veto_overridden'
  }

  if (actionText.includes('failed') || 
      actionText.includes('rejected') ||
      actionText.includes('withdrawn by sponsor') ||
      actionText.includes('motion to proceed rejected') ||
      actionText.includes('motion to table agreed to') ||
      actionText.includes('motion to reconsider laid on table') ||
      actionText.includes('failed of passage') ||
      actionText.includes('failed to pass')) {
    return 'failed'
  }

  // Presented to President
  if (actionText.includes('presented to president') ||
      actionText.includes('sent to president') ||
      actionText.includes('received by president') ||
      actionText.includes('transmitted to president')) {
    return 'presented_to_president'
  }

  // Passage through chambers
  if ((actionText.includes('passed house') && actionText.includes('passed senate')) ||
      (actionText.includes('agreed to in house') && actionText.includes('agreed to in senate')) ||
      actionText.includes('cleared for president') ||
      actionText.includes('cleared for white house') ||
      actionText.includes('passed both chambers')) {
    return 'passed_both_chambers'
  }

  if ((actionText.includes('passed house') || 
       actionText.includes('passed senate') ||
       actionText.includes('agreed to in house') ||
       actionText.includes('agreed to in senate') ||
       actionText.includes('passed/agreed to in house') ||
       actionText.includes('passed/agreed to in senate') ||
       actionText.includes('resolution agreed to in house') ||
       actionText.includes('resolution agreed to in senate') ||
       actionText.includes('passed by recorded vote') ||
       actionText.includes('passed by yea-nay vote') ||
       // Add patterns for Senate resolutions
       (actionText.includes('submitted in the senate') && 
        actionText.includes('agreed to') &&
        actionText.includes('unanimous consent')) ||
       actionText.includes('resolution agreed to in senate') ||
       // Add pattern for messages between chambers
       actionText.includes('message on senate action sent to the house') ||
       actionText.includes('message on house action sent to the senate'))) {
    return 'passed_chamber'
  }

  // Committee actions
  if ((actionText.includes('reported by') && 
       (actionText.includes('committee') || actionText.includes('comm.'))) ||
      actionText.includes('ordered to be reported') ||
      actionText.includes('committee reports') ||
      actionText.includes('reported with amendment') ||
      actionText.includes('reported without amendment') ||
      actionText.includes('reported favorably') ||
      (actionText.includes('placed on') && 
       (actionText.includes('calendar') || actionText.includes('legislative calendar'))) ||
      // Add pattern for bills held at desk after committee
      (actionText.includes('held at the desk') && 
       actionText.includes('committee'))) {
    return 'reported_by_committee'
  }

  if ((actionText.includes('referred to') && 
       (actionText.includes('committee') || actionText.includes('comm.'))) ||
      actionText.includes('committee referral') ||
      actionText.includes('sequential referral') ||
      actionText.includes('referred to subcommittee') ||
      actionText.includes('referred to the subcommittee') ||
      actionText.includes('referred to the committee') ||
      // Add pattern for bills held at desk before committee
      (actionText.includes('held at the desk') && 
       !actionText.includes('committee'))) {
    return 'referred_to_committee'
  }

  // Default to introduced for new bills
  if (actionText.includes('introduced') ||
      actionText.includes('read first time') ||
      actionText.includes('read twice') ||
      actionText.includes('sponsor introductory remarks')) {
    return 'introduced'
  }

  return null
}

async function fixBillStatuses() {
  console.log('Starting enhanced bill status fix...\n')
  
  // Get all bills
  const { data: bills, error: billsError } = await supabase
    .from('bills')
    .select('*')
  
  if (billsError) {
    console.error('Error fetching bills:', billsError)
    return
  }

  console.log(`Processing ${bills.length} bills...\n`)

  const updates = []
  const historyEntries = []
  const statusCounts = {}
  let noChangeCount = 0
  let invalidProgressions = 0
  let undeterminedCount = 0

  for (const bill of bills) {
    const newStatus = determineStatusFromAction(bill.latest_action_text)
    
    if (!newStatus) {
      console.warn(`\nWarning: Could not determine status for bill ${bill.id}`)
      console.warn(`Latest action: ${bill.latest_action_text}`)
      undeterminedCount++
      continue
    }

    if (!isValidStatusProgression(bill.status, newStatus)) {
      console.warn(`\nInvalid progression attempted: ${bill.status} -> ${newStatus}`)
      console.warn(`Bill ID: ${bill.id}`)
      console.warn(`Latest action: ${bill.latest_action_text}`)
      invalidProgressions++
      continue
    }

    if (bill.status !== newStatus) {
      updates.push({
        id: bill.id,
        status: newStatus
      })
      
      historyEntries.push({
        bill_id: bill.id,
        status: newStatus,
        changed_at: new Date().toISOString(),
        action_text: bill.latest_action_text
      })

      statusCounts[newStatus] = (statusCounts[newStatus] || 0) + 1
    } else {
      noChangeCount++
    }
  }

  if (updates.length > 0) {
    console.log('\nInserting status history entries...')
    
    // Insert history entries in batches
    for (let i = 0; i < historyEntries.length; i += 50) {
      const batch = historyEntries.slice(i, i + 50)
      const { error: historyError } = await supabase
        .from('bill_status_history')
        .insert(batch)
      
      if (historyError) {
        console.error('Error inserting history entries:', historyError)
      }
    }

    // Update bills in batches
    for (let i = 0; i < updates.length; i += 50) {
      const batch = updates.slice(i, i + 50)
      for (const update of batch) {
        const { error: updateError } = await supabase
          .from('bills')
          .update({ status: update.status })
          .eq('id', update.id)
        
        if (updateError) {
          console.error(`Error updating bill ${update.id}:`, updateError)
        }
      }
    }
  }

  console.log('\nUpdate Summary:')
  console.log('----------------')
  console.log(`Total bills processed: ${bills.length}`)
  console.log(`Bills updated: ${updates.length}`)
  console.log(`No change needed: ${noChangeCount}`)
  console.log(`Invalid progressions prevented: ${invalidProgressions}`)
  console.log(`Undetermined statuses: ${undeterminedCount}`)
  console.log(`History entries created: ${historyEntries.length}\n`)

  if (Object.keys(statusCounts).length > 0) {
    console.log('New status distribution:')
    for (const [status, count] of Object.entries(statusCounts)) {
      const percentage = ((count / bills.length) * 100).toFixed(1)
      console.log(`${status}: ${count} bills (${percentage}%)`)
    }
  }

  // Verify the updates
  console.log('\nVerifying updates...')
  const { data: verification, error: verificationError } = await supabase
    .from('bills')
    .select('status')
    .neq('status', 'introduced')
  
  if (verificationError) {
    console.error('Error verifying updates:', verificationError)
    return
  }

  console.log(`\nVerification complete: ${verification.length} bills now have non-introduced status`)
}

fixBillStatuses().catch(console.error) 