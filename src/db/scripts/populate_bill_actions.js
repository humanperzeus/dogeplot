import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

async function populateBillActions() {
  console.log('Starting bill actions population...\n')

  // Get all bills
  const { data: bills, error: billsError } = await supabase
    .from('bills')
    .select('id, latest_action_text, latest_action_date')
    .not('latest_action_text', 'is', null)
    .order('latest_action_date', { ascending: true })

  if (billsError) {
    console.error('Error fetching bills:', billsError)
    return
  }

  console.log(`Found ${bills.length} bills with actions\n`)

  // Prepare actions for insertion
  const actions = bills.map(bill => ({
    bill_id: bill.id,
    action_text: bill.latest_action_text,
    action_date: bill.latest_action_date || new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }))

  console.log('Inserting actions in batches...')
  
  // Insert in batches of 100
  let successCount = 0
  let errorCount = 0
  
  for (let i = 0; i < actions.length; i += 100) {
    const batch = actions.slice(i, i + 100)
    const { error: insertError } = await supabase
      .from('bill_actions')
      .insert(batch)

    if (insertError) {
      console.error(`Error inserting batch ${i/100 + 1}:`, insertError)
      errorCount += batch.length
    } else {
      successCount += batch.length
      console.log(`Processed batch ${i/100 + 1} of ${Math.ceil(actions.length/100)}`)
    }
  }

  // Verify the insertions
  const { data: actionCount, error: countError } = await supabase
    .from('bill_actions')
    .select('*', { count: 'exact' })

  if (countError) {
    console.error('Error verifying action count:', countError)
  } else {
    console.log('\nVerification:')
    console.log(`Total actions in database: ${actionCount.length}`)
  }

  console.log('\nSummary:')
  console.log('--------')
  console.log(`Total bills processed: ${bills.length}`)
  console.log(`Successful insertions: ${successCount}`)
  console.log(`Failed insertions: ${errorCount}`)
}

populateBillActions().catch(console.error) 