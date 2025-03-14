// Service factory - Returns the correct service implementation based on configuration

import { isUsingInngest, isUsingGoogleCloud } from './config';
import { BaseSearchService } from './services/search/base-service';
import { BasePdfProxyService } from './services/pdf-proxy/base-service';

// Import implementations (we'll create these next)
// Note: Using dynamic imports to reduce startup overhead when only one is used
async function getGoogleCloudSearchService(): Promise<BaseSearchService> {
  const { GoogleCloudSearchService } = await import('./services/search/google-cloud');
  return new GoogleCloudSearchService();
}

async function getInngestSearchService(): Promise<BaseSearchService> {
  const { InngestSearchService } = await import('./services/search/inngest');
  return new InngestSearchService();
}

async function getGoogleCloudPdfProxyService(): Promise<BasePdfProxyService> {
  const { GoogleCloudPdfProxyService } = await import('./services/pdf-proxy/google-cloud');
  return new GoogleCloudPdfProxyService();
}

async function getInngestPdfProxyService(): Promise<BasePdfProxyService> {
  const { InngestPdfProxyService } = await import('./services/pdf-proxy/inngest');
  return new InngestPdfProxyService();
}

// Factory functions to get the appropriate service
export async function getSearchService(): Promise<BaseSearchService> {
  if (isUsingInngest()) {
    return getInngestSearchService();
  } else {
    return getGoogleCloudSearchService();
  }
}

export async function getPdfProxyService(): Promise<BasePdfProxyService> {
  if (isUsingInngest()) {
    return getInngestPdfProxyService();
  } else {
    return getGoogleCloudPdfProxyService();
  }
} 