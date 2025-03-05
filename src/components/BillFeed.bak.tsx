import React, { useState, useEffect, useRef } from "react";
import { ScrollArea } from "./ui/scroll-area";
import { BillDialog } from "./BillDialog";
import { fetchBills, fetchCongressYears, fetchTrendingBills, semanticSearchBillsByText } from "@/lib/api";
import { Badge } from "./ui/badge";
import { Alert, AlertDescription } from "./ui/alert";
import { AlertCircle } from "lucide-react";
import { Skeleton } from "./ui/skeleton";
import SearchBar from "./SearchBar";
import { useInView } from "react-intersection-observer";
import { UIBill } from '@/types/bills';
import { format } from "date-fns";
import { Button } from "./ui/button";
import { Search, Loader2, Users, Activity, FileText, Calendar, Bot, Building2 } from "lucide-react";
import { SimilarityBadge } from "./SimilarityBadge";

// Use the UIBill type from our types directory
type Bill = UIBill;

interface BillFeedProps {
  onBillClick?: (billId: string) => void;
  isLoading?: boolean;
  searchQuery?: string;
  filters?: {
    showActive: boolean;
    showIntroduced: boolean;
    year: string;
    billType: string;
    showWithText: boolean;
    showWithPdf: boolean;
    status: string;
    chamber: string;
  };
  onSearch?: (term: string) => void;
  onFilterChange?: (filters: {
    showActive: boolean;
    showIntroduced: boolean;
    year: string;
    billType: string;
    showWithText: boolean;
    showWithPdf: boolean;
    status: string;
    chamber: string;
  }) => void;
}

const formatBillType = (type: string) => {
  const typeMap = {
    'hr': 'H.R.',
    'hjres': 'H.J.Res.',
    'hres': 'H.Res.',
    's': 'S.'
  };
  return typeMap[type.toLowerCase()] || type;
};

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

const getStatusProgress = (status: string) => {
  switch (status) {
    case 'signed_into_law':
      return 100;
    case 'veto_overridden':
      return 100;
    case 'vetoed':
      return 90;
    case 'presented_to_president':
      return 80;
    case 'passed_both_chambers':
      return 70;
    case 'passed_chamber':
      return 50;
    case 'reported_by_committee':
      return 30;
    case 'referred_to_committee':
      return 20;
    case 'introduced':
      return 10;
    case 'failed':
      return 0;
    default:
      return 0;
  }
};

const formatStatus = (status: string) => {
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Add stage mapping utility
const getStageIndex = (status: string): number => {
  switch (status) {
    case 'signed_into_law':
    case 'veto_overridden':
      return 4;
    case 'vetoed':
    case 'presented_to_president':
      return 3;
    case 'passed_both_chambers':
    case 'passed_chamber':
      return 2;
    case 'reported_by_committee':
    case 'referred_to_committee':
      return 1;
    case 'introduced':
      return 0;
    case 'failed':
      return -1;
    default:
      return 0;
  }
};

const TrendingBillCardDesign1: React.FC<{
  bill: UIBill;
  onClick: () => void;
}> = ({ bill, onClick }) => {
  // Calculate activity score based on engagement
  const maxScore = 100;
  const activityScore = Math.min(
    ((bill.cosponsors_count || 0) * 2 + (bill.actions_count || 0)) / maxScore * 100,
    100
  );

  return (
    <div
      onClick={onClick}
      className="glass-panel p-3 sm:p-4 rounded-lg hover:bg-zinc-800/50 transition-colors cursor-pointer"
    >
      {/* Activity Score Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary-light" />
          <span className="text-[11px] text-zinc-400">Activity Score</span>
        </div>
        <div className="px-2 py-1 bg-primary-light/10 rounded-full">
          <span className="text-[11px] text-primary-light font-medium">{Math.round(activityScore)}%</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-4">
        <div 
          className="h-full bg-gradient-to-r from-primary-light/70 to-primary-light rounded-full transition-all duration-500"
          style={{ width: `${activityScore}%` }}
        />
      </div>

      {/* Purpose-focused Title */}
      <div className="mb-4">
        <div className="text-[10px] text-primary-light mb-1">Purpose & Impact:</div>
        <h4 className="font-medium text-zinc-200 text-[13px] leading-snug mb-2">{bill.title}</h4>
        {bill.summary && (
          <div className="text-[11px] text-zinc-400 line-clamp-3 leading-relaxed">{bill.summary}</div>
        )}
      </div>

      {/* Bill Info */}
      <div className="flex items-center justify-between text-[11px] bg-zinc-900/30 rounded-lg p-2">
        <span className="text-zinc-300">{bill.bill_type}{bill.bill_number}</span>
        <Badge className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusColor(bill.status)}`}>
          {formatStatus(bill.status)}
        </Badge>
      </div>
    </div>
  );
};

const TrendingBillCardDesign2: React.FC<{
  bill: Bill;
  onClick: () => void;
}> = ({ bill, onClick }) => {
  // Calculate trending metrics
  const calculateTrendingMetrics = () => {
    // Base metrics
    const maxSponsors = 100;
    const maxActions = 50;
    const sponsorsScore = Math.min(((bill.cosponsors_count || 0) / maxSponsors) * 100, 100);
    const actionsScore = Math.min(((bill.actions_count || 0) / maxActions) * 100, 100);

    // Calculate recency score (higher for more recent bills)
    const daysSinceIntroduction = Math.floor((Date.now() - new Date(bill.introduction_date).getTime()) / (1000 * 60 * 60 * 24));
    const recencyScore = Math.max(100 - (daysSinceIntroduction * 0.5), 0); // Lose 0.5 points per day, minimum 0

    // Calculate activity score based on recent actions
    const daysSinceLastAction = bill.latest_action_date 
      ? Math.floor((Date.now() - new Date(bill.latest_action_date).getTime()) / (1000 * 60 * 60 * 24))
      : daysSinceIntroduction;
    const recentActivityScore = Math.max(100 - (daysSinceLastAction * 2), 0); // Lose 2 points per day since last action

    // Calculate engagement score
    const engagementScore = (
      (sponsorsScore * 0.3) +        // 30% weight for sponsors
      (actionsScore * 0.3) +         // 30% weight for actions
      (recencyScore * 0.2) +         // 20% weight for recency
      (recentActivityScore * 0.2)    // 20% weight for recent activity
    );

    return {
      sponsorsScore,
      actionsScore,
      recencyScore,
      recentActivityScore,
      engagementScore: Math.round(engagementScore)
    };
  };

  const metrics = calculateTrendingMetrics();
  const formatDate = (date: string) => {
    return format(new Date(date), "MM/dd/yyyy");
  };

  // Calculate bill progress stages
  const stages = ["Introduced", "Committee", "Chamber", "Final Stage", "Law"];
  const currentStageIndex = getStageIndex(bill.status);

  return (
    <div
      onClick={onClick}
      className="glass-panel p-3 sm:p-4 rounded-lg hover:bg-zinc-800/50 transition-colors cursor-pointer"
    >
      {/* Header with Bill ID, Congress, and Engagement Score */}
      <div className="flex flex-col gap-2 mb-3">
        {/* Bill Identifiers */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className="px-2 py-0.5 rounded-full font-medium bg-zinc-800/50 text-zinc-200 border border-zinc-700 text-xs sm:text-sm whitespace-nowrap">
            {bill.congress}th Congress
          </Badge>
          <Badge className="px-2 py-0.5 rounded-full font-medium bg-zinc-800/50 text-zinc-200 border border-zinc-700 text-xs sm:text-sm whitespace-nowrap">
            {formatBillType(bill.bill_type)}{bill.bill_number}
          </Badge>
        </div>
        {/* Engagement Score */}
        <div className="flex items-center gap-2 xs:ml-auto">
          <span className="text-[11px] text-zinc-400 whitespace-nowrap">Engagement Score:</span>
          <div className="px-2 py-1 bg-primary-light/10 rounded-full min-w-[3rem] text-center">
            <span className="text-[11px] text-primary-light font-medium">{metrics.engagementScore}%</span>
          </div>
        </div>
      </div>

      {/* Bill Progress */}
      <div className="glass-panel bg-zinc-900/30 rounded-lg p-2 mb-4">
        <div className="flex justify-between items-start text-[10px] text-zinc-400">
          {stages.map((stage, index) => (
            <div key={stage} className="flex flex-col items-center gap-1 px-1">
              <span className={`${index <= currentStageIndex ? "text-primary-light" : ""} text-center truncate max-w-[4rem] sm:max-w-none`}>
                {stage}
              </span>
              {index === 0 && (
                <span className="text-zinc-500 text-[9px] sm:text-[10px]">{formatDate(bill.introduction_date)}</span>
              )}
              {index === currentStageIndex && index !== 0 && (
                <span className="text-zinc-500 text-[9px] sm:text-[10px]">{formatDate(bill.latest_action_date || bill.introduction_date)}</span>
              )}
            </div>
          ))}
        </div>
        <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mt-2">
          <div 
            className="h-full bg-primary-light rounded-full transition-all duration-500"
            style={{ width: `${((currentStageIndex + 1) / stages.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Purpose-focused Title */}
      <div className="mb-4">
        <div className="text-[10px] text-primary-light mb-1">Legislative Intent:</div>
        <h4 className="font-medium text-zinc-200 text-[13px] leading-snug mb-2">{bill.title}</h4>
        {bill.summary && (
          <div className="text-[11px] text-zinc-400 line-clamp-3 leading-relaxed">{bill.summary}</div>
        )}
      </div>

      {/* Activity Metrics */}
      <div className="space-y-3">
        {/* Sponsors Score */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-zinc-400">Support Level</span>
            <span className="text-primary-light">{bill.cosponsors_count || 0} Sponsors</span>
          </div>
          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary-light/70 rounded-full transition-all duration-500"
              style={{ width: `${metrics.sponsorsScore}%` }}
            />
          </div>
        </div>

        {/* Actions Score */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-zinc-400">Activity Level</span>
            <span className="text-primary-light">{bill.actions_count || 0} Actions</span>
          </div>
          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary-light rounded-full transition-all duration-500"
              style={{ width: `${metrics.actionsScore}%` }}
            />
          </div>
        </div>

        {/* Recent Activity */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-zinc-400">Recent Activity</span>
            <span className="text-primary-light">{metrics.recentActivityScore}% Active</span>
          </div>
          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-primary-light/50 to-primary-light rounded-full transition-all duration-500"
              style={{ width: `${metrics.recentActivityScore}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const TrendingBillCardDesign3: React.FC<{
  bill: Bill;
  onClick: () => void;
}> = ({ bill, onClick }) => {
  // Calculate weighted activity score
  const maxScore = 150;
  const activityScore = Math.min(
    ((bill.cosponsors_count || 0) * 1.5 + (bill.actions_count || 0)) / maxScore * 100,
    100
  );

  return (
    <div
      onClick={onClick}
      className="glass-panel p-3 sm:p-4 rounded-lg hover:bg-zinc-800/50 transition-colors cursor-pointer"
    >
      {/* Bill Identifier */}
      <div className="flex items-center gap-2 mb-3">
        <Badge className="px-2 py-0.5 rounded-full font-medium bg-zinc-800/50 text-zinc-300 border border-zinc-700 text-[11px]">
          {bill.bill_type}{bill.bill_number}
        </Badge>
        {bill.policy_area && (
          <div className="text-[10px] text-zinc-400">{bill.policy_area}</div>
        )}
      </div>

      {/* Purpose Box */}
      <div className="bg-zinc-900/30 rounded-lg p-2 mb-3">
        <div className="text-[10px] text-primary-light mb-1">Key Objectives:</div>
        <h4 className="font-medium text-zinc-200 text-[13px] leading-snug mb-2">{bill.title}</h4>
        {bill.summary && (
          <div className="text-[11px] text-zinc-400 line-clamp-3 leading-relaxed">{bill.summary}</div>
        )}
      </div>

      {/* Activity Score */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-primary-light" />
            <span className="text-[11px] text-zinc-300">Engagement Level</span>
          </div>
          <span className="text-[11px] text-primary-light font-medium">{Math.round(activityScore)}%</span>
        </div>
        
        {/* Progress Bar */}
        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-primary-light/50 via-primary-light/70 to-primary-light rounded-full transition-all duration-500"
            style={{ width: `${activityScore}%` }}
          />
        </div>

        {/* Quick Stats */}
        <div className="flex items-center justify-between text-[11px] pt-1">
          <span className="text-zinc-400">{bill.cosponsors_count || 0} Sponsors</span>
          <span className="text-zinc-400">•</span>
          <span className="text-zinc-400">{bill.actions_count || 0} Actions</span>
          <span className="text-zinc-400">•</span>
          <span className={`${
            bill.status === 'signed_into_law' || bill.status === 'veto_overridden' ? "text-emerald-400" :
            bill.status === 'passed_both_chambers' || bill.status === 'presented_to_president' ? "text-blue-400" :
            bill.status === 'passed_chamber' || bill.status === 'reported_by_committee' ? "text-amber-400" :
            "text-red-400"
          }`}>
            {formatStatus(bill.status)}
          </span>
        </div>
      </div>
    </div>
  );
};

// Update the TrendingBillCard component to use only Design 2
const TrendingBillCard: React.FC<{
  bill: Bill;
  onClick: () => void;
}> = ({ bill, onClick }) => {
  return <TrendingBillCardDesign2 bill={bill} onClick={onClick} />;
};

const ProcessedBillCardDesign1: React.FC<{
  bill: Bill;
  onClick: () => void;
}> = ({ bill, onClick }) => {
  // Format date string
  const formatDate = (date: string) => {
    return format(new Date(date), "MMM d, yyyy");
  };

  return (
    <div
      onClick={onClick}
      className="glass-panel relative p-4 rounded-lg hover:bg-zinc-800/50 transition-colors cursor-pointer"
    >
      {/* Bill Title */}
      <h3 className="text-zinc-100 font-medium text-md mb-3">{bill.title}</h3>
      
      {/* If we have a similarity score from semantic search, display it */}
      {bill.similarity !== undefined && (
        <div className="absolute top-3 right-3 px-2 py-0.5 rounded bg-primary-light/20 flex items-center gap-1">
          <span className="text-xs font-medium text-primary-light">
            {(bill.similarity * 100).toFixed(0)}% Match
          </span>
        </div>
      )}
      
      {/* Meta Info */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs mb-3">
        {/* Date */}
        <div className="flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5 text-zinc-400" />
          <span className="text-zinc-300">
            {bill.introduction_date ? formatDate(bill.introduction_date) : "N/A"}
          </span>
        </div>
        
        {/* Sponsors */}
        <div className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5 text-zinc-400" />
          <span className="text-zinc-300">
            {(bill.sponsors && bill.sponsors.length) || 0} Sponsor{(bill.sponsors && bill.sponsors.length !== 1) ? "s" : ""}
          </span>
        </div>
        
        {/* Committee */}
        {bill.committee && (
          <div className="flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5 text-zinc-400" />
            <span className="text-zinc-300">
              {bill.committee}
            </span>
          </div>
        )}
      </div>
      
      {/* Bill ID and Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-xs">
            {bill.congress}th Congress
          </span>
          <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-xs">
            {formatBillType(bill.bill_type)} {bill.bill_number}
          </span>
        </div>
        <Badge className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(bill.status)}`}>
          {formatStatus(bill.status)}
        </Badge>
      </div>
    </div>
  );
};

const ProcessedBillCardDesign2: React.FC<{
  bill: Bill;
  onClick: () => void;
}> = ({ bill, onClick }) => {
  const formatDate = (date: string) => {
    return format(new Date(date), "MM/dd/yyyy");
  };

  return (
    <div
      onClick={onClick}
      className="glass-panel p-3 rounded-lg hover:bg-zinc-800/50 transition-colors cursor-pointer"
    >
      <div className="flex flex-col gap-2.5">
        {/* Header with Status */}
        <div className="flex items-center gap-2">
          <Badge className="px-2 py-1 rounded-full font-medium bg-zinc-800/50 text-zinc-200 border border-zinc-700 text-[11px]">
            {bill.bill_type}{bill.bill_number}
          </Badge>
          <Badge className={`px-2 py-1 rounded-full text-[11px] font-medium ${getStatusColor(bill.status)}`}>
            {formatStatus(bill.status)}
          </Badge>
        </div>

        {/* Title */}
        <h4 className="font-medium text-zinc-200 line-clamp-2 text-[13px]">{bill.title}</h4>

        {/* Timeline */}
        <div className="space-y-2 bg-zinc-900/30 rounded-lg p-2">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary-light/70" />
            <div className="text-[11px] text-zinc-300">
              Introduced on {formatDate(bill.introduction_date)}
            </div>
          </div>
          {bill.latest_action_date && (
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-primary-light" />
              <div className="text-[11px] text-zinc-300">
                {bill.latest_action_text}
                <span className="text-zinc-400 ml-1">
                  ({formatDate(bill.latest_action_date)})
            </span>
              </div>
            </div>
        )}
      </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          {bill.policy_area && (
            <Badge className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary-light/10 text-primary-light border border-primary-light/20">
              {bill.policy_area}
            </Badge>
          )}
          {bill.analysis_status === "completed" && (
            <Badge className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              AI Analysis Complete
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
};

const ProcessedBillCardDesign3: React.FC<{
  bill: Bill;
  onClick: () => void;
}> = ({ bill, onClick }) => {
  const formatDate = (date: string) => {
    return format(new Date(date), "MM/dd/yyyy");
  };

  return (
    <div
      onClick={onClick}
      className="glass-panel p-3 rounded-lg hover:bg-zinc-800/50 transition-colors cursor-pointer"
    >
      <div className="flex flex-col gap-2.5">
        {/* Stats Dashboard */}
        <div className="grid grid-cols-2 gap-2 bg-zinc-900/30 rounded-lg p-2">
          <div className="flex flex-col items-center justify-center p-2 bg-zinc-900/30 rounded-lg">
            <span className="text-[10px] text-zinc-400">Sponsors</span>
            <span className="text-lg font-medium text-zinc-200">{bill.cosponsors_count || 0}</span>
          </div>
          <div className="flex flex-col items-center justify-center p-2 bg-zinc-900/30 rounded-lg">
            <span className="text-[10px] text-zinc-400">Actions</span>
            <span className="text-lg font-medium text-zinc-200">{bill.actions_count || 0}</span>
          </div>
        </div>

        {/* Bill Info */}
        <div className="flex items-center gap-2">
          <Badge className="px-2 py-1 rounded-full font-medium bg-zinc-800/50 text-zinc-200 border border-zinc-700 text-[11px]">
            {bill.bill_type}{bill.bill_number}
          </Badge>
          <h4 className="font-medium text-zinc-200 line-clamp-1 text-[13px] flex-1">{bill.title}</h4>
        </div>

        {/* Status and Policy */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <Badge className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${getStatusColor(bill.status)}`}>
              {formatStatus(bill.status)}
            </Badge>
            {bill.policy_area && (
              <Badge className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary-light/10 text-primary-light border border-primary-light/20">
                {bill.policy_area}
              </Badge>
            )}
          </div>
          <span className="text-[10px] text-zinc-400">
            Updated {formatDate(bill.update_date || bill.introduction_date)}
          </span>
        </div>
      </div>
    </div>
  );
};

const ProcessedBillCardDesign4: React.FC<{
  bill: Bill;
  onClick: () => void;
}> = ({ bill, onClick }) => {
  // Calculate activity score based on cosponsors and actions
  const maxCosponsors = 100; // Example maximum values
  const maxActions = 50;
  const sponsorsScore = ((bill.cosponsors_count || 0) / maxCosponsors) * 100;
  const actionsScore = ((bill.actions_count || 0) / maxActions) * 100;
  const activityScore = Math.round((sponsorsScore + actionsScore) / 2);

  return (
    <div
      onClick={onClick}
      className="glass-panel p-3 rounded-lg hover:bg-zinc-800/50 transition-colors cursor-pointer"
    >
      <div className="flex flex-col gap-2.5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-300">
            {bill.bill_type}{bill.bill_number} • Congress {bill.congress}
          </span>
        </div>

        {/* Title */}
        <h4 className="font-medium text-zinc-200 line-clamp-2 text-[13px]">{bill.title}</h4>

        {/* Activity Score */}
      <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-zinc-400">Activity Score</span>
            <span className="text-[11px] font-medium text-primary-light">{activityScore}%</span>
          </div>
          
          {/* Sponsors Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-zinc-400">Sponsors</span>
              <span className="text-zinc-300">{bill.cosponsors_count || 0}</span>
            </div>
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary-light/70 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(sponsorsScore, 100)}%` }}
              />
            </div>
          </div>

          {/* Actions Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-zinc-400">Actions</span>
              <span className="text-zinc-300">{bill.actions_count || 0}</span>
            </div>
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary-light rounded-full transition-all duration-500"
                style={{ width: `${Math.min(actionsScore, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          <Badge className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${getStatusColor(bill.status)}`}>
            {formatStatus(bill.status)}
          </Badge>
          {bill.policy_area && (
            <Badge className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary-light/10 text-primary-light border border-primary-light/20">
              {bill.policy_area}
            </Badge>
          )}
          {bill.analysis_status === "completed" && (
            <div className="flex items-center gap-1 text-[10px] text-emerald-400">
              <Bot className="h-3.5 w-3.5" />
              <span>AI Analysed</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ProcessedBillCardDesign5: React.FC<{
  bill: Bill;
  onClick: () => void;
}> = ({ bill, onClick }) => {
  // Focus on bill purpose and impact
  const formatDate = (date: string) => {
    return format(new Date(date), "MM/dd/yyyy");
  };

  return (
    <div
      onClick={onClick}
      className="glass-panel p-3 rounded-lg hover:bg-zinc-800/50 transition-colors cursor-pointer"
    >
      <div className="flex flex-col gap-2.5">
        {/* Purpose Tag */}
        {bill.policy_area && (
          <div className="bg-primary-light/10 text-primary-light text-[10px] px-2 py-0.5 rounded-full w-fit">
            {bill.policy_area}
          </div>
        )}

        {/* Title with Emphasis */}
        <h4 className="font-medium text-zinc-200 text-[13px] leading-snug">
          <span className="text-primary-light">Purpose:</span> {bill.title}
        </h4>

        {/* Key Information Box */}
        <div className="bg-zinc-900/30 rounded-lg p-2 space-y-2">
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-zinc-400" />
            <span className="text-[11px] text-zinc-300">
              {bill.bill_type}{bill.bill_number} • Congress {bill.congress}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-zinc-400" />
            <span className="text-[11px] text-zinc-300">
              Introduced {formatDate(bill.introduction_date)}
            </span>
          </div>
          {bill.latest_action_text && (
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-zinc-400" />
              <span className="text-[11px] text-zinc-300 line-clamp-1">
                {bill.latest_action_text}
              </span>
            </div>
          )}
        </div>

        {/* Status and Analysis */}
        <div className="flex items-center justify-between">
          <Badge className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${getStatusColor(bill.status)}`}>
            {formatStatus(bill.status)}
          </Badge>
          {bill.analysis_status === "completed" && (
            <div className="flex items-center gap-1 text-[10px] text-emerald-400">
              <Bot className="h-3.5 w-3.5" />
              <span>AI Analysed</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ProcessedBillCardDesign6: React.FC<{
  bill: Bill;
  onClick: () => void;
}> = ({ bill, onClick }) => {
  const formatDate = (date: string) => {
    return format(new Date(date), "MM/dd/yyyy");
  };

  // Focus on progress and current stage
  const stages = ["Introduced", "Committee", "Chamber", "Final Stage", "Law"];
  const currentStageIndex = getStageIndex(bill.status);

  return (
    <div
      onClick={onClick}
      className="glass-panel p-3 rounded-lg hover:bg-zinc-800/50 transition-colors cursor-pointer"
    >
      <div className="flex flex-col gap-2.5">
        {/* Bill Identifier */}
        <div className="flex items-center gap-2">
          <Badge className="px-2 py-1 rounded-full font-medium bg-zinc-800/50 text-zinc-200 border border-zinc-700 text-[11px]">
            {bill.congress}th Congress
          </Badge>
          <Badge className="px-2 py-1 rounded-full font-medium bg-zinc-800/50 text-zinc-200 border border-zinc-700 text-[11px]">
            {formatBillType(bill.bill_type)}{bill.bill_number}
          </Badge>
        </div>

        {/* Title */}
        <h4 className="font-medium text-zinc-200 line-clamp-2 text-[13px]">{bill.title}</h4>

        {/* Progress Visualization */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-[10px] text-zinc-400 gap-1">
            {stages.map((stage, index) => (
              <div key={stage} className="flex flex-col items-center gap-1">
                <span className={`${index <= currentStageIndex ? "text-primary-light" : ""} text-center`}>
                  {stage}
                </span>
                {index === currentStageIndex && (
                  <span className="text-zinc-500">{formatDate(bill.latest_action_date || bill.introduction_date)}</span>
                )}
              </div>
            ))}
          </div>
          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary-light rounded-full transition-all duration-500"
              style={{ width: `${((currentStageIndex + 1) / stages.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Support Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col items-center justify-center p-2 bg-zinc-900/30 rounded-lg">
            <span className="text-[10px] text-zinc-400">Support Level</span>
            <span className="text-[13px] font-medium text-zinc-200">
              {bill.cosponsors_count || 0} Sponsors
            </span>
          </div>
          <div className="flex flex-col items-center justify-center p-2 bg-zinc-900/30 rounded-lg">
            <span className="text-[10px] text-zinc-400">Activity Level</span>
            <span className="text-[13px] font-medium text-zinc-200">
              {bill.actions_count || 0} Actions
        </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const ProcessedBillCardDesign7: React.FC<{
  bill: Bill;
  onClick: () => void;
}> = ({ bill, onClick }) => {
  // Focus on key changes and impact
  const formatDate = (date: string) => {
    return format(new Date(date), "MM/dd/yyyy");
  };

  return (
    <div
      onClick={onClick}
      className="glass-panel p-3 rounded-lg hover:bg-zinc-800/50 transition-colors cursor-pointer"
    >
      <div className="flex flex-col gap-2.5">
        {/* Header with Type and Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className="px-2 py-1 rounded-full font-medium bg-zinc-800/50 text-zinc-200 border border-zinc-700 text-[11px]">
              {bill.bill_type}{bill.bill_number}
            </Badge>
            <Badge className={`px-2 py-1 rounded-full text-[11px] font-medium ${getStatusColor(bill.status)}`}>
              {formatStatus(bill.status)}
            </Badge>
          </div>
        </div>

        {/* Impact Summary */}
        <div className="bg-zinc-900/30 rounded-lg p-2">
          <div className="text-[11px] text-zinc-400 mb-1">Key Changes:</div>
          <h4 className="font-medium text-zinc-200 text-[13px] line-clamp-2">{bill.title}</h4>
        </div>

        {/* Timeline */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-primary-light" />
            <span className="text-[11px] text-zinc-300">
              Introduced on {formatDate(bill.introduction_date)}
            </span>
          </div>
          {bill.latest_action_text && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary-light/70" />
              <span className="text-[11px] text-zinc-300 line-clamp-1">
                {bill.latest_action_text}
        </span>
            </div>
          )}
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {bill.policy_area && (
            <div className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-800/50 text-zinc-300 border border-zinc-700">
              {bill.policy_area}
            </div>
          )}
          {bill.analysis_status === "completed" && (
            <div className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
              <Bot className="h-3 w-3" />
              <span>Analysis Ready</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ProcessedBillCardDesign8: React.FC<{
  bill: Bill;
  onClick: () => void;
}> = ({ bill, onClick }) => {
  // Focus on decision-making information
  const formatDate = (date: string) => {
    return format(new Date(date), "MM/dd/yyyy");
  };

  // Calculate engagement score
  const maxEngagement = 150; // Example maximum value
  const engagementScore = Math.min(
    ((bill.cosponsors_count || 0) + (bill.actions_count || 0)) / maxEngagement * 100,
    100
  );

  return (
    <div
      onClick={onClick}
      className="glass-panel p-3 rounded-lg hover:bg-zinc-800/50 transition-colors cursor-pointer"
    >
      <div className="flex flex-col gap-2.5">
        {/* Quick Info Header */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-300">
            {bill.bill_type}{bill.bill_number} • Congress {bill.congress}
          </span>
          <Badge className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${getStatusColor(bill.status)}`}>
            {formatStatus(bill.status)}
          </Badge>
        </div>

        {/* Summary Box */}
        <div className="bg-zinc-900/30 rounded-lg p-2 space-y-2">
          <div className="space-y-1">
            <div className="text-[10px] text-zinc-400">Summary:</div>
            <h4 className="font-medium text-zinc-200 text-[13px] line-clamp-2">{bill.title}</h4>
      </div>

          <div className="pt-1 border-t border-zinc-800">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-zinc-400">Engagement Level</span>
              <span className="text-primary-light">{Math.round(engagementScore)}%</span>
            </div>
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mt-1">
              <div 
                className="h-full bg-primary-light rounded-full transition-all duration-500"
                style={{ width: `${engagementScore}%` }}
              />
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <div className="bg-zinc-900/30 rounded-lg p-1.5">
            <div className="text-[10px] text-zinc-400">Sponsors</div>
            <div className="text-[13px] font-medium text-zinc-200">{bill.cosponsors_count || 0}</div>
          </div>
          <div className="bg-zinc-900/30 rounded-lg p-1.5">
            <div className="text-[10px] text-zinc-400">Actions</div>
            <div className="text-[13px] font-medium text-zinc-200">{bill.actions_count || 0}</div>
          </div>
          <div className="bg-zinc-900/30 rounded-lg p-1.5">
            <div className="text-[10px] text-zinc-400">Updated</div>
            <div className="text-[11px] font-medium text-zinc-200">
              {formatDate(bill.update_date || bill.introduction_date)}
            </div>
          </div>
        </div>

        {/* AI Analysis Badge */}
        {bill.analysis_status === "completed" && (
          <div className="flex items-center justify-between text-[10px] pt-1">
            <span className="text-zinc-400">AI Analysis:</span>
            <div className="flex items-center gap-1 text-emerald-400">
              <Bot className="h-3.5 w-3.5" />
              <span>AI Analysed</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ProcessedBillCardDesign9: React.FC<{
  bill: UIBill;
  onClick: () => void;
}> = ({ bill, onClick }) => {
  const formatDate = (date: string) => {
    return format(new Date(date), "MM/dd/yyyy");
  };

  const stages = ["Introduced", "Committee", "Chamber", "Final Stage", "Law"];
  const currentStageIndex = getStageIndex(bill.status);

  return (
    <div
      onClick={onClick}
      className="glass-panel p-3 rounded-lg hover:bg-zinc-800/50 transition-colors cursor-pointer w-full relative"
    >
      {/* Add similarity badge */}
      {bill.similarity !== undefined && (
        <div className="absolute top-3 right-3">
          <SimilarityBadge similarity={bill.similarity} />
        </div>
      )}
      
      <div className="flex flex-col gap-2 max-w-full">
        {/* Header with Bill ID, Congress, Stats */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-800/50 text-zinc-300 border border-zinc-700">
            {bill.congress}th Congress
          </Badge>
          <Badge className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-800/50 text-zinc-300 border border-zinc-700">
            {formatBillType(bill.bill_type)}{bill.bill_number}
          </Badge>
          <Badge className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-800/50 text-zinc-300 border border-zinc-700">
            {bill.cosponsors_count || 0} Sponsors
          </Badge>
          <Badge className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-800/50 text-zinc-300 border border-zinc-700">
            {bill.actions_count || 0} Actions
          </Badge>
          {bill.analysis_status === "completed" && (
            <div className="flex items-center gap-1 text-[10px] text-emerald-400">
              <Bot className="h-3.5 w-3.5" />
              <span>AI Analysed</span>
            </div>
          )}
        </div>

        {/* Title with Purpose Emphasis */}
        <h4 className="font-medium text-zinc-200 text-[13px] leading-snug break-words">
          <span className="text-primary-light">Purpose:</span> {bill.title}
        </h4>

        {/* Progress Visualization */}
        <div className="space-y-2 bg-zinc-900/30 rounded-lg p-2 w-full">
          <div className="flex justify-between items-center text-[10px] text-zinc-400 gap-1">
            {stages.map((stage, index) => (
              <div key={stage} className="flex flex-col items-center gap-1">
                <span className={`${index <= currentStageIndex ? "text-primary-light" : ""} text-center`}>
                  {stage}
                </span>
                {index === currentStageIndex && (
                  <span className="text-zinc-500">{formatDate(bill.latest_action_date || bill.introduction_date)}</span>
                )}
              </div>
            ))}
          </div>
          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary-light rounded-full transition-all duration-500"
              style={{ width: `${((currentStageIndex + 1) / stages.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Latest Action with Scrollable Text */}
        {bill.latest_action_text && (
          <div className="bg-zinc-900/30 rounded-lg p-2 w-full">
            <div className="text-[11px] text-zinc-300 break-words">
              {bill.latest_action_text}
            </div>
        </div>
      )}
      </div>
    </div>
  );
};

const BillFeed: React.FC<BillFeedProps> = ({
  onBillClick,
  isLoading: externalLoading = false,
  searchQuery = "",
  filters = { 
    showActive: true, 
    showIntroduced: true, 
    year: "all", 
    billType: "all", 
    showWithText: false,
    showWithPdf: false,
    status: "all",
    chamber: "all"
  },
  onSearch = () => {},
  onFilterChange = () => {}
}) => {
  const [bills, setBills] = useState<Bill[]>([]);
  const [trendingBills, setTrendingBills] = useState<Bill[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalBills, setTotalBills] = useState(0);
  const [loading, setLoading] = useState(false);
  const [trendingError, setTrendingError] = useState<Error | null>(null);
  const [billsError, setBillsError] = useState<Error | null>(null);
  const [availableCongressYears, setAvailableCongressYears] = useState<string[]>([]);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [isSemanticSearch, setIsSemanticSearch] = useState(false);
  const [semanticThreshold, setSemanticThreshold] = useState(0.2);
  const [semanticQuery, setSemanticQuery] = useState("");

  // Intersection observer for infinite scroll
  const { ref, inView } = useInView({
    threshold: 0,
  });

  // Fetch congress years once
  useEffect(() => {
    const loadCongressYears = async () => {
      try {
        const years = await fetchCongressYears();
        setAvailableCongressYears(years);
      } catch (err) {
        console.error('Failed to fetch congress years:', err);
      }
    };
    loadCongressYears();
  }, []);

  // Fetch trending bills
  useEffect(() => {
    const loadTrendingBills = async () => {
      try {
        const trending = await fetchTrendingBills();
        setTrendingBills(trending);
        setTrendingError(null);
      } catch (err) {
        console.error('Failed to fetch trending bills:', err);
        setTrendingError(err instanceof Error ? err : new Error('Failed to fetch trending bills'));
      }
    };
    loadTrendingBills();
  }, []);

  // Load bills with pagination
  const loadBills = async (pageNum: number, isNewSearch: boolean = false) => {
    try {
      setLoading(true);
      setBillsError(null);

      // Skip loading if we're doing a semantic search and this is a pagination request
      if (isSemanticSearch && !isNewSearch) {
        setLoading(false);
        return;
      }

      const { bills: newBills, total, hasMore: more } = await fetchBills({
        page: pageNum,
        limit: 50,
        filters: {
          year: filters.year,
          billType: filters.billType,
          status: filters.status,
          chamber: filters.chamber,
          showWithText: filters.showWithText,
          showWithPdf: filters.showWithPdf
        },
        searchQuery
      });

      setBills(prev => isNewSearch ? newBills : [...prev, ...newBills]);
      setTotalBills(total);
      setHasMore(more);
      setPage(pageNum);
    } catch (err) {
      console.error('Failed to fetch bills:', err);
      setBillsError(err instanceof Error ? err : new Error('Failed to fetch bills'));
    } finally {
      setLoading(false);
    }
  };

  // Perform semantic search
  const performSemanticSearch = async (query: string, threshold: number) => {
    if (!query.trim()) {
      return; // Don't search with empty query
    }

    try {
      setLoading(true);
      setBillsError(null);
      setIsSemanticSearch(true);
      setSemanticQuery(query);
      setSemanticThreshold(threshold);

      console.log(`Performing semantic search: "${query}" (threshold: ${threshold})`);
      const semanticResults = await semanticSearchBillsByText({
        query: query.trim(),
        threshold,
        limit: 50,
      });

      // Debug log to make sure we're getting similarity scores
      console.log('Semantic search results:', semanticResults);
      
      // Process the results to ensure similarity scores are properly formatted
      // and make sure the results are sorted by similarity (highest first)
      const processedResults: UIBill[] = semanticResults
        .map(bill => ({
          ...bill,
          // Ensure similarity exists and is properly formatted
          similarity: typeof bill.similarity === 'number' ? bill.similarity : undefined
        }))
        .sort((a, b) => {
          // Sort by similarity (highest first)
          if (a.similarity !== undefined && b.similarity !== undefined) {
            return b.similarity - a.similarity;
          }
          return 0;
        });
      
      if (processedResults.length === 0) {
        console.log('No results found for semantic search');
      } else {
        console.log(`Found ${processedResults.length} results with similarity scores`);
        // Check the first few results to make sure similarity is present
        processedResults.slice(0, 3).forEach((bill, i) => {
          console.log(`Result #${i+1}: id=${bill.id}, similarity=${bill.similarity}, title=${bill.title}`);
        });
      }
      
      setBills(processedResults);
      setTotalBills(processedResults.length);
      setHasMore(false); // Semantic search doesn't support pagination currently
      setPage(1);
    } catch (err) {
      console.error('Failed to perform semantic search:', err);
      setBillsError(err instanceof Error ? err : new Error('Failed to perform semantic search'));
    } finally {
      setLoading(false);
    }
  };

  // Reset and reload when filters or search change
  useEffect(() => {
    if (!isSemanticSearch) {
      setBills([]);
      setPage(1);
      loadBills(1, true);
    }
  }, [filters, searchQuery, isSemanticSearch]);

  // Load more when scrolling to bottom
  useEffect(() => {
    if (inView && hasMore && !loading && !isSemanticSearch) {
      loadBills(page + 1);
    }
  }, [inView, hasMore, loading, isSemanticSearch]);

  const handleBillClick = (bill: Bill) => {
    setSelectedBill(bill);
    if (onBillClick) {
      onBillClick(bill.id);
    }
  };

  const handleSearch = (term: string) => {
    setIsSemanticSearch(false);
    onSearch(term);
  };

  const handleSemanticSearch = (query: string, threshold: number) => {
    performSemanticSearch(query, threshold);
  };

  return (
    <div className="w-full h-full flex flex-col">
      <BillDialog
        bill={selectedBill ? {
          id: selectedBill.id,
          title: selectedBill.title || '',
          introductionDate: selectedBill.introduction_date,
          keyPoints: selectedBill.key_points || [],
          analysis: selectedBill.analysis || '',
          status: selectedBill.status,
          billType: selectedBill.bill_type,
          billNumber: selectedBill.bill_number,
          congress: selectedBill.congress,
          policyArea: selectedBill.policy_area || '',
          subjects: selectedBill.subjects || [],
          sponsors: selectedBill.sponsors || [],
          cosponsorsCount: selectedBill.cosponsors_count || 0,
          actionsCount: selectedBill.actions_count || 0,
          latestActionText: selectedBill.latest_action_text || '',
          latestActionDate: selectedBill.latest_action_date || '',
          summary: selectedBill.summary || '',
          fullText: selectedBill.full_text || '',
          relatedBills: typeof selectedBill.related_bills === 'string' ? JSON.parse(selectedBill.related_bills) : (selectedBill.related_bills || []),
          committee: selectedBill.committee || '',
          updateDate: selectedBill.update_date || '',
          updateDateIncludingText: selectedBill.update_date_including_text || '',
          pdf_url: selectedBill.pdf_url,
          analysis_status: selectedBill.analysis_status || 'pending',
          cboCostEstimates: typeof selectedBill.cbo_cost_estimates === 'string' ? JSON.parse(selectedBill.cbo_cost_estimates) : (selectedBill.cbo_cost_estimates || []),
          laws: typeof selectedBill.laws === 'string' ? JSON.parse(selectedBill.laws) : (selectedBill.laws || []),
          committeesCount: selectedBill.committees_count || 0,
          withdrawnCosponsorsCount: selectedBill.withdrawn_cosponsors_count || 0
        } : null}
        open={!!selectedBill}
        onOpenChange={(open) => !open && setSelectedBill(null)}
      />

      <div className="flex-1 p-2 sm:p-4 md:p-8">
        <div className="max-w-[1200px] mx-auto">
          {/* Trending Bills Section */}
          <div className="glass-panel p-3 sm:p-6 mb-4 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-6 gap-2">
              <h3 className="text-base sm:text-lg font-bold gradient-text">Trending Bills</h3>
              <div className="flex items-center space-x-2 text-xs text-zinc-400">
                <span className="text-zinc-200 cursor-help">Cosponsors</span>
                <span>•</span>
                <span className="text-zinc-200 cursor-help">Actions</span>
                <span>•</span>
                <span className="text-zinc-200 cursor-help">Status</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {trendingError ? (
                <div className="flex flex-col items-center justify-center py-8 text-center col-span-full">
                  <p className="text-lg text-zinc-400">Unable to load trending bills</p>
                  <p className="text-sm text-zinc-500 mt-2">Please try refreshing the page</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-4"
                    onClick={() => window.location.reload()}
                  >
                    Refresh Page
                  </Button>
                </div>
              ) : trendingBills.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center col-span-full">
                  <Loader2 className="h-6 w-6 animate-spin text-primary-light" />
                  <p className="text-sm text-zinc-400 mt-2">Loading trending bills...</p>
                </div>
              ) : (
                trendingBills.map((bill) => (
                  <ProcessedBillCard
                    key={bill.id}
                    bill={bill}
                    onClick={() => handleBillClick(bill)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Search Bar Section */}
          <div className="glass-panel p-3 sm:p-6 mb-4 sm:mb-8">
            <SearchBar
              onSearch={handleSearch}
              onSemanticSearch={handleSemanticSearch}
              onFilterChange={onFilterChange}
              filters={filters}
              availableCongressYears={availableCongressYears}
            />
          </div>

          {/* Show search mode indicator for semantic search */}
          {isSemanticSearch && semanticQuery && (
            <div className="mt-2 px-4 py-2 bg-primary-light/10 rounded-md flex items-center justify-between">
              <div className="text-sm">
                <span className="text-primary-light font-medium">Semantic Search:</span>
                <span className="ml-2 text-zinc-300">"{semanticQuery}"</span>
                <span className="ml-2 text-zinc-500 text-xs">(Threshold: {semanticThreshold.toFixed(2)})</span>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 bg-zinc-800/50 border-zinc-700 text-xs"
                onClick={() => {
                  setIsSemanticSearch(false);
                  // Rerun the regular search
                  onSearch(searchQuery);
                }}
              >
                Switch to Regular Search
              </Button>
            </div>
          )}

          {/* Show similarity score for semantic search results */}
          {bills.length > 0 && isSemanticSearch && (
            <div className="mt-4 mb-2 px-4">
              <p className="text-xs text-zinc-500">
                Sorted by semantic similarity to your query. Higher scores indicate stronger relevance.
              </p>
            </div>
          )}

          {/* Add a loading indicator specifically for semantic search */}
          {loading && isSemanticSearch && (
            <div className="mt-4 flex items-center justify-center gap-2 text-primary-light">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Searching semantically...</span>
            </div>
          )}

          {/* Processed Bills Section */}
          <div className="glass-panel p-3 sm:p-6">
            <div className="flex flex-col gap-4 mb-4 sm:mb-6">
              <div>
                <h3 className="text-base sm:text-lg font-medium text-white">Congressional Bills</h3>
                <div className="text-xs sm:text-sm text-zinc-400">
                  {totalBills} bills analyzed
                </div>
              </div>
            </div>

            <ScrollArea className="h-[850px] sm:h-[900px]">
              <div className="space-y-2 sm:space-y-3">
                {billsError ? (
                  <div className="flex flex-col items-center justify-center h-32 space-y-2">
                    <p className="text-zinc-400">Unable to load bills</p>
                    <p className="text-sm text-zinc-500">Please try refreshing the page</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-2"
                      onClick={() => {
                        setBillsError(null);
                        loadBills(1, true);
                      }}
                    >
                      Try Again
                    </Button>
                  </div>
                ) : bills.length === 0 && !loading ? (
                  <div className="flex flex-col items-center justify-center h-32 space-y-2">
                    <p className="text-zinc-400">No bills found matching your criteria</p>
                    {isSemanticSearch ? (
                      <>
                        <p className="text-xs sm:text-sm text-zinc-500">
                          Try adjusting your search terms or lowering the similarity threshold
                        </p>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-2"
                          onClick={() => {
                            setIsSemanticSearch(false);
                            onSearch(""); // Reset to regular search
                          }}
                        >
                          Switch to Regular Search
                        </Button>
                      </>
                    ) : (
                      <p className="text-xs sm:text-sm text-zinc-500">Try adjusting your filters</p>
                    )}
                  </div>
                ) : (
                  <>
                    {bills.map((bill) => (
                      <ProcessedBillCard
                        key={bill.id}
                        bill={bill}
                        onClick={() => handleBillClick(bill)}
                      />
                    ))}
                    {/* Loading indicator */}
                    {hasMore && (
                      <div ref={ref} className="flex justify-center py-4">
                        {loading ? (
                          <Loader2 className="h-6 w-6 animate-spin text-primary-light" />
                        ) : (
                          <div className="h-6" /> // Spacer for intersection observer
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BillFeed;

