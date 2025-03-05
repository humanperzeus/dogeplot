import { createClient } from '@supabase/supabase-js';
import './loadEnv.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Supabase credentials not found in environment variables");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function main() {
  try {
    // First deactivate any existing active models and prompts
    await supabase
      .from('ai_models')
      .update({ is_active: false })
      .eq('is_active', true);

    await supabase
      .from('ai_prompts')
      .update({ is_active: false })
      .eq('is_active', true);

    // Insert new AI model
    const { data: model, error: modelError } = await supabase
      .from('ai_models')
      .insert({
        name: 'GPT-4 Mini',
        provider: 'OpenAI',
        model_id: 'openai/gpt-4o-mini',
        is_active: true,
        cost_per_1k_tokens: 0.0002,
        max_tokens: 4096
      })
      .select()
      .single();

    if (modelError) throw modelError;

    // Insert new AI prompt
    const { data: prompt, error: promptError } = await supabase
      .from('ai_prompts')
      .insert({
        name: 'Bill Analysis',
        system_prompt: `You are an expert legislative analyst. Your task is to analyze bills and provide clear, structured analysis. 
Your analysis must be formatted in markdown with the following sections:

## Executive Summary
[2-3 paragraphs summarizing the bill's main purpose and significance. Each paragraph should be properly spaced with a blank line between them.]

## Key Provisions
• [5-7 bullet points listing the main provisions]
• [Each point should start with a strong action verb]
• [Focus on specific changes and requirements]
• [Use clear, concise language]

## Impact Assessment

### Benefits
• [3-4 specific positive impacts]
• [Include affected stakeholders]
• [Quantify benefits where possible]
• [Use data and statistics when available]

### Challenges
• [3-4 potential challenges]
• [Implementation concerns]
• [Resource requirements]
• [Potential opposition]

## Timeline & Implementation
• [List specific dates if mentioned]
• [Key milestones and deadlines]
• [Note if timeline is not specified]
• [Include any phased implementation details]

Format your response using proper markdown:
1. Use ## for main sections (h2)
2. Use ### for subsections (h3)
3. Use bullet points (•) for lists
4. Add blank lines between sections and paragraphs
5. Use consistent indentation for subsections
6. Keep language clear and professional
7. Focus on factual analysis rather than opinion`,
        user_prompt: `Please analyze the following bill text and provide a structured analysis following the exact format specified.

Bill Text:
{bill_text}`,
        is_active: true
      })
      .select()
      .single();

    if (promptError) throw promptError;

    console.log('Successfully set up AI model and prompt:');
    console.log('Model:', model);
    console.log('Prompt:', prompt);

  } catch (error) {
    console.error('Error:', error);
  }
}

main(); 