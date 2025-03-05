import { Bill as SupabaseBill } from './supabase';

// Extend the Supabase Bill type with additional properties for UI display
export interface UIBill extends SupabaseBill {
  similarity?: number; // For semantic search results
  distance?: number; // Alternative measure sometimes used in vector search
  score?: number; // Generic score field that might be returned
}

// Create a type specifically for semantic search results
export interface SemanticSearchResult extends UIBill {
  similarity: number; // Always present in semantic search results
}

export type { SupabaseBill }; 