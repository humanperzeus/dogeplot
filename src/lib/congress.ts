import axios from "axios";

// Handle both browser and Node.js environments
const CONGRESS_API_KEY = typeof process !== 'undefined' ? process.env.VITE_CONGRESS_API_KEY : import.meta.env.VITE_CONGRESS_API_KEY;
const BASE_API_URL = "https://api.congress.gov/v3";
const DEFAULT_FORMAT = "json";

// Get the current Congress number
function getCurrentCongress(): number {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const currentDay = new Date().getDate();

  // Base calculation: Congress starts in odd years
  let congressNumber = Math.floor((currentYear - 1789) / 2) + 1;

  // Adjust for the fact that new Congress starts on January 3rd
  if (currentYear % 2 === 0 || (currentMonth === 0 && currentDay < 3)) {
    // In even years or before Jan 3rd, we're in the previous Congress
    congressNumber = Math.floor((currentYear - 1 - 1789) / 2) + 1;
  }

  return congressNumber;
}

async function fetchCurrentCongress(): Promise<number> {
  try {
    const response = await axios.get(`${BASE_API_URL}/congress?format=${DEFAULT_FORMAT}&api_key=${CONGRESS_API_KEY}`);
    const congresses = response.data?.congresses || [];
    if (congresses.length > 0) {
      // The first congress in the list is the current one
      return congresses[0].congress;
    }
  } catch (error) {
    console.warn("Failed to fetch current Congress from API, using calculated value:", error);
  }
  return getCurrentCongress(); // Fallback to calculated value
}

// Set current Congress
const CURRENT_CONGRESS = getCurrentCongress();
console.log(`Current Congress set to ${CURRENT_CONGRESS}`);

interface Bill {
  congress: number;
  type: string;
  number: string;
  title: string;
  originChamber: string;
  introducedDate: string;
  latestAction: {
    actionDate: string;
    text: string;
  };
  policyArea?: {
    name: string;
  };
  subjects?: string[];
  status: string;
  sponsors: Array<{
    firstName: string;
    lastName: string;
    party: string;
    state: string;
  }>;
  textVersions?: Array<{
    type: string;
    url: string;
    format: string;
  }>;
}

interface FetchBillsOptions {
  limit?: number;
  offset?: number;
  congress?: number; // Allow specifying which Congress to fetch from
}

export async function fetchRecentBills(options: FetchBillsOptions = {}): Promise<Bill[]> {
  if (!CONGRESS_API_KEY) {
    throw new Error("Congress API key is not set");
  }

  const BATCH_SIZE = 25; // Keep internal batch size at 25 for optimal performance
  const requestedLimit = options.limit || 25;
  const offset = options.offset || 0;
  const congress = options.congress || CURRENT_CONGRESS;
  
  try {
    console.log(`Fetching bills with limit=${requestedLimit}, offset=${offset} from Congress ${congress}...`);
    console.log(`Will fetch in ${Math.ceil(requestedLimit / BATCH_SIZE)} batches of ${BATCH_SIZE} bills each`);
    
    const allBills: Bill[] = [];
    const remainingBatches = Math.ceil(requestedLimit / BATCH_SIZE);
    let hasError = false;
    
    for (let batch = 0; batch < remainingBatches; batch++) {
      try {
        const currentOffset = offset + (batch * BATCH_SIZE);
        const currentLimit = Math.min(BATCH_SIZE, requestedLimit - (batch * BATCH_SIZE));
        
        if (currentLimit <= 0) break;
        
        console.log(`\n=== Batch ${batch + 1}/${remainingBatches} ===`);
        console.log(`Offset: ${currentOffset}, Limit: ${currentLimit}`);
        
        // Use specified Congress number
        const congressUrl = `${BASE_API_URL}/bill/${congress}?format=${DEFAULT_FORMAT}&sort=updateDate&offset=${currentOffset}&limit=${currentLimit}&api_key=${CONGRESS_API_KEY}`;
        
        // Log URL with hidden API key for debugging
        console.log("Request URL:", congressUrl.replace(CONGRESS_API_KEY, 'HIDDEN'));
        
        // Fetch bills from current congress
        const response = await axios.get(congressUrl);
        
        // Log response status and headers
        console.log(`Response Status: ${response.status}`);
        console.log(`Response Headers:`, JSON.stringify(response.headers, null, 2));
        
        const bills = response.data?.bills || [];
        console.log(`Raw bills received: ${bills.length}`);
        
        if (bills.length === 0) {
          console.log("No bills returned in this batch, stopping pagination");
          break;
        }
        
        // Sort bills by date
        const batchBills = bills
          .sort((a, b) => new Date(b.updateDate).getTime() - new Date(a.updateDate).getTime())
          .slice(0, currentLimit);
        
        console.log(`Processed bills in batch: ${batchBills.length}`);
        allBills.push(...batchBills);
        
        // If we didn't get a full batch, we can stop
        if (bills.length < currentLimit) {
          console.log("Received incomplete batch, stopping pagination");
          break;
        }
        
        // Add a small delay between batches to be nice to the API
        if (batch < remainingBatches - 1) {
          const delay = 2000; // Increase delay to 2 seconds
          console.log(`Waiting ${delay}ms before next batch...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (batchError) {
        hasError = true;
        console.error(`Error in batch ${batch + 1}:`, batchError);
        if (axios.isAxiosError(batchError)) {
          console.error("API Error Details:", {
            status: batchError.response?.status,
            statusText: batchError.response?.statusText,
            data: batchError.response?.data,
            headers: batchError.response?.headers
          });
        }
        // Continue with next batch instead of stopping completely
        continue;
      }
    }
    
    console.log(`\n=== Summary ===`);
    console.log(`Total bills fetched: ${allBills.length}`);
    console.log(`Target limit was: ${requestedLimit}`);
    if (hasError) {
      console.log("⚠️ Some batches had errors, total count might be affected");
    }
    
    return allBills;
    
  } catch (error) {
    console.error("Fatal error in fetchRecentBills:");
    if (axios.isAxiosError(error)) {
      console.error("API Error:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers
      });
    } else {
      console.error(error);
    }
    throw error;
  }
}

interface PDFResult {
  buffer: Buffer | null;
  url: string | null;
}

export async function fetchBillPDF(congress: number, type: string, number: string): Promise<PDFResult> {
  if (!CONGRESS_API_KEY) {
    throw new Error("Congress API key is not set");
  }

  try {
    const textVersionsUrl = `${BASE_API_URL}/bill/${congress}/${type}/${number}/text?format=json&api_key=${CONGRESS_API_KEY}`;
    const response = await axios.get(textVersionsUrl);
    const data = response.data;

    if (!data.textVersions || !data.textVersions.length) {
      console.log(`No text versions available yet for ${congress}${type}${number}`);
      return { buffer: null, url: null };
    }

    // Get the most recent version
    const latestVersion = data.textVersions[0];
    if (!latestVersion.formats || !latestVersion.formats.length) {
      console.log(`No formats available for ${congress}${type}${number}`);
      return { buffer: null, url: null };
    }

    // Try to get PDF format
    const pdfFormat = latestVersion.formats.find(f => f.type === 'PDF');
    
    if (!pdfFormat) {
      console.log(`No PDF format available for ${congress}${type}${number}`);
      return { buffer: null, url: null };
    }

    // Fetch the PDF content as a buffer
    const contentResponse = await axios.get(pdfFormat.url, {
      responseType: 'arraybuffer'
    });
    
    if (contentResponse.status !== 200) {
      console.log(`Error fetching PDF for ${congress}${type}${number}: ${contentResponse.status} ${contentResponse.statusText}`);
      return { buffer: null, url: pdfFormat.url };
    }

    return { 
      buffer: Buffer.from(contentResponse.data),
      url: pdfFormat.url
    };

  } catch (error) {
    console.log(`Error fetching PDF for ${congress}${type}${number}:`, error);
    return { buffer: null, url: null };
  }
}

async function fetchBillTextVersions(congress: number, type: string, number: string): Promise<Array<{ type: string; url: string; format: string; }> | null> {
  try {
    const textVersionsUrl = `https://api.congress.gov/v3/bill/${congress}/${type}/${number}/text?format=json&api_key=${process.env.CONGRESS_API_KEY}`;
    const response = await fetch(textVersionsUrl);
    const data = await response.json();

    if (!data.textVersions || !data.textVersions.length) {
      console.log(`No text versions available yet for ${type}${number}`);
      return null;
    }

    const versions: Array<{ type: string; url: string; format: string; }> = [];

    // Process each text version
    for (const version of data.textVersions) {
      if (version.formats) {
        for (const format of version.formats) {
          versions.push({
            type: version.type,
            url: format.url,
            format: format.type
          });
        }
      }
    }

    return versions.length > 0 ? versions : null;

  } catch (error) {
    console.log(`Error fetching text versions for bill ${type}${number}:`, error);
    return null;
  }
}

async function processBill(bill: any): Promise<Bill | null> {
  try {
    // Create the bill object with basic information
    const processedBill: Bill = {
      congress: bill.congress,
      type: bill.type,
      number: bill.number,
      title: bill.title,
      originChamber: bill.originChamber,
      introducedDate: bill.introducedDate,
      latestAction: bill.latestAction,
      sponsors: bill.sponsors.map((sponsor: any) => ({
        firstName: sponsor.firstName,
        lastName: sponsor.lastName,
        party: sponsor.party,
        state: sponsor.state
      })),
      status: bill.latestAction?.text || 'Unknown'
    };

    // Try to fetch text versions
    try {
      const textVersions = await fetchBillTextVersions(bill.congress, bill.type, bill.number);
      if (textVersions) {
        processedBill.textVersions = textVersions;
      }
    } catch (textError) {
      console.log(`Error fetching text versions for bill ${bill.type}${bill.number}, continuing with basic information:`, textError);
    }

    return processedBill;
  } catch (error) {
    console.error(`Error processing bill ${bill.type}${bill.number}:`, error);
    return null;
  }
}
