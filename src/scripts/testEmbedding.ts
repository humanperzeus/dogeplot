import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import OpenAI from 'openai';

async function testEmbedding() {
  console.log('=== Testing OpenAI Embedding Generation ===');
  
  // Load environment variables
  config({ path: '.env.production' });
  
  // Get credentials
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  console.log('Environment variables:');
  console.log('- VITE_SUPABASE_URL:', SUPABASE_URL ? '✅ Found' : '❌ Missing');
  console.log('- SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_KEY ? '✅ Found' : '❌ Missing');
  console.log('- OPENAI_API_KEY:', OPENAI_API_KEY ? '✅ Found' : '❌ Missing');
  
  if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_API_KEY) {
    console.error('Error: Missing required credentials');
    process.exit(1);
  }
  
  try {
    // Initialize clients
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    
    // Fetch a single bill that doesn't have an embedding yet
    console.log('\nFetching a bill without an embedding...');
    
    // Get existing embedding IDs
    const { data: existingEmbeddings } = await supabase
      .from('bill_embeddings')
      .select('id');
    
    const existingIds = existingEmbeddings?.map(e => e.id) || [];
    
    // Get a bill that doesn't have an embedding
    const { data: bills, error: billsError } = await supabase
      .from('bills')
      .select('id, bill_number, congress, title, full_text')
      .eq('has_full_text', true)
      .not('id', 'in', `(${existingIds.join(',')})`)
      .limit(1);
    
    if (billsError) {
      console.error('❌ Error fetching bill:', billsError.message);
      process.exit(1);
    }
    
    if (!bills || bills.length === 0) {
      console.log('No bills without embeddings found. Using a test string instead.');
      await testWithSampleText(openai);
      return;
    }
    
    const bill = bills[0];
    console.log(`Selected bill: ${bill.bill_number || bill.id}`);
    
    if (!bill.full_text) {
      console.log('Bill has no full text. Using a test string instead.');
      await testWithSampleText(openai);
      return;
    }
    
    // Prepare text for embedding
    const text = bill.full_text.replace(/\s+/g, ' ').trim().substring(0, 8000);
    console.log(`Text length: ${text.length} characters`);
    console.log('Sample text:', text.substring(0, 100) + '...');
    
    // Generate embedding
    console.log('\nGenerating embedding...');
    console.time('Embedding generation');
    
    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });
      
      console.timeEnd('Embedding generation');
      
      const embedding = response.data[0].embedding;
      console.log(`✅ Successfully generated embedding with ${embedding.length} dimensions`);
      console.log('First 5 values:', embedding.slice(0, 5));
      
      // Save the embedding
      console.log('\nSaving embedding to Supabase...');
      
      const embeddingObject = {
        id: bill.id,
        embedding: embedding,
        embedding_model: 'text-embedding-3-small',
        embedding_version: 1,
        text_processed: text.substring(0, 1000),
        similarity_threshold: 0.7,
        match_count: 5,
        updated_at: new Date().toISOString()
      };
      
      const { error: upsertError } = await supabase
        .from('bill_embeddings')
        .upsert(embeddingObject)
        .select();
      
      if (upsertError) {
        console.error('❌ Error saving embedding:', upsertError.message);
      } else {
        console.log('✅ Successfully saved embedding to Supabase');
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Error generating embedding:', errorMessage);
      
      if (error instanceof Error) {
        console.error('Error details:', error);
      }
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Unhandled error:', errorMessage);
  }
}

async function testWithSampleText(openai: OpenAI) {
  const sampleText = "This bill addresses climate change by establishing new renewable energy standards and funding for clean energy research.";
  console.log('Using sample text:', sampleText);
  
  try {
    console.log('\nGenerating embedding for sample text...');
    console.time('Sample embedding generation');
    
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: sampleText,
    });
    
    console.timeEnd('Sample embedding generation');
    
    const embedding = response.data[0].embedding;
    console.log(`✅ Successfully generated embedding with ${embedding.length} dimensions`);
    console.log('First 5 values:', embedding.slice(0, 5));
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error generating sample embedding:', errorMessage);
    
    if (error instanceof Error) {
      console.error('Error details:', error);
    }
  }
}

testEmbedding().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 