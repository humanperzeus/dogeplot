// Content Type Verification Script
// This script checks if the deployed assets are being served with the correct content types
// Run with: node verify-content-types.js [url]

import fetch from 'node-fetch';
import { execSync } from 'child_process';

// Get the URL from command line args or use default
const url = process.argv[2] || 'http://localhost:3001';

console.log(`🔍 Verifying content types at: ${url}`);
console.log('=======================================\n');

async function verifyContentTypes() {
  try {
    // Check if the main page loads
    console.log('📄 Checking main page...');
    const mainResponse = await fetch(url);
    
    if (!mainResponse.ok) {
      console.error(`❌ Main page returned status: ${mainResponse.status}`);
      return false;
    }
    
    const mainHtml = await mainResponse.text();
    console.log(`✅ Main page loaded (${mainHtml.length} bytes)`);
    
    // Extract asset paths from HTML
    const assetMatches = mainHtml.match(/src="([^"]+)"|href="([^"]+)"/g) || [];
    const assetPaths = assetMatches
      .map(match => match.replace(/src="|href="|"/g, ''))
      .filter(path => path.startsWith('/assets/') || path.endsWith('.js') || path.endsWith('.css'));
    
    console.log(`Found ${assetPaths.length} asset references:`);
    assetPaths.forEach(path => console.log(`  - ${path}`));
    
    // Check content types for each asset
    console.log('\n📄 Checking content types for assets...');
    let allContentTypesCorrect = true;
    
    for (const path of assetPaths) {
      const assetUrl = new URL(path, url).toString();
      try {
        const response = await fetch(assetUrl, { method: 'HEAD' });
        const contentType = response.headers.get('content-type');
        
        let expectedType = 'text/plain';
        if (path.endsWith('.js')) {
          expectedType = 'application/javascript';
        } else if (path.endsWith('.css')) {
          expectedType = 'text/css';
        } else if (path.endsWith('.png')) {
          expectedType = 'image/png';
        } else if (path.endsWith('.svg')) {
          expectedType = 'image/svg+xml';
        }
        
        const isCorrect = contentType && contentType.includes(expectedType);
        
        if (isCorrect) {
          console.log(`✅ ${path}: ${contentType}`);
        } else {
          console.error(`❌ ${path}: Got "${contentType}", expected "${expectedType}"`);
          allContentTypesCorrect = false;
          
          // For JS files, try to get the actual content to see what's being returned
          if (path.endsWith('.js')) {
            const contentResponse = await fetch(assetUrl);
            const content = await contentResponse.text();
            console.error(`First 100 characters of response: ${content.substring(0, 100)}...`);
          }
        }
      } catch (error) {
        console.error(`❌ Error checking ${path}:`, error);
        allContentTypesCorrect = false;
      }
    }
    
    if (allContentTypesCorrect) {
      console.log('\n✅ All assets have correct content types');
    } else {
      console.error('\n❌ Some assets have incorrect content types');
      return false;
    }
    
    console.log('\n🎉 Content type verification completed!');
    return true;
  } catch (error) {
    console.error('❌ Error verifying content types:', error);
    return false;
  }
}

// Run the verification
verifyContentTypes().then(success => {
  if (!success) {
    console.error('\n❌ Content type verification failed');
    process.exit(1);
  }
}); 