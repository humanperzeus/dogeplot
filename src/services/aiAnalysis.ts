import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openrouterApiKey = process.env.OPENROUTER_API_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Supabase credentials not found in environment variables");
}

if (!openrouterApiKey) {
  throw new Error("OpenRouter API key not found in environment variables");
}

const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

interface AIModel {
  id: string;
  name: string;
  provider: string;
  model_id: string;
  is_active: boolean;
  cost_per_1k_tokens: number;
  max_tokens: number;
}

interface AIPrompt {
  id: string;
  name: string;
  system_prompt: string;
  user_prompt: string;
  is_active: boolean;
}

interface BillAnalysis {
  id: string;
  bill_id: string;
  model_id: string;
  prompt_id: string;
  raw_response: string;
  processed_response: any;
  tokens: number;
  cost: number;
  processing_duration: number;
}

export async function getActiveModel(): Promise<AIModel | null> {
  const { data, error } = await supabase
    .from('ai_models')
    .select('*')
    .eq('is_active', true)
    .single();

  if (error) {
    console.error('Error fetching active model:', error);
    return null;
  }

  return data;
}

export async function getActivePrompt(): Promise<AIPrompt | null> {
  const { data, error } = await supabase
    .from('ai_prompts')
    .select('*')
    .eq('is_active', true)
    .single();

  if (error) {
    console.error('Error fetching active prompt:', error);
    return null;
  }

  return data;
}

export async function analyzeBill(billId: string, billText: string): Promise<void> {
  try {
    const startTime = Date.now();
    
    // Get active model and prompt
    const [model, prompt] = await Promise.all([
      getActiveModel(),
      getActivePrompt()
    ]);

    if (!model || !prompt) {
      throw new Error('No active model or prompt found');
    }

    // Prepare the message for OpenRouter
    const messages = [
      {
        role: "system",
        content: [{
          type: "text",
          text: prompt.system_prompt
        }]
      },
      {
        role: "user",
        content: [{
          type: "text",
          text: prompt.user_prompt.replace("{bill_text}", billText)
        }]
      }
    ];

    const requestBody = {
      model: model.model_id,
      messages: messages,
      max_tokens: model.max_tokens,
      temperature: 0.7,
      stream: false
    };

    console.log('Making OpenRouter API request:', {
      url: 'https://openrouter.ai/api/v1/chat/completions',
      model: model.model_id,
      messageCount: messages.length,
      max_tokens: model.max_tokens
    });

    // Call OpenRouter API
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/OpenRouterTeam/openrouter',
        'X-Title': 'BillTracker'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error details:', errorText);
      throw new Error(`OpenRouter API error: ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    const processingDuration = (Date.now() - startTime) / 1000;

    // Calculate cost based on token usage and model pricing
    const totalTokens = result.usage.total_tokens;
    const cost = (totalTokens / 1000) * model.cost_per_1k_tokens;

    // Process and structure the response with the AI generated summary
    const processedResponse = {
      summary: result.choices[0].message.content,
      metadata: {
        model: model.name,
        tokens: totalTokens,
        cost: cost,
        duration: processingDuration
      }
    };

    // Save analysis results
    const { error: analysisError } = await supabase
      .from('bill_analyses')
      .insert({
        bill_id: billId,
        model_id: model.id,
        prompt_id: prompt.id,
        raw_response: JSON.stringify(result),
        processed_response: processedResponse,
        tokens: totalTokens,
        cost: cost,
        processing_duration: processingDuration
      });

    if (analysisError) {
      throw analysisError;
    }

    // Update bill status
    const { error: updateError } = await supabase
      .from('bills')
      .update({
        analysis_status: 'completed',
        analysis: processedResponse.summary
      })
      .eq('id', billId);

    if (updateError) {
      throw updateError;
    }

  } catch (error) {
    console.error('Error analyzing bill:', error);
    
    // Update bill status to failed
    await supabase
      .from('bills')
      .update({
        analysis_status: 'failed',
        analysis: null
      })
      .eq('id', billId);

    throw error;
  }
}

// Function to check and analyze pending bills
export async function processPendingBills(): Promise<void> {
  try {
    // Get bills with pending analysis and full text
    const { data: pendingBills, error } = await supabase
      .from('bills')
      .select('id, full_text')
      .eq('analysis_status', 'pending')
      .not('full_text', 'is', null);

    if (error) {
      throw error;
    }

    // Process each pending bill
    for (const bill of pendingBills || []) {
      if (bill.full_text) {
        try {
          await analyzeBill(bill.id, bill.full_text);
          console.log(`Successfully analyzed bill ${bill.id}`);
        } catch (error) {
          console.error(`Error analyzing bill ${bill.id}:`, error);
          continue;
        }
      }
    }
  } catch (error) {
    console.error('Error processing pending bills:', error);
    throw error;
  }
} 