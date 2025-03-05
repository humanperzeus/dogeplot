
    import { parentPort, workerData } from 'worker_threads';
    import { createClient } from "@supabase/supabase-js";
    import { PDFExtract } from "pdf.js-extract";
    import axios from "axios";
    import { v5 as uuidv5 } from 'uuid';

    const { bills, workerIndex, env, congressApiKey, quiet } = workerData;
    const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    
    const supabase = createClient(
      env.supabaseUrl,
      env.serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const pdfExtract = new PDFExtract();

    // Enhanced rate limit handling
    // Track consecutive rate limit hits to implement circuit breaker
    let rateLimitHits = 0;
    const MAX_CONSECUTIVE_RATE_LIMITS = 5;
    let cooldownUntil = 0;
    let rateLimitedBills = [];
    
    // Queue to hold rate-limited bills for later retry
    const retryQueue = [];
    
    // Enhanced fetch with better rate limit handling and exponential backoff
    async function fetchWithRetry(url, options = {}, maxRetries = 5) {
      // Check if we're in a cooling off period
      const now = Date.now();
      if (now < cooldownUntil) {
        const waitTime = Math.ceil((cooldownUntil - now) / 1000);
        console.log("⏳ In cooling off period. Waiting " + waitTime + "s before trying again...");
        await new Promise(resolve => setTimeout(resolve, cooldownUntil - now));
      }
      
      let lastError;
      for (let i = 0; i < maxRetries; i++) {
        try {
          if (!quiet) {
            console.log("Attempt " + (i + 1) + " of " + maxRetries + " for " + url);
          }
          const response = await axios.get(url, {
            ...options,
            headers: {
              'X-API-Key': congressApiKey,
              ...(options?.headers || {})
            }
          });
          
          // Success - reset rate limit counter
          rateLimitHits = 0;
          return response;
        } catch (error) {
          lastError = error;
          
          // Check for rate limiting or service unavailability
          if (error.response) {
            if (error.response.status === 429) {
              // Rate limit hit - implement exponential backoff
              rateLimitHits++;
              console.log("⚠️ Rate limit hit (" + rateLimitHits + "), implementing exponential backoff...");
              
              // Calculate backoff time: 2^retry * 1000ms + random jitter
              const backoffTime = Math.pow(2, i) * 1000 + Math.random() * 1000;
              
              // If we've hit rate limits too many times consecutively, 
              // implement a longer cooling off period
              if (rateLimitHits >= MAX_CONSECUTIVE_RATE_LIMITS) {
                const cooldownTimeMs = 60000 + Math.random() * 30000; // 60-90 sec
                console.log("🛑 Too many consecutive rate limits! Cooling off for " + Math.round(cooldownTimeMs/1000) + "s");
                cooldownUntil = Date.now() + cooldownTimeMs;
                
                // Send message to parent about cooling off
                parentPort?.postMessage({
                  type: 'rateLimitCooldown',
                  data: {
                    cooldownTimeMs,
                    workerIndex
                  }
                });
                
                await new Promise(resolve => setTimeout(resolve, cooldownTimeMs));
                rateLimitHits = 0; // Reset after cooling off
                continue;
              }
              
              console.log("Backing off for " + Math.round(backoffTime/1000) + "s before retry...");
              await new Promise(resolve => setTimeout(resolve, backoffTime));
              continue;
            }
            
            if (error.response.status === 503) {
              console.log('Service unavailable, waiting before retry...');
              // Longer wait for service unavailable
              const waitTime = 5000 * (i + 1);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              continue;
            }
            
            // Other HTTP errors
            console.error("HTTP Error " + error.response.status + ": " + error.response.statusText);
          }
          
          // General error handling for non-HTTP errors
          console.error("Attempt " + (i + 1) + " failed: " + error.message);
          
          if (i === maxRetries - 1) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
      throw lastError;
    }

    function determineBillStatus(billData) {
      if (!billData.actions || !billData.actions.count) return "introduced";

      const actionText = billData.latestAction?.text?.toLowerCase() || "";
      const laws = billData.laws || [];

      // Check for terminal states first
      if (laws.length > 0 || actionText.includes("became public law") || actionText.includes("signed by president")) {
        return "signed_into_law";
      }

      if (actionText.includes("veto overridden")) {
        return "veto_overridden";
      }

      if (actionText.includes("vetoed by president") || actionText.includes("vetoed by the president")) {
        return "vetoed";
      }

      // Check for intermediate states
      if (actionText.includes("presented to president") || actionText.includes("sent to president")) {
        return "presented_to_president";
      }

      // Check for chamber passage
      const passedHouse = actionText.includes("passed house") || actionText.includes("passed in house");
      const passedSenate = actionText.includes("passed senate") || actionText.includes("passed in senate");

      if (passedHouse && passedSenate) {
        return "passed_both_chambers";
      }

      if (passedHouse || passedSenate) {
        return "passed_chamber";
      }

      if (actionText.includes("reported") || actionText.includes("ordered to be reported")) {
        return "reported_by_committee";
      }

      if (actionText.includes("referred to")) {
        return "referred_to_committee";
      }

      // Check for failed state
      if (actionText.includes("failed") || actionText.includes("rejected") || actionText.includes("withdrawn")) {
        return "failed";
      }

      return "introduced";
    }

    async function extractTextFromPDF(pdfBuffer) {
      try {
        const data = await pdfExtract.extractBuffer(pdfBuffer);
        return data.pages
          .map((page) => page.content.map((item) => item.str).join(" "))
          .join("\n");
      } catch (error) {
        console.error("Error extracting text from PDF:", error);
        throw error;
      }
    }

    async function fetchBillText(billData) {
      try {
        if (!billData.textVersions?.url) {
          console.log('No text versions URL available');
          return { text: null, source: null, pdfUrl: null };
        }

        console.log('\nFetching text versions...');
        const textVersionsResponse = await fetchWithRetry(billData.textVersions.url);
        const textVersions = textVersionsResponse.data.textVersions;

        if (!textVersions || textVersions.length === 0) {
          console.log('No text versions available');
          return { text: null, source: null, pdfUrl: null };
        }

        const latestVersion = textVersions[textVersions.length - 1];
        console.log('\nText version details:');
        console.log('- Date:', latestVersion.date);
        console.log('- Type:', latestVersion.type);
        console.log('Available formats:', latestVersion.formats.map(f => f.type).join(', '));

        const txtFormat = latestVersion.formats.find(f => f.type === 'Text');
        const xmlFormat = latestVersion.formats.find(f => f.type === 'Formatted XML');
        const htmlFormat = latestVersion.formats.find(f => f.type === 'Formatted Text');
        const pdfFormat = latestVersion.formats.find(f => f.type === 'PDF');

        console.log('\nFormat availability:');
        console.log('- Text format:', txtFormat ? 'Available' : 'Not available');
        console.log('- XML format:', xmlFormat ? 'Available' : 'Not available');
        console.log('- HTML format:', htmlFormat ? 'Available' : 'Not available');
        console.log('- PDF format:', pdfFormat ? 'Available' : 'Not available');

        if (txtFormat) {
          try {
            console.log('\nAttempting to fetch Text format...');
            const response = await fetchWithRetry(txtFormat.url);
            console.log('Successfully retrieved Text format');
            return {
              text: response.data,
              source: 'api',
              pdfUrl: pdfFormat?.url || null
            };
          } catch (error) {
            console.error("Failed to fetch Text format:", error.message);
          }
        }

        if (xmlFormat) {
          try {
            console.log('\nAttempting to fetch XML format...');
            const response = await fetchWithRetry(xmlFormat.url);
            console.log('Successfully retrieved XML format, processing content...');
            const text = response.data
              .replace(/&#x2019;/g, "'")
              .replace(/&#x201[CD]/g, '"')
              .replace(/&#x2013;/g, "-")
              .replace(/&#x2014;/g, "--")
              .replace(/&#xA0;/g, " ")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim();

            return {
              text,
              source: 'api',
              pdfUrl: pdfFormat?.url || null
            };
          } catch (error) {
            console.error("Failed to fetch XML format:", error.message);
          }
        }

        if (htmlFormat) {
          try {
            console.log('\nAttempting to fetch HTML format...');
            const response = await fetchWithRetry(htmlFormat.url);
            console.log('Successfully retrieved HTML format, processing content...');
            const text = response.data
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();

            return {
              text,
              source: 'api',
              pdfUrl: pdfFormat?.url || null
            };
          } catch (error) {
            console.error("Failed to fetch HTML format:", error.message);
          }
        }

        if (pdfFormat) {
          try {
            console.log('\nAttempting to process PDF format...');
            const pdfResponse = await fetchWithRetry(pdfFormat.url, {
              responseType: 'arraybuffer',
              headers: {
                'Accept': 'application/pdf'
              }
            });
            
            console.log('Successfully downloaded PDF, extracting text...');
            const pdfBuffer = Buffer.from(pdfResponse.data);
            const text = await extractTextFromPDF(pdfBuffer);
            console.log('Successfully extracted text from PDF');
            
            return {
              text,
              source: 'pdf',
              pdfUrl: pdfFormat.url
            };
          } catch (error) {
            console.error("Failed to process PDF:", error.message);
            return {
              text: null,
              source: null,
              pdfUrl: pdfFormat.url
            };
          }
        }

        console.log('No viable text formats found');
        return { text: null, source: null, pdfUrl: null };
      } catch (error) {
        console.error("Error in fetchBillText:", error.message);
        return { text: null, source: null, pdfUrl: null };
      }
    }

    async function processBill(bill) {
      const billType = bill.type.toLowerCase();
      const billNumber = bill.number;
      const congress = bill.congress;

      try {
        const billId = uuidv5(congress + "_" + billType + billNumber, NAMESPACE);

        // Get bill details from Congress API
        const billResponse = await fetchWithRetry("https://api.congress.gov/v3/bill/" + congress + "/" + billType + "/" + billNumber + "?format=json&api_key=" + congressApiKey);
        const billData = billResponse.data.bill;

        // Get text content
        const { text, source, pdfUrl } = await fetchBillText(billData);

        // Determine bill status
        const newStatus = determineBillStatus(billData);

        // Check if bill exists and get current status
        const { data: existingBill } = await supabase
          .from('bills')
          .select('id, status, has_full_text')
          .eq('id', billId)
          .single();

        // Prepare bill record
        const billRecord = {
          id: billId,
          bill_number: billNumber,
          congress: congress,
          title: billData.title,
          introduction_date: billData.introducedDate ? billData.introducedDate + "T00:00:00Z" : null,
          status: newStatus,
          analysis_status: 'pending',
          key_points: [],
          analysis: null,
          sponsors: billData.sponsors ? billData.sponsors.map(sponsor => sponsor.fullName) : [],
          committee: billData.committees?.count > 0 ? billData.committees.url : null,
          full_text: text,
          has_full_text: !!text,
          text_source: source,
          bill_type: billType,
          origin_chamber: billData.originChamber || null,
          origin_chamber_code: billData.originChamberCode || null,
          latest_action_date: billData.latestAction?.actionDate ? billData.latestAction.actionDate + "T00:00:00Z" : null,
          latest_action_text: billData.latestAction?.text || null,
          constitutional_authority_text: billData.constitutionalAuthorityStatementText || null,
          policy_area: billData.policyArea?.name || null,
          subjects: billData.subjects?.count > 0 ? [billData.subjects.url] : [],
          summary: billData.summary?.text || null,
          cbo_cost_estimates: JSON.stringify(billData.cboCostEstimates || []),
          laws: JSON.stringify(billData.laws || []),
          committees_count: billData.committees?.count || 0,
          cosponsors_count: billData.cosponsors?.count || 0,
          withdrawn_cosponsors_count: billData.cosponsors?.countIncludingWithdrawnCosponsors || 0,
          actions_count: billData.actions?.count || 0,
          update_date: billData.updateDate ? new Date(billData.updateDate).toISOString() : null,
          update_date_including_text: billData.updateDateIncludingText ? new Date(billData.updateDateIncludingText).toISOString() : null,
          pdf_url: pdfUrl
        };

        // First, insert or update the bill record
        const { error: upsertError } = await supabase
          .from('bills')
          .upsert(billRecord);

        if (upsertError) {
          throw upsertError;
        }

        // Then, if status has changed, record in history
        if (!existingBill || existingBill.status !== newStatus) {
          const historyEntry = {
            bill_id: billId,
            status: newStatus,
            action_text: billData.latestAction?.text || 'Initial status recorded',
            changed_at: billData.latestAction?.actionDate ? new Date(billData.latestAction.actionDate).toISOString() : new Date().toISOString()
          };

          const { error: historyError } = await supabase
            .from('bill_status_history')
            .insert(historyEntry);

          if (historyError) {
            console.error("Error recording status history:", historyError);
          }
        }

        // Send success message
        parentPort?.postMessage({
          type: 'progress',
          data: {
            success: true,
            bill: { id: billId, type: billType, number: billNumber },
            hasText: !!text,
            textSource: source
          }
        });

      } catch (error) {
        // Check if this is a rate limit error
        if (error.response && error.response.status === 429) {
          console.log("⚠️ Rate limited while processing " + billType + billNumber + ", adding to retry queue");
          
          // Add to retry queue instead of marking as failed
          retryQueue.push(bill);
          
          // Notify parent about rate limited bill
          parentPort?.postMessage({
            type: 'rateLimited',
            data: {
              bill: { type: billType, number: billNumber },
              retryAfter: Date.now() + 30000 // Suggest retry after 30s
            }
          });
          
          return;
        }
        
        console.error("Error processing bill " + billType + billNumber + ":", error);
        parentPort?.postMessage({
          type: 'progress',
          data: {
            success: false,
            error: error.message,
            bill: { type: billType, number: billNumber }
          }
        });
      }
    }

    async function processAllBills() {
      const mainBills = [...bills];
      
      // Process main set of bills
      for (const bill of mainBills) {
        await processBill(bill);
        
        // Small delay between bills
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Process any bills that were rate limited
      if (retryQueue.length > 0) {
        console.log("⏳ Processing " + retryQueue.length + " rate-limited bills after cooling off...");
        parentPort?.postMessage({
          type: 'retryingBills',
          data: {
            count: retryQueue.length,
            workerIndex
          }
        });
        
        // Wait for a cooling off period before retrying
        await new Promise(resolve => setTimeout(resolve, 30000));
        
        // Process the retry queue with longer delays
        for (const bill of retryQueue) {
          await processBill(bill);
          // Longer delay between retry bills
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
      
      parentPort?.postMessage('done');
    }

    processAllBills().catch(error => {
      console.error('Worker error:', error);
      process.exit(1);
    });
  