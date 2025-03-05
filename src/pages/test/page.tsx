import React from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search } from "lucide-react";

interface Bill {
  id: string;
  name: string;
  modified: string;
  trendingScore: number;
  financialImpact: number;
  stakeholderImpact: number;
  riskLevel: "low" | "medium" | "high";
  complexity: number;
}

interface ProcessingBill {
  id: string;
  name: string;
  modified: string;
}

export default function TestDashboard() {
  const [processingBills] = React.useState<ProcessingBill[]>([
    {
      id: "1",
      name: "H.R. 1234 - Infrastructure Development Act",
      modified: "2 minutes ago",
    },
    {
      id: "2",
      name: "H.R. 5678 - Clean Energy Initiative",
      modified: "5 minutes ago",
    },
  ]);

  const [trendingBills] = React.useState<Bill[]>([
    {
      id: "1",
      name: "H.R. 1234 - Infrastructure Development Act",
      modified: "2 minutes ago",
      trendingScore: 850,
      financialImpact: 75,
      stakeholderImpact: 90,
      riskLevel: "high",
      complexity: 85,
    },
    {
      id: "2",
      name: "H.R. 5678 - Clean Energy Initiative",
      modified: "5 minutes ago",
      trendingScore: 780,
      financialImpact: 65,
      stakeholderImpact: 80,
      riskLevel: "medium",
      complexity: 70,
    },
    {
      id: "3",
      name: "H.R. 9012 - Healthcare Reform Act",
      modified: "10 minutes ago",
      trendingScore: 720,
      financialImpact: 85,
      stakeholderImpact: 95,
      riskLevel: "high",
      complexity: 90,
    },
  ]);

  return (
    <div className="bg-black min-h-screen text-white">
      <Header />

      {/* Processing Status Banner */}
      {processingBills.length > 0 && (
        <div className="sticky top-[72px] left-0 right-0 glass-panel z-40">
          <div className="max-w-7xl mx-auto p-4">
            {processingBills.map((bill) => (
              <div key={bill.id} className="flex items-center gap-4">
                <div className="animate-pulse w-4 h-4 bg-primary-light rounded-full" />
                <p className="text-sm text-zinc-300">
                  Processing {bill.name}...
                  <span className="ml-2 text-xs text-zinc-500">
                    {bill.modified}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          {/* Trending Bills Section */}
          <div className="glass-panel p-6 mb-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold gradient-text">Trending Bills</h3>
              <div className="flex items-center space-x-2 text-xs text-zinc-400 group relative">
                <span>Trending Score Based On:</span>
                <span className="text-primary-light cursor-help">
                  Financial Impact
                </span>
                <span>•</span>
                <span className="text-primary-light cursor-help">
                  Stakeholder Impact
                </span>
                <span>•</span>
                <span className="text-primary-light cursor-help">
                  Risk Level & Complexity
                </span>
                <div className="hidden group-hover:block absolute top-full right-0 mt-2 p-4 glass-panel rounded-lg w-64 z-10">
                  <p className="mb-2 text-zinc-300">Trending score calculation:</p>
                  <ul className="space-y-1 text-zinc-400">
                    <li>• Recency: -0.1 points/second</li>
                    <li>• Complexity: 2 points/chunk</li>
                    <li>• Financial: 0.5 points/unit</li>
                    <li>• Stakeholders: 1.5 points each</li>
                    <li>• High Risk: +100 points</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {trendingBills.map((bill) => (
                <div
                  key={bill.id}
                  className="glass-panel p-4 rounded-lg hover:bg-zinc-800/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="font-medium text-zinc-200 line-clamp-2">
                      {bill.name}
                    </h4>
                    <div className="flex items-center space-x-1 px-2 py-1 bg-primary-light/10 rounded-full">
                      <span className="text-xs text-primary-light font-medium">
                        {bill.trendingScore}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-400">Financial Impact</span>
                      <div className="w-24 h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-light"
                          style={{ width: `${bill.financialImpact}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-400">Stakeholder Impact</span>
                      <div className="w-24 h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-light"
                          style={{ width: `${bill.stakeholderImpact}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-400">Risk Level</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          bill.riskLevel === "high"
                            ? "bg-red-500/20 text-red-400"
                            : bill.riskLevel === "medium"
                            ? "bg-yellow-500/20 text-yellow-400"
                            : "bg-green-500/20 text-green-400"
                        }`}
                      >
                        {bill.riskLevel.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Processing Files - Full Width */}
          {processingBills.length > 0 && (
            <div className="glass-panel p-6 mb-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium">Currently Processing</h3>
                <span className="text-sm text-primary-light">
                  {processingBills.length} active
                </span>
              </div>
              <div className="space-y-3">
                {processingBills.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center text-sm text-zinc-400"
                  >
                    <Loader2 className="animate-spin mr-3 h-4 w-4" />
                    {file.name}
                    <span className="ml-2 text-xs text-zinc-500">
                      {file.modified}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Processed Files - List Layout with Search */}
          <div className="glass-panel p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-medium">Processed Bills</h3>
                <div className="text-sm text-zinc-400">
                  {trendingBills.length} files analyzed
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search bills..."
                  className="pl-10 pr-4 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-300 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary-light/50"
                />
              </div>
            </div>
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {trendingBills.map((bill) => (
                  <div
                    key={bill.id}
                    className="glass-panel p-4 rounded-lg hover:bg-zinc-800/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-zinc-200">{bill.name}</h4>
                        <div className="text-sm text-zinc-400">
                          Last modified {bill.modified}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        className="text-primary-light hover:text-primary-light/80"
                      >
                        View Details
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}
