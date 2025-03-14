import { config } from 'dotenv';
import OpenAI from 'openai';

async function testOpenAI() {
  console.log('=== Testing OpenAI API Connection ===');
  
  // Load environment variables
  config({ path: '.env.production' });
  
  // Get OpenAI API key
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  console.log('OPENAI_API_KEY:', OPENAI_API_KEY ? '✅ Found' : '❌ Missing');
  
  if (!OPENAI_API_KEY) {
    console.error('Error: Missing OpenAI API key');
    process.exit(1);
  }
  
  try {
    // Initialize OpenAI client
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    
    // Test with a simple embedding
    const sampleText = "This is a test of the OpenAI API connection.";
    console.log(`\nGenerating embedding for: "${sampleText}"`);
    
    console.time('Embedding generation');
    
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: sampleText,
    });
    
    console.timeEnd('Embedding generation');
    
    const embedding = response.data[0].embedding;
    console.log(`\n✅ Successfully generated embedding with ${embedding.length} dimensions`);
    console.log('First 5 values:', embedding.slice(0, 5));
    
    // Test with a simple completion
    console.log('\nTesting completion API...');
    console.time('Completion generation');
    
    const completionResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello, how are you?' }
      ],
      max_tokens: 50
    });
    
    console.timeEnd('Completion generation');
    
    console.log('\n✅ Successfully generated completion:');
    console.log(completionResponse.choices[0].message.content);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Error testing OpenAI API:', errorMessage);
    
    if (error instanceof Error) {
      console.error('Error details:', error);
    }
  }
}

testOpenAI().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 