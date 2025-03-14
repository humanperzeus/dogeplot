export interface Bill {
  id: string;
  bill_number: string;
  congress: string;
  title: string;
  introduction_date: string;
  key_points: string[];
  analysis: string | null;
  status: "introduced" | "referred_to_committee" | "reported_by_committee" | "passed_chamber" | "passed_both_chambers" | "presented_to_president" | "signed_into_law" | "vetoed" | "veto_overridden" | "failed";
  analysis_status: "pending" | "completed" | "failed";
  sponsors: string[];
  committee: string | null;
  full_text: string | null;
  related_bills: { id: string; title: string }[];
  created_at: string;
  updated_at: string;
  // New fields
  bill_type: string | null;
  origin_chamber: string | null;
  origin_chamber_code: string | null;
  latest_action_date: string | null;
  latest_action_text: string | null;
  constitutional_authority_text: string | null;
  policy_area: string | null;
  subjects: string[];
  summary: string | null;
  cbo_cost_estimates: Array<{
    description: string;
    pubDate: string;
    title: string;
    url: string;
  }>;
  laws: Array<{
    number: string;
    type: string;
  }>;
  committees_count: number;
  cosponsors_count: number;
  withdrawn_cosponsors_count: number;
  actions_count: number;
  update_date: string | null;
  update_date_including_text: string | null;
  pdf_url: string | null;
  // For semantic search results
  similarity?: number;
}

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  model_id: string;
  is_active: boolean;
  cost_per_1k_tokens: number;
  max_tokens: number;
  created_at: string;
  updated_at: string;
}

export interface AIPrompt {
  id: string;
  name: string;
  system_prompt: string;
  user_prompt: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BillAnalysis {
  id: string;
  bill_id: string;
  model_id: string;
  prompt_id: string;
  raw_response: string;
  processed_response: {
    summary: string;
    metadata: {
      model: string;
      tokens: number;
      cost: number;
      duration: number;
    };
  };
  tokens: number;
  cost: number;
  processing_duration: number;
  created_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      bills: {
        Row: {
          id: string;
          bill_number: string;
          congress: string;
          title: string;
          introduction_date: string;
          key_points: string[];
          analysis: string | null;
          status: "introduced" | "referred_to_committee" | "reported_by_committee" | "passed_chamber" | "passed_both_chambers" | "presented_to_president" | "signed_into_law" | "vetoed" | "veto_overridden" | "failed";
          analysis_status: "pending" | "completed" | "failed";
          sponsors: string[];
          committee: string | null;
          full_text: string | null;
          related_bills: { id: string; title: string }[];
          created_at: string;
          updated_at: string;
          // New fields
          bill_type: string | null;
          origin_chamber: string | null;
          origin_chamber_code: string | null;
          latest_action_date: string | null;
          latest_action_text: string | null;
          constitutional_authority_text: string | null;
          policy_area: string | null;
          subjects: string[];
          summary: string | null;
          cbo_cost_estimates: Array<{
            description: string;
            pubDate: string;
            title: string;
            url: string;
          }>;
          laws: Array<{
            number: string;
            type: string;
          }>;
          committees_count: number;
          cosponsors_count: number;
          withdrawn_cosponsors_count: number;
          actions_count: number;
          update_date: string | null;
          update_date_including_text: string | null;
          pdf_url: string | null;
        };
      };
      ai_models: {
        Row: AIModel;
      };
      ai_prompts: {
        Row: AIPrompt;
      };
      bill_analyses: {
        Row: BillAnalysis;
      };
    };
  };
}
