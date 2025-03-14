import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import axios from 'axios';

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

const congressApiKey = process.env.VITE_CONGRESS_API_KEY;

async function checkActions() {
  try {
    console.log('\n=== Checking Bill Actions ===');
    
    // Sample a few bills to check their actions
    const bills = [
      { congress: '119', type: 'hr', number: '1488' },
      { congress: '119', type: 'hr', number: '1476' },
      { congress: '119', type: 'hres', number: '146' },
      { congress: '119', type: 'hr', number: '1465' }
    ];

    for (const bill of bills) {
      console.log(`\nChecking ${bill.type}${bill.number} from congress ${bill.congress}...`);
      
      try {
        // Get bill details including actions
        const url = `https://api.congress.gov/v3/bill/${bill.congress}/${bill.type}/${bill.number}?format=json&api_key=${congressApiKey}`;
        const response = await axios.get(url);
        
        if (response.data?.bill) {
          const billData = response.data.bill;
          
          // Log actions count
          console.log(`Actions count: ${billData.actions?.count || 0}`);
          
          // Check actions structure
          if (billData.actions?.count > 0) {
            console.log('\nActions structure:');
            console.log(JSON.stringify(billData.actions, null, 2));
            
            // Check individual actions
            if (Array.isArray(billData.actions.items)) {
              console.log('\nAction texts:');
              billData.actions.items.forEach(action => {
                console.log(`- ${action.text}`);
              });
            } else {
              console.log('Warning: actions.items is not an array');
              console.log('actions.items type:', typeof billData.actions.items);
              console.log('actions.items value:', billData.actions.items);
            }
          }
          
          // Check latest action
          if (billData.latestAction) {
            console.log('\nLatest action:');
            console.log(JSON.stringify(billData.latestAction, null, 2));
          }
        }
      } catch (error) {
        console.error(`Error fetching bill ${bill.type}${bill.number}:`, error.message);
      }
      
      // Add a delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

  } catch (error) {
    console.error('Error checking actions:', error);
  }
}

// Run the check
checkActions().catch(console.error); 