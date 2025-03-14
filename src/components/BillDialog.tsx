import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { Calendar, Users, Building2, FileText, Link, Search, Copy, Check, ChevronUp, ChevronDown } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { supabase } from "@/lib/supabase";
import { proxyPdf } from "@/lib/api";
import { useState, useEffect, useRef } from "react";
import ReactMarkdown from 'react-markdown';
import "./scrollbar-hide.css";

interface BillDialogProps {
  bill: {
    id: string;
    title: string;
    introductionDate: string;
    keyPoints: string[];
    analysis: string | null;
    status: "introduced" | "referred_to_committee" | "reported_by_committee" | "passed_chamber" | "passed_both_chambers" | "presented_to_president" | "signed_into_law" | "vetoed" | "veto_overridden" | "failed";
    analysis_status: "pending" | "completed" | "failed";
    sponsors: string[];
    committee?: string;
    fullText?: string;
    relatedBills: { id: string; title: string }[];
    billType: string;
    billNumber: string;
    congress: string;
    originChamber?: string;
    originChamberCode?: string;
    latestActionDate?: string;
    latestActionText?: string;
    constitutionalAuthorityText?: string;
    policyArea?: string;
    subjects: string[];
    summary?: string;
    cboCostEstimates: Array<{
      description: string;
      pubDate: string;
      title: string;
      url: string;
    }>;
    laws: Array<{
      number: string;
      type: string;
    }>;
    committeesCount: number;
    cosponsorsCount: number;
    withdrawnCosponsorsCount: number;
    actionsCount: number;
    updateDate?: string;
    updateDateIncludingText?: string;
    pdf_url?: string;
  } | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

// Add status utility functions
const getStatusColor = (status: string) => {
  switch (status) {
    case 'signed_into_law':
      return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    case 'veto_overridden':
      return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    case 'passed_both_chambers':
    case 'presented_to_president':
      return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
    case 'passed_chamber':
    case 'reported_by_committee':
      return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
    case 'vetoed':
    case 'failed':
      return 'bg-red-500/10 text-red-400 border border-red-500/20';
    case 'referred_to_committee':
    case 'introduced':
    default:
      return 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20';
  }
};

const formatStatus = (status: string) => {
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const formatBillType = (type: string) => {
  const typeMap: Record<string, string> = {
    'hr': 'H.R.',
    'hjres': 'H.J.Res.',
    'hres': 'H.Res.',
    's': 'S.'
  };
  return typeMap[type.toLowerCase()] || type;
};

// Add cache at the top level outside the component
const pdfUrlCache = new Map<string, { url: string; timestamp: number }>();
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

// Add localStorage cache helpers
const loadCacheFromStorage = () => {
  try {
    const cached = localStorage.getItem('pdfUrlCache');
    if (cached) {
      const parsedCache = JSON.parse(cached);
      Object.entries(parsedCache).forEach(([key, value]) => {
        pdfUrlCache.set(key, value as { url: string; timestamp: number });
      });
    }
  } catch (error) {
    console.error('Error loading cache from storage:', error);
  }
};

const saveCacheToStorage = () => {
  try {
    const cacheObj = Object.fromEntries(pdfUrlCache.entries());
    localStorage.setItem('pdfUrlCache', JSON.stringify(cacheObj));
  } catch (error) {
    console.error('Error saving cache to storage:', error);
  }
};

// Clean up expired cache entries
const cleanupCache = () => {
  const now = Date.now();
  let hasChanges = false;
  
  pdfUrlCache.forEach((value, key) => {
    if (now - value.timestamp > CACHE_DURATION) {
      if (value.url.startsWith('blob:')) {
        URL.revokeObjectURL(value.url);
      }
      pdfUrlCache.delete(key);
      hasChanges = true;
    }
  });
  
  if (hasChanges) {
    saveCacheToStorage();
  }
};

export function BillDialog({ bill, open, onOpenChange }: BillDialogProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [hasCopied, setHasCopied] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [matches, setMatches] = useState<number[]>([]);
  const textContainerRef = useRef<HTMLDivElement>(null);
  const [isCongressPdf, setIsCongressPdf] = useState(false);

  // Load cache from localStorage on component mount
  useEffect(() => {
    loadCacheFromStorage();
    cleanupCache();
  }, []);

  const handleViewPDF = async () => {
    if (!bill?.id) return;
    
    try {
      // Check cache first
      const cached = pdfUrlCache.get(bill.id);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log('Using cached PDF URL');
        setPdfUrl(cached.url);
        setIsCongressPdf(cached.url.includes('congress.gov'));
        return;
      }

      setIsLoadingPdf(true);
      setPdfLoadError(null);
      
      console.log('Starting PDF load process for bill:', bill.id);
      console.log('PDF URL from bill:', bill.pdf_url);

      // First try to use the PDF URL if it exists
      if (bill.pdf_url) {
        try {
          console.log('Attempting to access PDF URL:', bill.pdf_url);
          
          if (bill.pdf_url.includes('congress.gov')) {
            // Use proxy for Congress.gov PDFs
            const response = await proxyPdf(bill.pdf_url);
            if (response.ok) {
              const blob = await response.blob();
              const url = URL.createObjectURL(blob);
              console.log('Successfully proxied Congress.gov PDF');
              setPdfUrl(url);
              setIsCongressPdf(true);
              // Cache the URL
              pdfUrlCache.set(bill.id, { url, timestamp: Date.now() });
              saveCacheToStorage();
              return;
            }
          } else {
            // For other URLs, try direct access
            const response = await fetch(bill.pdf_url, { method: 'HEAD' });
            console.log('PDF URL response status:', response.status);
            
            if (response.ok) {
              console.log('PDF URL is accessible, using URL directly');
              const url = bill.pdf_url;
              setPdfUrl(url);
              setIsCongressPdf(false);
              // Cache the URL
              pdfUrlCache.set(bill.id, { url, timestamp: Date.now() });
              saveCacheToStorage();
              return;
            }
          }
        } catch (error) {
          console.log('PDF URL not accessible, error:', error);
          console.log('Falling back to storage');
        }
      }

      // If PDF URL doesn't exist or fails, try to get from storage
      try {
        console.log('Attempting to get PDF from storage for bill:', bill.id);
        const { data, error } = await supabase
          .storage
          .from('bill_pdfs')
          .createSignedUrl(`${bill.id}.pdf`, 60 * 60); // 1 hour expiry

        if (error) {
          console.log('Storage error:', error);
          throw error;
        }
        if (!data?.signedUrl) {
          console.log('No signed URL returned from storage');
          throw new Error('PDF not found in storage');
        }

        console.log('Successfully got signed URL from storage');
        const url = data.signedUrl;
        setPdfUrl(url);
        setIsCongressPdf(false);
        // Cache the URL
        pdfUrlCache.set(bill.id, { url, timestamp: Date.now() });
        saveCacheToStorage();
      } catch (storageError) {
        console.error('Error loading PDF from storage:', storageError);
        setPdfLoadError('No PDF available for this bill');
      }
    } catch (error) {
      console.error('Error loading PDF:', error);
      setPdfLoadError('Error loading PDF');
    } finally {
      setIsLoadingPdf(false);
    }
  };

  const handleCopyText = async () => {
    if (bill?.fullText) {
      await navigator.clipboard.writeText(bill.fullText);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    }
  };

  const findMatches = (text: string) => {
    if (!searchText) return [];
    const regex = new RegExp(searchText, 'gi');
    const matches: number[] = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push(match.index);
    }
    return matches;
  };

  const scrollToMatch = (index: number) => {
    if (!textContainerRef.current || matches.length === 0) return;
    
    const matchElements = textContainerRef.current.getElementsByClassName('search-match');
    if (matchElements[index]) {
      matchElements[index].scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  };

  const handleNext = () => {
    const nextMatch = (currentMatchIndex + 1) % matches.length;
    setCurrentMatchIndex(nextMatch);
    scrollToMatch(nextMatch);
  };

  const handlePrevious = () => {
    const prevMatch = (currentMatchIndex - 1 + matches.length) % matches.length;
    setCurrentMatchIndex(prevMatch);
    scrollToMatch(prevMatch);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (matches.length === 0) return;
    
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        handlePrevious();
      } else {
        handleNext();
      }
    }
  };

  useEffect(() => {
    if (bill?.fullText && searchText) {
      const newMatches = findMatches(bill.fullText);
      setMatches(newMatches);
      setCurrentMatchIndex(newMatches.length > 0 ? 0 : -1);
      if (newMatches.length > 0) {
        scrollToMatch(0);
      }
    } else {
      setMatches([]);
      setCurrentMatchIndex(-1);
    }
  }, [searchText, bill?.fullText]);

  const highlightSearchText = (text: string) => {
    if (!searchText) return text;
    
    const parts = text.split(new RegExp(`(${searchText})`, 'gi'));
    let matchIndex = 0;
    
    return parts.map((part, i) => {
      if (part.toLowerCase() === searchText.toLowerCase()) {
        const isCurrentMatch = matchIndex === currentMatchIndex;
        matchIndex++;
        return (
          `<span class="${isCurrentMatch ? 'bg-primary-light text-black' : 'bg-primary-light/30'}">${part}</span>`
        );
      }
      return part;
    }).join('');
  };

  // Reset states when dialog closes
  useEffect(() => {
    if (!open) {
      setPdfUrl(null);
      setIsLoadingPdf(false);
      setPdfLoadError(null);
      setSearchText("");
      setHasCopied(false);
      setMatches([]);
      setCurrentMatchIndex(-1);
    }
  }, [open]);

  // Clean up object URLs when component unmounts or PDF changes
  useEffect(() => {
    return () => {
      if (pdfUrl && isCongressPdf) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl, isCongressPdf]);

  if (!bill) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  // Debug bill data
  console.log('Bill Data:', { 
    congress: bill.congress, 
    type: bill.billType, 
    number: bill.billNumber,
    rawBill: bill 
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] xs:h-[85vh] sm:h-[90vh] flex flex-col overflow-hidden bg-zinc-900/95 backdrop-blur border border-zinc-800">
        <DialogHeader className="space-y-1 sm:space-y-4">
          <div className="flex flex-wrap gap-1 sm:gap-2">
            {/* Bill Type Badge */}
            <Badge className="px-1.5 sm:px-2 py-0.5 rounded-full font-medium bg-zinc-800/50 text-zinc-200 border border-zinc-700 text-[9px] sm:text-xs">
              {formatBillType(bill.billType)} {bill.billNumber}
            </Badge>

            {/* Status Badge */}
            <Badge className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-xs font-medium ${getStatusColor(bill.status)}`}>
              {formatStatus(bill.status)}
            </Badge>

            {/* Policy Area Badge */}
            {bill.policyArea && (
              <Badge className="px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-xs font-medium bg-primary-light/10 text-primary-light border border-primary-light/20">
                {bill.policyArea}
              </Badge>
            )}

            {/* AI Status Badge */}
            {bill.analysis_status === "completed" && (
              <Badge className="px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                AI Analysis: Completed
              </Badge>
            )}
          </div>
          <DialogTitle className="text-xs sm:text-lg font-bold tracking-tight text-zinc-200 line-clamp-2 sm:line-clamp-3">{bill.title}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="analysis" className="flex-1 overflow-hidden">
          <TabsList className="flex-shrink-0 bg-zinc-900 border-b border-zinc-800 p-1 sm:p-2 gap-0.5 sm:gap-2 flex overflow-x-auto scrollbar-hide">
            <TabsTrigger 
              value="analysis" 
              className="text-[9px] sm:text-sm data-[state=active]:bg-primary-light/20 data-[state=active]:text-primary-light data-[state=active]:border-primary-light/30 px-1.5 sm:px-4 py-1 sm:py-2 rounded-lg transition-all whitespace-nowrap flex-shrink-0"
            >
              AI Analysis
            </TabsTrigger>
            <TabsTrigger 
              value="details"
              className="text-[9px] sm:text-sm data-[state=active]:bg-primary-light/20 data-[state=active]:text-primary-light data-[state=active]:border-primary-light/30 px-1.5 sm:px-4 py-1 sm:py-2 rounded-lg transition-all whitespace-nowrap flex-shrink-0"
            >
              Details
            </TabsTrigger>
            <TabsTrigger 
              value="additional"
              className="text-[9px] sm:text-sm data-[state=active]:bg-primary-light/20 data-[state=active]:text-primary-light data-[state=active]:border-primary-light/30 px-1.5 sm:px-4 py-1 sm:py-2 rounded-lg transition-all whitespace-nowrap flex-shrink-0"
            >
              More Info
            </TabsTrigger>
            <TabsTrigger 
              value="text"
              className="text-[9px] sm:text-sm data-[state=active]:bg-primary-light/20 data-[state=active]:text-primary-light data-[state=active]:border-primary-light/30 px-1.5 sm:px-4 py-1 sm:py-2 rounded-lg transition-all whitespace-nowrap flex-shrink-0"
            >
              Text
            </TabsTrigger>
            {bill.pdf_url && (
              <TabsTrigger 
                value="pdf"
                onClick={handleViewPDF}
                className="text-[9px] sm:text-sm data-[state=active]:bg-primary-light/20 data-[state=active]:text-primary-light data-[state=active]:border-primary-light/30 px-1.5 sm:px-4 py-1 sm:py-2 rounded-lg transition-all whitespace-nowrap flex-shrink-0"
              >
                PDF
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="analysis" className="flex-1 mt-0 overflow-hidden">
            <ScrollArea className="h-[calc(80vh-10rem)] xs:h-[calc(85vh-10rem)] sm:h-[calc(90vh-8rem)]">
              <div className="p-4 sm:p-6 pb-24">
                {(bill.analysis_status || 'pending') === 'pending' ? (
                  <div className="flex flex-col items-center justify-center h-[calc(90vh-12rem)] space-y-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-light"></div>
                    <p className="text-zinc-400">AI Analysis is pending...</p>
                    <p className="text-sm text-zinc-500">We're analyzing this bill to provide key insights and summaries.</p>
                  </div>
                ) : (bill.analysis_status || 'pending') === 'completed' && bill.analysis ? (
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-zinc-200 gradient-text">AI Analysis Results</h3>
                      <div className="prose prose-sm prose-invert max-w-none text-zinc-300 glass-panel p-4 sm:p-6 rounded-lg prose-headings:text-primary-light prose-h2:text-base sm:prose-h2:text-lg prose-h3:text-sm sm:prose-h3:text-base overflow-y-auto">
                        <ReactMarkdown
                          components={{
                            h2: ({node, ...props}) => <h2 className="text-base sm:text-lg font-semibold text-primary-light mt-4 sm:mt-6 mb-2 sm:mb-4" {...props} />,
                            h3: ({node, ...props}) => <h3 className="text-sm sm:text-base font-medium text-primary-light/90 mt-3 sm:mt-4 mb-1 sm:mb-2" {...props} />,
                            ul: ({node, ...props}) => <ul className="space-y-1 sm:space-y-2 my-2 sm:my-4" {...props} />,
                            li: ({node, ...props}) => (
                              <li className="flex items-start gap-2 text-sm sm:text-base" {...props}>
                                <span className="text-primary-light mt-1">•</span>
                                <span>{props.children}</span>
                              </li>
                            ),
                            p: ({node, ...props}) => <p className="text-sm sm:text-base text-zinc-300 leading-relaxed mb-2 sm:mb-4" {...props} />,
                          }}
                        >
                          {bill.analysis}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[calc(90vh-12rem)] space-y-4">
                    <p className="text-red-400">Analysis failed</p>
                    <p className="text-sm text-zinc-500">There was an error analyzing this bill. Please try again later.</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="details" className="flex-1 mt-0 overflow-hidden">
            <ScrollArea className="h-[calc(80vh-10rem)] xs:h-[calc(85vh-10rem)] sm:h-[calc(90vh-8rem)]">
              <div className="space-y-2 sm:space-y-4 p-2 sm:p-6 pb-16">
                {/* Basic Bill Information */}
                <div className="glass-panel p-2 sm:p-6 rounded-lg space-y-2 sm:space-y-6">
                  <div className="flex items-start sm:items-center gap-2 sm:gap-3">
                    <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-primary-light mt-0.5 sm:mt-0 flex-shrink-0" />
                    <div className="space-y-1 sm:space-y-2 min-w-0">
                      <div className="text-[9px] sm:text-sm text-zinc-300 break-words">
                        Introduced on {formatDate(bill.introductionDate)}
                        {bill.originChamber && (
                          <span className="text-zinc-400">
                            <span className="mx-1 sm:mx-2">•</span>
                            <span className="break-all">Originated in {bill.originChamber}</span>
                          </span>
                        )}
                      </div>
                      {bill.latestActionDate && (
                        <div className="text-[9px] sm:text-sm break-words">
                          <span className="text-zinc-400">Latest Action:</span>{" "}
                          <span className="text-zinc-300 break-words">{bill.latestActionText}</span>{" "}
                          <span className="text-zinc-400">({formatDate(bill.latestActionDate)})</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sponsors Section */}
                {bill.sponsors && bill.sponsors.length > 0 && (
                  <div className="glass-panel p-2 sm:p-6 rounded-lg space-y-2 sm:space-y-4">
                    <h4 className="text-sm sm:text-lg font-semibold text-zinc-200 gradient-text flex items-center gap-2 sm:gap-3">
                      <Users className="h-4 w-4 sm:h-5 sm:w-5 text-primary-light flex-shrink-0" /> 
                      <span className="break-words">Sponsors and Cosponsors</span>
                    </h4>
                    <div className="flex items-center gap-2 sm:gap-3 text-[9px] sm:text-sm text-zinc-400 flex-wrap">
                      <span>Total Cosponsors: {bill.cosponsorsCount || 0}</span>
                      {bill.withdrawnCosponsorsCount > 0 && (
                        <span>• {bill.withdrawnCosponsorsCount} withdrawn</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {bill.sponsors.map((sponsor) => (
                        <Badge 
                          key={sponsor} 
                          className="px-2 sm:px-3 py-0.5 sm:py-1.5 rounded-full text-[10px] sm:text-sm font-medium bg-zinc-800/50 text-zinc-300 border border-zinc-700"
                        >
                          {sponsor}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Committee Information */}
                {bill.committee && (
                  <div className="glass-panel p-3 sm:p-6 rounded-lg space-y-3 sm:space-y-4">
                    <h4 className="text-base sm:text-lg font-semibold text-zinc-200 gradient-text flex items-center gap-3">
                      <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary-light" /> 
                      Committee Information
                    </h4>
                    <div className="space-y-2">
                      <p className="text-[10px] sm:text-sm text-zinc-300">{bill.committee}</p>
                      {bill.committeesCount > 1 && (
                        <p className="text-[10px] sm:text-sm text-zinc-400">
                          Total committees involved: {bill.committeesCount}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Subject Tags */}
                {bill.subjects && bill.subjects.length > 0 && (
                  <div className="glass-panel p-3 sm:p-6 rounded-lg space-y-3 sm:space-y-4">
                    <h4 className="text-base sm:text-lg font-semibold text-zinc-200 gradient-text">Subject Areas</h4>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {bill.subjects.map((subject, index) => (
                        <Badge 
                          key={index} 
                          className="px-2 sm:px-3 py-0.5 sm:py-1.5 rounded-full text-[10px] sm:text-sm font-medium bg-zinc-800/50 text-zinc-300 border border-zinc-700"
                        >
                          {subject}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="additional" className="flex-1 mt-0 overflow-hidden">
            <ScrollArea className="h-[calc(80vh-10rem)] xs:h-[calc(85vh-10rem)] sm:h-[calc(90vh-8rem)]">
              <div className="space-y-2 sm:space-y-4 p-2 sm:p-6 pb-16">
                {/* Summary Section */}
                {bill.summary && (
                  <div className="glass-panel p-2 sm:p-4 rounded-lg space-y-1.5 sm:space-y-3 mx-2 sm:mx-0">
                    <h4 className="text-sm sm:text-lg font-semibold text-zinc-200 gradient-text">Official Summary</h4>
                    <p className="text-[9px] sm:text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed break-words max-w-full overflow-x-hidden">{bill.summary}</p>
                  </div>
                )}

                {/* Constitutional Authority */}
                {bill.constitutionalAuthorityText && (
                  <div className="glass-panel p-2 sm:p-4 rounded-lg space-y-1.5 sm:space-y-3 mx-2 sm:mx-0">
                    <h4 className="text-sm sm:text-lg font-semibold text-zinc-200 gradient-text">Constitutional Authority Statement</h4>
                    <div 
                      className="text-[9px] sm:text-sm prose prose-sm prose-invert text-zinc-300 break-words max-w-full overflow-x-hidden" 
                      dangerouslySetInnerHTML={{ __html: bill.constitutionalAuthorityText }}
                    />
                  </div>
                )}

                {/* Related Bills */}
                {bill.relatedBills && bill.relatedBills.length > 0 && (
                  <div className="glass-panel p-2 sm:p-4 rounded-lg space-y-1.5 sm:space-y-3 mx-2 sm:mx-0">
                    <h4 className="text-sm sm:text-lg font-semibold text-zinc-200 gradient-text flex items-center gap-2">
                      <Link className="h-4 w-4 sm:h-5 sm:w-5 text-primary-light flex-shrink-0" /> 
                      <span className="break-words">Related Bills</span>
                    </h4>
                    <div className="space-y-1 sm:space-y-2">
                      {bill.relatedBills.map((related) => (
                        <p key={related.id} className="text-[9px] sm:text-sm text-zinc-300 break-words max-w-full overflow-x-hidden">
                          {related.title}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* CBO Cost Estimates */}
                {bill.cboCostEstimates && bill.cboCostEstimates.length > 0 && (
                  <div className="glass-panel p-2 sm:p-4 rounded-lg space-y-1.5 sm:space-y-3 mx-2 sm:mx-0">
                    <h4 className="text-sm sm:text-lg font-semibold text-zinc-200 gradient-text">CBO Cost Estimates</h4>
                    <div className="space-y-1.5">
                      {bill.cboCostEstimates.map((estimate, index) => (
                        <div key={index} className="glass-panel p-2 sm:p-3 rounded-lg space-y-1 sm:space-y-2">
                          <p className="font-medium text-[9px] sm:text-sm text-zinc-200 break-words max-w-full overflow-x-hidden">{estimate.title}</p>
                          <p className="text-[9px] sm:text-sm text-zinc-400">
                            Published: {formatDate(estimate.pubDate)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Laws */}
                {bill.laws && bill.laws.length > 0 && (
                  <div className="glass-panel p-2 sm:p-4 rounded-lg space-y-1.5 sm:space-y-3 mx-2 sm:mx-0">
                    <h4 className="text-sm sm:text-lg font-semibold text-zinc-200 gradient-text">Public Laws</h4>
                    <div className="flex flex-wrap gap-1 sm:gap-2">
                      {bill.laws.map((law, index) => (
                        <Badge 
                          key={index} 
                          className="px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-sm font-medium bg-zinc-800/50 text-zinc-300 border border-zinc-700"
                        >
                          {law.type} {law.number}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Technical Details */}
                <div className="glass-panel p-2 sm:p-4 rounded-lg space-y-1.5 sm:space-y-3 mx-2 sm:mx-0">
                  <h4 className="text-sm sm:text-lg font-semibold text-zinc-200 gradient-text">Technical Information</h4>
                  <div className="space-y-1 sm:space-y-2 text-[10px] sm:text-sm">
                    {bill.originChamber && (
                      <p className="break-words max-w-[calc(100vw-2rem)] sm:max-w-none"><span className="text-zinc-400">Origin Chamber:</span> <span className="text-zinc-300">{bill.originChamber}</span></p>
                    )}
                    {bill.actionsCount > 0 && (
                      <p className="break-words max-w-[calc(100vw-2rem)] sm:max-w-none"><span className="text-zinc-400">Total Actions:</span> <span className="text-zinc-300">{bill.actionsCount}</span></p>
                    )}
                    {bill.updateDate && (
                      <p className="break-words max-w-[calc(100vw-2rem)] sm:max-w-none">
                        <span className="text-zinc-400">Last Updated:</span> <span className="text-zinc-300">{formatDate(bill.updateDate)}</span>
                        {bill.updateDateIncludingText && 
                          <span className="text-zinc-400"> (text updated: <span className="text-zinc-300">{formatDate(bill.updateDateIncludingText)}</span>)</span>
                        }
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="pdf" className="flex-1 mt-0 h-[calc(80vh-10rem)] xs:h-[calc(85vh-10rem)] sm:h-[calc(90vh-8rem)]">
            <div className="h-full glass-panel rounded-lg">
              {isLoadingPdf ? (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-light"></div>
                </div>
              ) : pdfUrl ? (
                <div className="w-full h-full">
                  {/* Mobile PDF View */}
                  <div className="block sm:hidden w-full h-full p-2">
                    <div className="flex flex-col gap-2">
                      <Button
                        onClick={() => window.open(pdfUrl, '_blank')}
                        className="w-full bg-primary-light/20 text-primary-light hover:bg-primary-light/30"
                      >
                        Open PDF in New Tab
                      </Button>
                      <div className="text-xs text-zinc-400 text-center mb-2">
                        Scroll within the frame below to view the PDF
                      </div>
                      <div className="w-full h-[calc(100vh-16rem)] overflow-hidden rounded-lg glass-panel">
                        <div className="w-full h-full overflow-y-auto overflow-x-hidden -webkit-overflow-scrolling-touch">
                          <div className="min-w-full">
                            <iframe
                              src={pdfUrl}
                              className="w-full border-0"
                              title="Bill PDF"
                              style={{
                                height: '100%',
                                transform: 'scale(0.65)',
                                transformOrigin: 'top center',
                                minHeight: '150vh',
                                width: '154%',
                                marginLeft: '-27%'
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Desktop PDF View */}
                  <div className="hidden sm:block w-full h-full">
                    <iframe
                      src={pdfUrl}
                      className="w-full h-full rounded-lg"
                      title="Bill PDF"
                    />
                  </div>
                </div>
              ) : pdfLoadError ? (
                <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                  <p className="text-red-400 text-[9px] sm:text-sm mb-2">Error loading PDF: {pdfLoadError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleViewPDF}
                    className="mt-2 text-[9px] sm:text-xs"
                  >
                    Try Again
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                  <p className="text-zinc-400 text-[9px] sm:text-sm">Click the PDF tab to load the document.</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="text" className="flex-1 mt-0 overflow-hidden">
            <ScrollArea className="h-[calc(80vh-10rem)] xs:h-[calc(85vh-10rem)] sm:h-[calc(90vh-8rem)]">
              <div className="p-2 sm:p-6 pb-16">
                {/* Search Controls */}
                <div className="glass-panel p-2 sm:p-4 rounded-lg mb-4 flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center">
                  <div className="relative flex-1 w-full">
                    <Search className="absolute left-2 top-2 h-4 w-4 text-zinc-400" />
                    <Input
                      type="text"
                      placeholder="Search in bill text..."
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="pl-8 py-1 h-8 text-xs sm:text-sm bg-zinc-800/50 border-zinc-700"
                    />
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 px-2 sm:px-3 text-[10px] sm:text-xs bg-zinc-800/50 border-zinc-700"
                      onClick={() => handlePrevious()}
                      disabled={currentMatchIndex <= 0 || matches.length === 0}
                    >
                      <ChevronUp className="h-3 w-3 sm:h-4 sm:w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 px-2 sm:px-3 text-[10px] sm:text-xs bg-zinc-800/50 border-zinc-700"
                      onClick={() => handleNext()}
                      disabled={currentMatchIndex >= matches.length - 1 || matches.length === 0}
                    >
                      <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4" />
                    </Button>
                    <div className="text-[10px] sm:text-xs text-zinc-400 min-w-[60px] text-center">
                      {matches.length > 0 ? `${currentMatchIndex + 1}/${matches.length}` : "0/0"}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 px-2 sm:px-3 text-[10px] sm:text-xs bg-zinc-800/50 border-zinc-700"
                      onClick={handleCopyText}
                    >
                      {hasCopied ? <Check className="h-3 w-3 sm:h-4 sm:w-4" /> : <Copy className="h-3 w-3 sm:h-4 sm:w-4" />}
                    </Button>
                  </div>
                </div>

                {/* Bill Text */}
                {bill.fullText ? (
                  <div 
                    ref={textContainerRef}
                    className="glass-panel p-2 sm:p-6 rounded-lg whitespace-pre-wrap text-[9px] sm:text-sm text-zinc-300 leading-relaxed break-words max-w-full overflow-x-hidden"
                    dangerouslySetInnerHTML={{ __html: highlightSearchText(bill.fullText) }}
                  />
                ) : (
                  <div className="glass-panel p-4 sm:p-6 rounded-lg text-center">
                    <p className="text-zinc-400 text-[9px] sm:text-sm">Full text not available for this bill.</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
