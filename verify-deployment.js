// Deployment verification script
// This script checks if the deployment is working correctly
// Run with: node verify-deployment.js [url]

import fetch from 'node-fetch';
import { execSync } from 'child_process';

// Get the URL from command line args or use default
const url = process.argv[2] || 'http://localhost:3001';

console.log(`🔍 Verifying deployment at: ${url}`);
console.log('=======================================\n');

async function verifyDeployment() {
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
    
    // Check if it contains expected content
    if (mainHtml.includes('<div id="root"></div>')) {
      console.log('✅ Found root div element');
    } else {
      console.error('❌ Root div element not found');
      return false;
    }
    
    // Check if assets are loading
    console.log('\n📄 Checking for asset references...');
    
    // Extract asset paths from HTML
    const assetMatches = mainHtml.match(/src="([^"]+)"|href="([^"]+)"/g) || [];
    const assetPaths = assetMatches
      .map(match => match.replace(/src="|href="|"/g, ''))
      .filter(path => path.startsWith('/assets/') || path.endsWith('.js') || path.endsWith('.css'));
    
    console.log(`Found ${assetPaths.length} asset references:`);
    assetPaths.forEach(path => console.log(`  - ${path}`));
    
    // Check if each asset loads
    console.log('\n📄 Checking if assets load...');
    let allAssetsLoaded = true;
    
    for (const path of assetPaths) {
      const assetUrl = new URL(path, url).toString();
      try {
        const assetResponse = await fetch(assetUrl);
        if (assetResponse.ok) {
          console.log(`✅ Asset loaded: ${path}`);
        } else {
          console.error(`❌ Asset failed to load: ${path} (${assetResponse.status})`);
          allAssetsLoaded = false;
        }
      } catch (error) {
        console.error(`❌ Error loading asset: ${path}`, error);
        allAssetsLoaded = false;
      }
    }
    
    if (allAssetsLoaded) {
      console.log('\n✅ All assets loaded successfully');
    } else {
      console.error('\n❌ Some assets failed to load');
      return false;
    }
    
    console.log('\n🎉 Deployment verification completed successfully!');
    return true;
  } catch (error) {
    console.error('❌ Error verifying deployment:', error);
    return false;
  }
}

// Run the verification
verifyDeployment().then(success => {
  if (!success) {
    console.error('\n❌ Deployment verification failed');
    process.exit(1);
  }
}); 