import React from 'react';

interface SimilarityBadgeProps {
  similarity?: number;
}

/**
 * Component to display a similarity score from semantic search results
 * Shows a percentage badge with color coding based on match quality
 */
export const SimilarityBadge: React.FC<SimilarityBadgeProps> = ({ similarity }) => {
  if (similarity === undefined) return null;
  
  // Convert to percentage and round
  const percentage = Math.round(similarity * 100);
  
  // Get color based on match percentage
  const getColorClass = () => {
    if (percentage >= 80) return 'bg-emerald-500/30 text-emerald-300 border-emerald-500/40';
    if (percentage >= 60) return 'bg-blue-500/30 text-blue-300 border-blue-500/40';
    if (percentage >= 40) return 'bg-primary-light/30 text-primary-light border-primary-light/40';
    if (percentage >= 20) return 'bg-amber-500/30 text-amber-300 border-amber-500/40';
    return 'bg-zinc-500/30 text-zinc-300 border-zinc-500/40';
  };
  
  return (
    <div 
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${getColorClass()} border`}
      aria-label={`${percentage}% match score`}
    >
      {percentage}% Match
    </div>
  );
}; 