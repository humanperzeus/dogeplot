// Inngest client configuration
// Note: To use Inngest, you'll need to run: npm install inngest

import { Inngest } from 'inngest';
import { serve } from 'inngest/express';
import { Express } from 'express';

// Create and export the Inngest client
export const inngest = new Inngest({ 
  id: 'bill-tracker', 
  name: 'Bill Tracker',
  // Inngest Signing Keys for production 
  // (when ready to push to cloud after testing locally)
  // signingKey: process.env.INNGEST_SIGNING_KEY,
});

// Define event types for type safety
export type BillTrackerEvents = {
  'pdf.proxy.requested': {
    data: {
      url: string;
      billId?: string;
      userIp?: string;
    };
  };
  'semantic.search.requested': {
    data: {
      query: string;
      threshold?: number;
      limit?: number;
      modelFilter?: string;
      versionFilter?: number;
    };
  };
};

// Type for Inngest functions
interface InngestFunction {
  name: string;
  handler: Function;
  [key: string]: any;
}

// Helper to register all functions with Express
export function registerInngestFunctions(app: Express) {
  try {
    // Import all function files
    // Note: These will only work after you've created the function files
    const searchFunctions = require('./functions/search');
    const pdfFunctions = require('./functions/pdf-proxy');
    
    // Get all exported functions with proper typing
    const functions = [
      ...Object.values(searchFunctions || {}),
      ...Object.values(pdfFunctions || {}),
    ].filter((fn): fn is InngestFunction => 
      fn !== null && 
      typeof fn === 'object' && 
      'handler' in fn && 
      typeof fn.handler === 'function'
    );
    
    // Register with Express
    app.use(serve({
      client: inngest,
      functions,
    }));
    
    console.log(`✅ Registered ${functions.length} Inngest functions`);
  } catch (error) {
    console.warn('⚠️ Failed to register Inngest functions:', error);
    console.warn('You may need to install Inngest: npm install inngest');
  }
} 