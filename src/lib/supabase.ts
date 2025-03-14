import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

console.log('\n🔍 Supabase Client Initialization');
console.log('═══════════════════════════════');
console.log('Environment Mode:', import.meta.env.MODE);
console.log('VITE_MODE:', import.meta.env.VITE_MODE);
console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL);
console.log('═══════════════════════════════\n');

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
