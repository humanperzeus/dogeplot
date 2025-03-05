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

async function cleanupDuplicates() {
  try {
    console.log('\n=== Starting Duplicate Cleanup ===');

    // Find all duplicate bills using raw SQL
    console.log('Finding duplicate bills...');
    const { data: duplicates, error: findError } = await supabase
      .from('bills')
      .select('congress, bill_type, bill_number')
      .eq('congress', '118'); // Start with congress 118

    if (findError) {
      console.error('Error finding bills:', findError);
      return;
    }

    // Group duplicates
    const duplicateGroups = duplicates.reduce((groups, bill) => {
      const key = `${bill.congress}_${bill.bill_type}_${bill.bill_number}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(bill);
      return groups;
    }, {});

    // Filter to only groups with duplicates
    const duplicateSets = Object.entries(duplicateGroups)
      .filter(([_, bills]) => bills.length > 1)
      .map(([key, bills]) => {
        const [congress, bill_type, bill_number] = key.split('_');
        return { congress, bill_type, bill_number, count: bills.length };
      });

    console.log(`Found ${duplicateSets.length} sets of duplicate bills`);

    if (duplicateSets.length === 0) {
      console.log('No duplicates found!');
      return;
    }

    // For each set of duplicates
    for (const dup of duplicateSets) {
      console.log(`\nProcessing duplicates for ${dup.bill_type}${dup.bill_number} (Congress ${dup.congress})`);

      // Get all versions of this bill
      const { data: versions, error: versionsError } = await supabase
        .from('bills')
        .select('*')
        .eq('congress', dup.congress)
        .eq('bill_type', dup.bill_type)
        .eq('bill_number', dup.bill_number)
        .order('update_date', { ascending: false });

      if (versionsError) {
        console.error('Error getting versions:', versionsError);
        continue;
      }

      if (!versions || versions.length < 2) {
        console.log('No duplicates found for this bill');
        continue;
      }

      // Keep the most recently updated version
      const [latest, ...outdated] = versions;
      console.log(`Keeping version updated at ${latest.update_date}`);
      console.log(`Removing ${outdated.length} older versions`);

      // Delete older versions
      const { error: deleteError } = await supabase
        .from('bills')
        .delete()
        .in('id', outdated.map(v => v.id));

      if (deleteError) {
        console.error('Error deleting outdated versions:', deleteError);
      } else {
        console.log('Successfully removed outdated versions');
      }
    }

    console.log('\n=== Cleanup Complete ===');

  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

// Run the cleanup
cleanupDuplicates().catch(console.error); 