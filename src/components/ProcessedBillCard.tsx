import React from 'react';
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { UIBill } from "@/types/bills";

interface ProcessedBillCardProps {
  bill: UIBill;
  onClick: () => void;
  variant?: 'default' | 'trending';
}

interface SimilarityBadgeProps {
  similarity?: number;
}

// Component to show similarity score as a percentage badge
export const SimilarityBadge: React.FC<SimilarityBadgeProps> = ({ similarity }) => {
  if (similarity === undefined) {
    return null;
  }
  
  // Convert to percentage and round to 2 decimal places
  const percentage = Math.round(similarity * 100);
  
  // Calculate color based on similarity score
  const getColor = () => {
    if (percentage >= 80) return 'bg-green-100 text-green-800 border-green-200';
    if (percentage >= 60) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (percentage >= 40) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (percentage >= 20) return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };
  
  return (
    <div className={`absolute top-0 right-0 m-2 px-2 py-1 text-xs font-medium rounded-full border ${getColor()}`}
         role="status" aria-label={`${percentage}% match score`}>
      {percentage}% Match
    </div>
  );
};

export const ProcessedBillCard: React.FC<ProcessedBillCardProps> = ({
  bill,
  onClick,
  variant = 'default'
}) => {
  const formatIntroDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col w-full rounded-lg border border-neutral-200 p-4 transition-all",
        "hover:border-neutral-300 hover:shadow-sm",
        "focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2",
        "dark:border-neutral-800 dark:hover:border-neutral-700 text-left"
      )}
    >
      {/* Display similarity badge when available */}
      {bill.similarity !== undefined && <SimilarityBadge similarity={bill.similarity} />}
      
      <div className="flex items-start justify-between">
        <div>
          <Badge variant="outline" className="mb-2">
            {bill.bill_number || bill.bill_type}
          </Badge>
          <h3 className="text-lg font-medium line-clamp-2 mb-1">{bill.title}</h3>
          <div className="text-sm text-neutral-600 dark:text-neutral-400">
            {formatIntroDate(bill.introduction_date)}
          </div>
        </div>
      </div>
    </button>
  );
}; 