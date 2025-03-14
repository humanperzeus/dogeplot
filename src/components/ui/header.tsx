import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { Button } from "./button";
import { HelpCircle, Twitter } from "lucide-react";
import { ThemeToggle } from "../ThemeToggle";

export function Header() {
  const copyAddress = () => {
    const address = "TBA";
    navigator.clipboard.writeText(address);
    const copyText = document.getElementById("copy-text");
    if (copyText) {
      copyText.innerText = "Copied!";
      setTimeout(() => {
        copyText.innerText = "Copy Address";
      }, 2000);
    }
  };

  const showVersionInfo = () => {
    // TODO: Implement version info modal
  };

  return (
    <div className="w-full bg-background">
      <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-2 sm:py-4">
        {/* Contract Address Bar */}
        <div className="flex flex-wrap items-center justify-center gap-2 py-1.5 px-2 sm:py-2 sm:px-4 bg-card/50 backdrop-blur-sm mb-3 sm:mb-4 rounded-lg border text-xs sm:text-sm">
          <span className="text-muted-foreground">MEME Contract:</span>
          <code className="bg-background/50 px-2 py-0.5 sm:px-3 sm:py-1 rounded text-foreground">TBA</code>
          <button 
            onClick={copyAddress} 
            className="px-2 py-0.5 sm:px-3 sm:py-1 bg-background/50 hover:bg-accent/50 rounded transition-all flex items-center space-x-1"
          >
            <span id="copy-text">Copy</span>
            <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path>
            </svg>
          </button>
          <div className="flex items-center space-x-1 px-2 py-0.5 bg-gradient-to-r from-primary/10 to-accent/10 rounded-full border border-primary/20">
            <span className="text-primary">🎮</span>
            <span className="animate-bounce">🚀</span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row items-center gap-4 lg:gap-6 lg:justify-between">
          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-6">
            {/* Logo Container */}
            <div className="h-16 w-16 sm:h-20 sm:w-20 lg:h-24 lg:w-24 rounded-xl overflow-hidden bg-gradient-to-br p-0.5 hover:scale-105 transition-transform shadow-lg">
              <img src="/doge-icon.png" alt="DOGEPLOT Logo" className="h-full w-full object-cover rounded-xl" />
            </div>
            {/* Brand Name and Description */}
            <div className="text-center sm:text-left">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight gradient-text">DOGEPLOT</h1>
              <div className="flex flex-col">
                <span className="text-base sm:text-lg lg:text-xl font-semibold text-foreground">Department of Government Efficiency</span>
                <span className="text-xs sm:text-sm font-medium gradient-text">Policy Lens of Truth</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
            {/* Social Links */}
            <div className="flex items-center space-x-4">
              {/* Twitter/X Link */}
              <a href="https://x.com/dogeplot" target="_blank" className="text-muted-foreground hover:text-foreground transition-colors">
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
                </svg>
              </a>
              {/* DexScreener Link */}
              <a href="https://dexscreener.com/solana/dogeplot" target="_blank" className="text-muted-foreground hover:text-foreground transition-colors">
                <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v16H4z"></path>
                </svg>
              </a>
            </div>
            {/* Project Description */}
            <div className="text-center lg:text-right text-xs sm:text-sm text-muted-foreground max-w-md">
              <span className="block mb-0.5 sm:mb-1">Automated watchdog analyzing every House bill in real-time,</span>
              <span className="block">exposing financial implications and policy impacts for complete transparency.</span>
            </div>
          </div>
        </div>

        {/* Version Badge */}
        <div className="flex items-center justify-center sm:justify-start mt-2 sm:mt-4">
          <button 
            onClick={showVersionInfo} 
            className="px-2 py-0.5 sm:px-3 sm:py-1 bg-background/50 hover:bg-accent/50 rounded-full flex items-center space-x-1 sm:space-x-2 group transition-all border text-xs sm:text-sm"
          >
            <span className="text-primary">v1.0.3</span>
            <svg 
              className="w-3 h-3 sm:w-4 sm:h-4 text-primary group-hover:rotate-180 transition-transform" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
