// Test script for semantic search
// Run with: npx ts-node src/test-semantic-search.ts

async function testSemanticSearch() {
  console.log('🧪 Testing semantic search endpoint directly');
  
  const query = 'climate change';
  const threshold = 0.2;
  const limit = 10;
  
  // Build the query params
  const params = new URLSearchParams();
  params.append('query', query);
  params.append('threshold', threshold.toString());
  params.append('limit', limit.toString());
  
  // Create the endpoint URL
  // Assuming the server is running on port 3001
  const proxyEndpoint = `http://localhost:3001/proxy/semantic-search?${params.toString()}`;
  console.log('🔍 Calling semantic search endpoint:', proxyEndpoint);
  
  try {
    // Call the endpoint
    const response = await fetch(proxyEndpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error('❌ Semantic search request failed:', response.status, response.statusText);
      return;
    }
    
    // Parse the response
    const data = await response.json();
    console.log('✅ Response structure:', Object.keys(data));
    
    // Check the structure of the response
    if (data.results) {
      console.log(`✅ Found ${data.results.length} results in 'results' field`);
      console.log('First 3 results:');
      data.results.slice(0, 3).forEach((result: any, i: number) => {
        console.log(`Result #${i+1}:`, {
          id: result.id,
          similarity: result.similarity,
          title: result.title?.substring(0, 50) + '...'
        });
      });
    } else if (data.bills) {
      console.log(`✅ Found ${data.bills.length} results in 'bills' field`);
      console.log('First 3 results:');
      data.bills.slice(0, 3).forEach((bill: any, i: number) => {
        console.log(`Result #${i+1}:`, {
          id: bill.id,
          similarity: bill.similarity,
          title: bill.title?.substring(0, 50) + '...'
        });
      });
    } else {
      console.error('❌ No bills or results found in API response');
    }
  } catch (error) {
    console.error('❌ Error performing semantic search:', error);
  }
}

// Run the test
testSemanticSearch(); 