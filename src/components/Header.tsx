import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { HelpCircle } from "lucide-react";
import { Search } from "lucide-react";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Badge } from "./ui/badge";
import { Calendar } from "lucide-react";

interface HeaderProps {
  onSearch?: (term: string) => void;
  onFilterChange?: (filters: {
    showActive: boolean;
    showIntroduced: boolean;
    year: string;
    billType: string;
  }) => void;
  filters?: {
    showActive: boolean;
    showIntroduced: boolean;
    year: string;
    billType: string;
  };
}

// Custom X icon component
const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-zinc-200">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" fill="currentColor"/>
  </svg>
);

// Custom GitHub icon component
const GitHubIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-zinc-200">
    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.167 6.839 9.49.5.09.682-.217.682-.48 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.268 2.75 1.026A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.026 2.747-1.026.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.577.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" fill="currentColor"/>
  </svg>
);

export function Header({ onSearch, onFilterChange, filters = { showActive: true, showIntroduced: true, year: "all", billType: "all" } }: HeaderProps) {
  const [versionDialogOpen, setVersionDialogOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const copyAddress = () => {
    navigator.clipboard.writeText('2hSzLVRQH5L2AuX4hffapK28u6n6tGQ1zLVLCddMpump');
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  const showVersionInfo = () => {
    setVersionDialogOpen(true);
  };

  const hideVersionInfo = () => {
    setVersionDialogOpen(false);
  };

  return (
    <div className="sticky top-0 z-50 w-full bg-black/50 backdrop-blur-md">
      <div className="p-2 sm:p-4 md:p-6 pb-1 sm:pb-2 md:pb-3">
        <div className="max-w-[1200px] mx-auto space-y-1 sm:space-y-2">
          {/* Contract Segment */}
          <div className={`glass-panel p-1 sm:h-11 transition-opacity duration-500 ${isLoading ? 'animate-pulse' : ''}`}>
            {isLoading ? (
              // Loading skeleton for contract segment
              <div className="w-full h-full flex items-center justify-center px-4">
                <div className="w-[80%] h-8 bg-zinc-800/50 rounded-full animate-pulse" />
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center h-full justify-between gap-1 sm:gap-2 py-0.5 sm:py-0 px-2 sm:px-4">
                {/* Mobile Layout */}
                <div className="flex sm:hidden items-center justify-between w-full gap-2">
                  <div className="flex items-center space-x-1 px-2 py-0.5 bg-gradient-to-r from-primary-dark/10 to-accent/10 rounded-full border border-primary-light/20 shrink-0">
                    <span className="text-[10px] text-primary-light whitespace-nowrap">MEME 🚀</span>
                  </div>
                  <code className="text-[8px] bg-zinc-900 px-2 py-0.5 rounded text-zinc-200 text-center truncate">
                    2hSzLVRQH5L2AuX4hffapK28u6n6tGQ1zLVLCddMpump
                  </code>
                  <button
                    onClick={copyAddress}
                    className="text-[10px] px-2 py-0.5 glass-panel hover:bg-opacity-50 rounded-full transition-all flex items-center space-x-1 whitespace-nowrap shrink-0"
                  >
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                  </button>
                </div>

                {/* Desktop Layout */}
                <div className="hidden sm:flex items-center w-full">
                  <div className="flex-1" />
                  <div className="flex items-center gap-2">
                    <code className="text-sm bg-zinc-900 px-3 py-1 rounded text-zinc-200 text-center max-w-[500px] truncate">
                      2hSzLVRQH5L2AuX4hffapK28u6n6tGQ1zLVLCddMpump
                    </code>
                    <button
                      onClick={copyAddress}
                      className="text-sm px-3 py-1 glass-panel hover:bg-opacity-50 rounded-full transition-all flex items-center space-x-2 whitespace-nowrap shrink-0"
                    >
                      <span>{copied ? 'Copied!' : 'Copy'}</span>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                    </button>
                    <div className="flex items-center space-x-1 px-3 py-1 bg-gradient-to-r from-primary-dark/10 to-accent/10 rounded-full border border-primary-light/20 shrink-0">
                      <span className="text-sm text-primary-light whitespace-nowrap">MEME 🚀</span>
                    </div>
                  </div>
                  <div className="flex-1" />
                </div>
              </div>
            )}
          </div>

          {/* Title Segment */}
          <div className={`glass-panel p-2 sm:h-[70px] md:h-[100px] transition-opacity duration-500 ${isLoading ? 'animate-pulse' : ''}`}>
            {isLoading ? (
              // Loading skeleton for title segment
              <div className="w-full h-full flex items-center gap-4 px-4">
                <div className="h-14 w-14 sm:h-16 sm:w-16 md:h-24 md:w-24 rounded-lg bg-zinc-800/50 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-6 bg-zinc-800/50 rounded-full w-3/4 animate-pulse" />
                  <div className="h-4 bg-zinc-800/50 rounded-full w-1/2 animate-pulse" />
                </div>
              </div>
            ) : (
              <div className="flex flex-col md:flex-row items-start md:items-center h-full justify-between gap-2 md:gap-4 px-2 sm:px-4">
                {/* Logo and Title Section */}
                <div className="flex items-center gap-3 sm:gap-4 md:gap-6 w-full">
                  {/* Logo Container */}
                  <div className="h-14 w-14 sm:h-16 sm:w-16 md:h-24 md:w-24 rounded-xl overflow-hidden bg-gradient-to-br from-primary-light/20 to-accent/20 p-1 hover:scale-105 transition-transform shrink-0 border-2 border-primary-light/30 shadow-lg shadow-primary-light/10">
                    <div className="w-full h-full rounded-lg overflow-hidden">
                      <img
                        src="/doge-icon.png"
                        alt="DOGEPLOT"
                        className="w-full h-full object-cover filter drop-shadow-glow"
                        onError={(e) => {
                          console.error('Error loading image:', e);
                          const img = e.target as HTMLImageElement;
                          img.style.display = 'none';
                          // Add a fallback background
                          img.parentElement!.style.backgroundColor = 'rgba(0, 246, 255, 0.1)';
                        }}
                        onLoad={() => {
                          console.log('Image loaded successfully');
                        }}
                      />
                    </div>
                  </div>
                  {/* Brand Name and Description with Actions on Mobile */}
                  <div className="flex-1 min-w-0">
                    <h1 className="text-[13px] sm:text-xl md:text-3xl font-bold tracking-tight gradient-text whitespace-nowrap overflow-hidden text-ellipsis">
                      Department of Government Efficiency
                    </h1>
                    <div className="flex items-center justify-between mt-0.5 sm:mt-1 md:mt-2">
                      <p className="text-[11px] sm:text-base md:text-xl font-semibold text-zinc-200">
                        Policy Lens of Truth
                      </p>
                      {/* Mobile Actions */}
                      <div className="flex md:hidden items-center gap-1.5 ml-2">
                        <a
                          href="https://github.com/humanperzeus/dogeplot"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="glass-panel hover:bg-opacity-50 rounded-full h-5 w-5 flex items-center justify-center transition-all"
                        >
                          <GitHubIcon />
                        </a>
                        <a
                          href="https://x.com/dogeplot"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="glass-panel hover:bg-opacity-50 rounded-full h-5 w-5 flex items-center justify-center transition-all"
                        >
                          <XIcon />
                        </a>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="glass-panel hover:bg-opacity-50 rounded-full h-5 w-5 p-1">
                              <HelpCircle className="h-3 w-3" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="glass-panel border-0 w-[90vw] max-w-lg mx-4">
                            <DialogHeader>
                              <DialogTitle className="gradient-text text-lg sm:text-xl">About DOGEPLOT</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-6">
                              <div className="glass-panel p-4 rounded-lg">
                                <p className="text-zinc-300 leading-relaxed">
                                  DOGEPLOT (Department of Government Efficiency - Policy Lens of
                                  Truth) is your AI-powered companion for tracking and analyzing
                                  congressional bills in real-time.
                                </p>
                              </div>
                              <div className="glass-panel p-4 rounded-lg space-y-3">
                                <h4 className="font-medium text-primary-light">Key Features:</h4>
                                <ul className="space-y-2">
                                  <li className="flex items-center gap-2 text-zinc-300">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary-light/70" />
                                    Real-time bill tracking and analysis
                                  </li>
                                  <li className="flex items-center gap-2 text-zinc-300">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary-light/70" />
                                    AI-powered insights and summaries
                                  </li>
                                  <li className="flex items-center gap-2 text-zinc-300">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary-light/70" />
                                    Advanced search and filtering
                                  </li>
                                </ul>
                              </div>
                              <div className="glass-panel p-4 rounded-lg mt-4">
                                <h4 className="font-medium text-primary-light mb-3">Disclaimer:</h4>
                                <ScrollArea className="h-[200px] pr-4">
                                  <p className="text-zinc-300 text-sm leading-relaxed">
                                    The DOGEPLOT Memes are intended to function as an expression of support for, and engagement with, the ideals and beliefs embodied by the symbol "$DOGEPLOT" and the associated artwork and are not intended to be, or to be the subject of, an investment opportunity, investment contract, or security of any type. By using the Website and the Services, you acknowledge and agree that the DOGEPLOT Memes should be traded solely as cryptographic assets intended to function as set forth above, and that you are acquiring the DOGEPLOT Memes as an expression of support for, and engagement with, these ideals and beliefs and not as an investment opportunity, investment contract, or security of any type. Please be aware that the price of DOGEPLOT Memes may be extremely volatile and you may experience substantial losses in connection with a sale or other disposition of DOGEPLOT Memes. We make absolutely no promise or guarantee that the DOGEPLOT Memes will increase in value or maintain the same value as the amount you paid to purchase same. No information and/or Content made available by and through the Services is or should be considered advice or recommendation or an invitation to enter into an agreement for any investment purpose. Further, no element of the Services qualifies or is intended to be an offering of securities in any jurisdiction, nor does it constitute an offer or an invitation to purchase shares, securities or other financial products. IT REMAINS YOUR SOLE AND EXCLUSIVE RESPONSIBILITY TO ASSURE THAT THE PURCHASE AND SALE OF THE DOGEPLOT MEMES AND THE USE OF CRYPTOCURRENCIES COMPLIES WITH LAWS AND REGULATIONS IN YOUR JURISDICTION AND ALL APPLICABLE JURISDICTIONS. We shall have no responsibility or liability for any DOGE Memes that are lost, misplaced, or inaccessible.
                                  </p>
                                </ScrollArea>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                        <Dialog open={versionDialogOpen} onOpenChange={setVersionDialogOpen}>
                          <DialogTrigger asChild>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="relative group"
                              >
                                <span className="bg-gradient-to-r from-primary-light via-primary to-primary-dark bg-clip-text text-transparent font-bold">
                                  v1.0.4
                                </span>
                                <div className="absolute hidden group-hover:block right-0 top-full mt-2 p-3 bg-zinc-900/95 backdrop-blur border border-zinc-800 rounded-lg shadow-xl w-64 z-50">
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-primary-light font-semibold">Current Version</span>
                                      <Badge className="bg-primary-light/20 text-primary-light text-xs">v1.0.4</Badge>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-zinc-400">Release Date</span>
                                      <span className="text-zinc-300 flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        {new Date().toLocaleDateString()}
                                      </span>
                                    </div>
                                    <div className="pt-2 border-t border-zinc-800">
                                      <div className="text-xs text-zinc-300 space-y-1">
                                        <div className="flex items-start gap-2">
                                          <span className="text-primary-light">•</span>
                                          <span>Improved server-side caching system</span>
                                        </div>
                                        <div className="flex items-start gap-2">
                                          <span className="text-primary-light">•</span>
                                          <span>Added GitHub repository link</span>
                                        </div>
                                        <div className="flex items-start gap-2">
                                          <span className="text-primary-light">•</span>
                                          <span>Enhanced environment handling</span>
                                        </div>
                                        <div className="flex items-start gap-2">
                                          <span className="text-primary-light">•</span>
                                          <span>Fixed semantic search cache reset</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </Button>
                            </div>
                          </DialogTrigger>
                          <DialogContent className="glass-panel border-0">
                            <DialogHeader>
                              <DialogTitle className="gradient-text text-xl">Version Information</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-6">
                              <div className="glass-panel p-4 rounded-lg space-y-4">
                                <div className="flex items-center justify-between">
                                  <span className="text-zinc-300">Current Version</span>
                                  <span className="text-primary-light font-medium">v1.0.4</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-zinc-300">Release Date</span>
                                  <span className="text-zinc-400">{new Date().toLocaleDateString()}</span>
                                </div>
                              </div>
                              
                              <div className="glass-panel p-4 rounded-lg space-y-4">
                                <h4 className="font-medium text-primary-light">Update History</h4>
                                <div className="space-y-6 max-h-[300px] overflow-y-auto pr-2">
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-primary-light font-medium">v1.0.4</span>
                                      <span className="text-zinc-400 text-xs">Latest</span>
                                    </div>
                                    <ul className="space-y-1 text-xs text-zinc-300">
                                      <li className="flex items-start gap-1">
                                        <span className="text-primary-light mt-1">•</span>
                                        <span>Improved server-side caching system</span>
                                      </li>
                                      <li className="flex items-start gap-1">
                                        <span className="text-primary-light mt-1">•</span>
                                        <span>Added GitHub repository link</span>
                                      </li>
                                      <li className="flex items-start gap-1">
                                        <span className="text-primary-light mt-1">•</span>
                                        <span>Enhanced environment handling</span>
                                      </li>
                                      <li className="flex items-start gap-1">
                                        <span className="text-primary-light mt-1">•</span>
                                        <span>Fixed semantic search cache reset</span>
                                      </li>
                                    </ul>
                                  </div>

                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-emerald-400 text-sm">v1.0.3</span>
                                      <span className="text-zinc-500 text-xs">Feb 23, 2025</span>
                                    </div>
                                    <ul className="space-y-1.5 text-sm text-zinc-300">
                                      <li className="flex items-start gap-2">
                                        <span className="text-primary-light mt-1">•</span>
                                        <span>Enhanced AI analysis with deeper policy insights</span>
                                      </li>
                                      <li className="flex items-start gap-2">
                                        <span className="text-primary-light mt-1">•</span>
                                        <span>Improved real-time bill tracking accuracy</span>
                                      </li>
                                      <li className="flex items-start gap-2">
                                        <span className="text-primary-light mt-1">•</span>
                                        <span>Added historical bill comparison feature</span>
                                      </li>
                                      <li className="flex items-start gap-2">
                                        <span className="text-primary-light mt-1">•</span>
                                        <span>Expanded stakeholder impact analysis</span>
                                      </li>
                                      <li className="flex items-start gap-2">
                                        <span className="text-primary-light mt-1">•</span>
                                        <span>New interactive data visualizations</span>
                                      </li>
                                    </ul>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Desktop Actions Section */}
                <div className="hidden md:flex items-center gap-2 sm:gap-4 self-end sm:self-auto">
                  <a
                    href="https://github.com/humanperzeus/dogeplot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glass-panel hover:bg-opacity-50 rounded-full h-8 w-8 sm:h-10 sm:w-10 flex items-center justify-center transition-all"
                  >
                    <GitHubIcon />
                  </a>
                  <a
                    href="https://x.com/dogeplot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glass-panel hover:bg-opacity-50 rounded-full h-8 w-8 sm:h-10 sm:w-10 flex items-center justify-center transition-all"
                  >
                    <XIcon />
                  </a>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="glass-panel hover:bg-opacity-50 rounded-full h-8 w-8 sm:h-10 sm:w-10">
                        <HelpCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="glass-panel border-0">
                      <DialogHeader>
                        <DialogTitle className="gradient-text text-xl">About DOGEPLOT</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-6">
                        <div className="glass-panel p-4 rounded-lg">
                          <p className="text-zinc-300 leading-relaxed">
                            DOGEPLOT (Department of Government Efficiency - Policy Lens of
                            Truth) is your AI-powered companion for tracking and analyzing
                            congressional bills in real-time.
                          </p>
                        </div>
                        <div className="glass-panel p-4 rounded-lg space-y-3">
                          <h4 className="font-medium text-primary-light">Key Features:</h4>
                          <ul className="space-y-2">
                            <li className="flex items-center gap-2 text-zinc-300">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary-light/70" />
                              Real-time bill tracking and analysis
                            </li>
                            <li className="flex items-center gap-2 text-zinc-300">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary-light/70" />
                              AI-powered insights and summaries
                            </li>
                            <li className="flex items-center gap-2 text-zinc-300">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary-light/70" />
                              Advanced search and filtering
                            </li>
                          </ul>
                        </div>
                        <div className="glass-panel p-4 rounded-lg mt-4">
                          <h4 className="font-medium text-primary-light mb-3">Disclaimer:</h4>
                          <ScrollArea className="h-[200px] pr-4">
                            <p className="text-zinc-300 text-sm leading-relaxed">
                              The DOGEPLOT Memes are intended to function as an expression of support for, and engagement with, the ideals and beliefs embodied by the symbol "$DOGEPLOT" and the associated artwork and are not intended to be, or to be the subject of, an investment opportunity, investment contract, or security of any type. By using the Website and the Services, you acknowledge and agree that the DOGEPLOT Memes should be traded solely as cryptographic assets intended to function as set forth above, and that you are acquiring the DOGEPLOT Memes as an expression of support for, and engagement with, these ideals and beliefs and not as an investment opportunity, investment contract, or security of any type. Please be aware that the price of DOGEPLOT Memes may be extremely volatile and you may experience substantial losses in connection with a sale or other disposition of DOGEPLOT Memes. We make absolutely no promise or guarantee that the DOGEPLOT Memes will increase in value or maintain the same value as the amount you paid to purchase same. No information and/or Content made available by and through the Services is or should be considered advice or recommendation or an invitation to enter into an agreement for any investment purpose. Further, no element of the Services qualifies or is intended to be an offering of securities in any jurisdiction, nor does it constitute an offer or an invitation to purchase shares, securities or other financial products. IT REMAINS YOUR SOLE AND EXCLUSIVE RESPONSIBILITY TO ASSURE THAT THE PURCHASE AND SALE OF THE DOGEPLOT MEMES AND THE USE OF CRYPTOCURRENCIES COMPLIES WITH LAWS AND REGULATIONS IN YOUR JURISDICTION AND ALL APPLICABLE JURISDICTIONS. We shall have no responsibility or liability for any DOGE Memes that are lost, misplaced, or inaccessible.
                            </p>
                          </ScrollArea>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Dialog open={versionDialogOpen} onOpenChange={setVersionDialogOpen}>
                    <DialogTrigger asChild>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="relative group"
                        >
                          <span className="bg-gradient-to-r from-primary-light via-primary to-primary-dark bg-clip-text text-transparent font-bold">
                            v1.0.4
                          </span>
                          <div className="absolute hidden group-hover:block right-0 top-full mt-2 p-3 bg-zinc-900/95 backdrop-blur border border-zinc-800 rounded-lg shadow-xl w-64 z-50">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-primary-light font-semibold">Current Version</span>
                                <Badge className="bg-primary-light/20 text-primary-light text-xs">v1.0.4</Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-zinc-400">Release Date</span>
                                <span className="text-zinc-300 flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date().toLocaleDateString()}
                                </span>
                              </div>
                              <div className="pt-2 border-t border-zinc-800">
                                <div className="text-xs text-zinc-300 space-y-1">
                                  <div className="flex items-start gap-2">
                                    <span className="text-primary-light">•</span>
                                    <span>Improved server-side caching system</span>
                                  </div>
                                  <div className="flex items-start gap-2">
                                    <span className="text-primary-light">•</span>
                                    <span>Added GitHub repository link</span>
                                  </div>
                                  <div className="flex items-start gap-2">
                                    <span className="text-primary-light">•</span>
                                    <span>Enhanced environment handling</span>
                                  </div>
                                  <div className="flex items-start gap-2">
                                    <span className="text-primary-light">•</span>
                                    <span>Fixed semantic search cache reset</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </Button>
                      </div>
                    </DialogTrigger>
                    <DialogContent className="glass-panel border-0">
                      <DialogHeader>
                        <DialogTitle className="gradient-text text-xl">Version Information</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-6">
                        <div className="glass-panel p-4 rounded-lg space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-300">Current Version</span>
                            <span className="text-primary-light font-medium">v1.0.4</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-300">Release Date</span>
                            <span className="text-zinc-400">04.03.2025</span>
                          </div>
                        </div>
                        
                        <div className="glass-panel p-4 rounded-lg space-y-4">
                          <h4 className="font-medium text-primary-light">Update History</h4>
                          <div className="space-y-6 max-h-[300px] overflow-y-auto pr-2">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-primary-light font-medium">v1.0.4</span>
                                <span className="text-zinc-400 text-xs">Latest</span>
                              </div>
                              <ul className="space-y-1 text-xs text-zinc-300">
                                <li className="flex items-start gap-1">
                                  <span className="text-primary-light mt-1">•</span>
                                  <span>Improved server-side caching system</span>
                                </li>
                                <li className="flex items-start gap-1">
                                  <span className="text-primary-light mt-1">•</span>
                                  <span>Added GitHub repository link</span>
                                </li>
                                <li className="flex items-start gap-1">
                                  <span className="text-primary-light mt-1">•</span>
                                  <span>Enhanced environment handling</span>
                                </li>
                                <li className="flex items-start gap-1">
                                  <span className="text-primary-light mt-1">•</span>
                                  <span>Fixed semantic search cache reset</span>
                                </li>
                              </ul>
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-emerald-400 text-sm">v1.0.3</span>
                                <span className="text-zinc-500 text-xs">Feb 23, 2025</span>
                              </div>
                              <ul className="space-y-1.5 text-sm text-zinc-300">
                                <li className="flex items-start gap-2">
                                  <span className="text-primary-light mt-1">•</span>
                                  <span>Enhanced AI analysis with deeper policy insights</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <span className="text-primary-light mt-1">•</span>
                                  <span>Improved real-time bill tracking accuracy</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <span className="text-primary-light mt-1">•</span>
                                  <span>Added historical bill comparison feature</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <span className="text-primary-light mt-1">•</span>
                                  <span>Expanded stakeholder impact analysis</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <span className="text-primary-light mt-1">•</span>
                                  <span>New interactive data visualizations</span>
                                </li>
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
