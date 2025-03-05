import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

async function analyzeIntroducedBills() {
  console.log('Analyzing bills in introduced state...\n')

  // Get all introduced bills
  const { data: bills, error: billsError } = await supabase
    .from('bills')
    .select('*')
    .eq('status', 'introduced')
    .order('introduction_date', { ascending: false })

  if (billsError) {
    console.error('Error fetching bills:', billsError)
    return
  }

  console.log(`Found ${bills.length} bills in introduced state\n`)

  // Analyze action texts
  const actionPatterns = new Map()
  const uniqueActions = new Set()

  bills.forEach(bill => {
    if (bill.latest_action_text) {
      uniqueActions.add(bill.latest_action_text)
      
      // Extract common patterns
      const text = bill.latest_action_text.toLowerCase()
      if (text.includes('referred')) actionPatterns.set('referred', (actionPatterns.get('referred') || 0) + 1)
      if (text.includes('committee')) actionPatterns.set('committee', (actionPatterns.get('committee') || 0) + 1)
      if (text.includes('reported')) actionPatterns.set('reported', (actionPatterns.get('reported') || 0) + 1)
      if (text.includes('calendar')) actionPatterns.set('calendar', (actionPatterns.get('calendar') || 0) + 1)
      if (text.includes('passed')) actionPatterns.set('passed', (actionPatterns.get('passed') || 0) + 1)
      if (text.includes('agreed')) actionPatterns.set('agreed', (actionPatterns.get('agreed') || 0) + 1)
      if (text.includes('vote')) actionPatterns.set('vote', (actionPatterns.get('vote') || 0) + 1)
    }
  })

  // Print analysis
  console.log('Common patterns found:')
  console.log('---------------------')
  for (const [pattern, count] of actionPatterns.entries()) {
    const percentage = ((count / bills.length) * 100).toFixed(1)
    console.log(`${pattern}: ${count} bills (${percentage}%)`)
  }

  console.log('\nSample of unique action texts:')
  console.log('---------------------------')
  Array.from(uniqueActions).slice(0, 20).forEach(action => {
    console.log(`- ${action}`)
  })

  // Analyze by congress
  const congressCounts = new Map()
  bills.forEach(bill => {
    congressCounts.set(bill.congress, (congressCounts.get(bill.congress) || 0) + 1)
  })

  console.log('\nDistribution by Congress:')
  console.log('----------------------')
  for (const [congress, count] of congressCounts.entries()) {
    const percentage = ((count / bills.length) * 100).toFixed(1)
    console.log(`${congress}th Congress: ${count} bills (${percentage}%)`)
  }

  // Analyze by bill type
  const typeCounts = new Map()
  bills.forEach(bill => {
    typeCounts.set(bill.bill_type, (typeCounts.get(bill.bill_type) || 0) + 1)
  })

  console.log('\nDistribution by Bill Type:')
  console.log('------------------------')
  for (const [type, count] of typeCounts.entries()) {
    const percentage = ((count / bills.length) * 100).toFixed(1)
    console.log(`${type}: ${count} bills (${percentage}%)`)
  }

  // Look for potential misclassifications
  console.log('\nPotential misclassifications:')
  console.log('---------------------------')
  bills.forEach(bill => {
    const text = bill.latest_action_text?.toLowerCase() || ''
    if (text.includes('referred to') && text.includes('committee')) {
      console.log(`Bill ${bill.bill_type}${bill.bill_number} should be 'referred_to_committee':`)
      console.log(`Action: ${bill.latest_action_text}`)
      console.log('---')
    }
    if (text.includes('reported by') && text.includes('committee')) {
      console.log(`Bill ${bill.bill_type}${bill.bill_number} should be 'reported_by_committee':`)
      console.log(`Action: ${bill.latest_action_text}`)
      console.log('---')
    }
    if (text.includes('passed') || text.includes('agreed to')) {
      console.log(`Bill ${bill.bill_type}${bill.bill_number} should be 'passed_chamber':`)
      console.log(`Action: ${bill.latest_action_text}`)
      console.log('---')
    }
  })
}

analyzeIntroducedBills().catch(console.error) 