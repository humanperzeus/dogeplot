// Status determination logic shared between sync scripts and workers
export function determineBillStatus(billData: any): string {
  const actions = billData.bill.actions?.items || [];
  const laws = billData.bill.laws || [];
  const latestAction = billData.bill.latestAction?.text?.toLowerCase() || '';

  // Sort actions by date to ensure chronological order
  const sortedActions = [...actions].sort((a: any, b: any) => {
    const dateA = new Date(a.actionDate).getTime();
    const dateB = new Date(b.actionDate).getTime();
    return dateA - dateB;
  });
  const lastActionText = sortedActions.length > 0 ? sortedActions[sortedActions.length - 1].text.toLowerCase() : '';

  // Final statuses first
  if (laws.length > 0 || 
      lastActionText.includes('became public law') ||
      lastActionText.includes('became private law') ||
      lastActionText.includes('public law no:') ||
      lastActionText.includes('private law no:') ||
      lastActionText.includes('enacted') ||
      lastActionText.includes('enacted into law')) {
    return 'signed_into_law';
  }

  if (lastActionText.includes('veto message received') ||
      lastActionText.includes('vetoed by president') ||
      lastActionText.includes('presidential veto') ||
      lastActionText.includes('received veto message')) {
    return 'vetoed';
  }

  if (lastActionText.includes('passed over president') || 
      lastActionText.includes('veto overridden') ||
      lastActionText.includes('override the veto') ||
      lastActionText.includes('overriding the veto')) {
    return 'veto_overridden';
  }

  // Enhanced failed status with specific reasons
  if (lastActionText.includes('failed') || 
      lastActionText.includes('rejected') ||
      lastActionText.includes('withdrawn by sponsor') ||
      lastActionText.includes('motion to proceed rejected') ||
      lastActionText.includes('motion to table agreed to') ||
      lastActionText.includes('motion to reconsider laid on table') ||
      lastActionText.includes('failed of passage') ||
      lastActionText.includes('failed to pass') ||
      // Add more specific failure patterns
      lastActionText.includes('motion to suspend rules and pass failed') ||
      lastActionText.includes('cloture motion rejected') ||
      lastActionText.includes('point of order sustained') ||
      lastActionText.includes('motion to discharge rejected') ||
      lastActionText.includes('motion to recommit rejected') ||
      lastActionText.includes('failed to achieve') ||
      lastActionText.includes('objected to') ||
      lastActionText.includes('postponed indefinitely') ||
      lastActionText.includes('laid on table') ||
      lastActionText.includes('consideration terminated')) {
    return 'failed';
  }

  // Presented to President
  if (lastActionText.includes('presented to president') ||
      lastActionText.includes('sent to president') ||
      lastActionText.includes('received by president') ||
      lastActionText.includes('transmitted to president')) {
    return 'presented_to_president';
  }

  // Conference Committee Actions
  if (lastActionText.includes('conference committee appointed') ||
      lastActionText.includes('conference report filed') ||
      lastActionText.includes('conference report agreed to') ||
      lastActionText.includes('conference requested') ||
      lastActionText.includes('conferees appointed') ||
      lastActionText.includes('conference report submitted')) {
    // Check if both chambers have passed the conference report
    if (sortedActions.some(action => 
        action.text.toLowerCase().includes('conference report agreed to in house')) &&
        sortedActions.some(action => 
        action.text.toLowerCase().includes('conference report agreed to in senate'))) {
      return 'passed_both_chambers';
    }
    // If only one chamber has passed, treat as passed_chamber
    if (lastActionText.includes('conference report agreed to')) {
      return 'passed_chamber';
    }
  }

  // Passage through chambers
  if ((lastActionText.includes('passed house') && lastActionText.includes('passed senate')) ||
      (lastActionText.includes('agreed to in house') && lastActionText.includes('agreed to in senate')) ||
      lastActionText.includes('cleared for president') ||
      lastActionText.includes('cleared for white house') ||
      lastActionText.includes('passed both chambers') ||
      // Check historical actions for passage through both chambers
      (sortedActions.some(action => action.text.toLowerCase().includes('passed house')) &&
       sortedActions.some(action => action.text.toLowerCase().includes('passed senate')))) {
    return 'passed_both_chambers';
  }

  if (lastActionText.includes('passed house') || 
      lastActionText.includes('passed senate') ||
      lastActionText.includes('agreed to in house') ||
      lastActionText.includes('agreed to in senate') ||
      lastActionText.includes('passed/agreed to in house') ||
      lastActionText.includes('passed/agreed to in senate') ||
      lastActionText.includes('resolution agreed to in house') ||
      lastActionText.includes('resolution agreed to in senate') ||
      lastActionText.includes('passed by recorded vote') ||
      lastActionText.includes('passed by yea-nay vote') ||
      // Add patterns for Senate resolutions
      (lastActionText.includes('submitted in the senate') && 
       lastActionText.includes('agreed to') &&
       lastActionText.includes('unanimous consent')) ||
      lastActionText.includes('resolution agreed to in senate') ||
      // Add pattern for messages between chambers
      lastActionText.includes('message on senate action sent to the house') ||
      lastActionText.includes('message on house action sent to the senate')) {
    return 'passed_chamber';
  }

  // Committee Discharge Actions
  if (lastActionText.includes('discharge petition filed') ||
      lastActionText.includes('discharge petition pending') ||
      lastActionText.includes('motion to discharge committee') ||
      lastActionText.includes('petition to discharge committee') ||
      lastActionText.includes('committee discharged') ||
      (lastActionText.includes('discharge') && 
       lastActionText.includes('committee') && 
       lastActionText.includes('petition'))) {
    // If successfully discharged, treat as reported
    if (lastActionText.includes('committee discharged') ||
        lastActionText.includes('discharge motion agreed to') ||
        lastActionText.includes('discharge petition agreed to')) {
      return 'reported_by_committee';
    }
    // Otherwise, keep as referred
    return 'referred_to_committee';
  }

  // Committee actions with amendment tracking
  if ((lastActionText.includes('reported by') && 
       (lastActionText.includes('committee') || lastActionText.includes('comm.'))) ||
      lastActionText.includes('ordered to be reported') ||
      lastActionText.includes('committee reports') ||
      lastActionText.includes('reported with amendment') ||
      lastActionText.includes('reported without amendment') ||
      lastActionText.includes('reported favorably') ||
      (lastActionText.includes('placed on') && 
       (lastActionText.includes('calendar') || lastActionText.includes('legislative calendar'))) ||
      // Add amendment status patterns
      lastActionText.includes('reported with amendments') ||
      lastActionText.includes('committee substitute reported') ||
      lastActionText.includes('clean bill reported') ||
      lastActionText.includes('reported in the nature of a substitute') ||
      lastActionText.includes('reported with modifications') ||
      // Add pattern for bills held at desk after committee
      (lastActionText.includes('held at the desk') && 
       lastActionText.includes('committee'))) {
    return 'reported_by_committee';
  }

  if ((lastActionText.includes('referred to') && 
       (lastActionText.includes('committee') || lastActionText.includes('comm.'))) ||
      lastActionText.includes('committee referral') ||
      lastActionText.includes('sequential referral') ||
      lastActionText.includes('referred to subcommittee') ||
      lastActionText.includes('referred to the subcommittee') ||
      lastActionText.includes('referred to the committee') ||
      // Add pattern for bills held at desk before committee
      (lastActionText.includes('held at the desk') && 
       !lastActionText.includes('committee'))) {
    return 'referred_to_committee';
  }

  // Default to introduced for new bills
  if (lastActionText.includes('introduced') ||
      lastActionText.includes('read first time') ||
      lastActionText.includes('read twice') ||
      lastActionText.includes('sponsor introductory remarks')) {
    return 'introduced';
  }

  return 'introduced'; // Fallback for new bills with minimal action
}

// Status progression validation
export const STATUS_PROGRESSION = {
  'introduced': ['referred_to_committee', 'failed'],
  'referred_to_committee': ['reported_by_committee', 'failed'],
  'reported_by_committee': ['passed_chamber', 'failed'],
  'passed_chamber': ['passed_both_chambers', 'failed'],
  'passed_both_chambers': ['presented_to_president', 'failed'],
  'presented_to_president': ['signed_into_law', 'vetoed', 'failed'],
  'vetoed': ['veto_overridden', 'failed'],
  'veto_overridden': ['signed_into_law', 'failed'],
  'signed_into_law': [],
  'failed': []
};

export function isValidStatusProgression(currentStatus: string, newStatus: string): boolean {
  if (!currentStatus || !newStatus) return true;
  if (currentStatus === newStatus) return true;
  if (newStatus === 'failed') return true;
  
  // Allow any progression from introduced since we don't have full history
  if (currentStatus === 'introduced') return true;
  
  // Allow progression to reported_by_committee from any earlier state
  if (newStatus === 'reported_by_committee' && 
      ['introduced', 'referred_to_committee'].includes(currentStatus)) return true;
  
  // Allow progression to passed_chamber from any earlier state
  if (newStatus === 'passed_chamber' && 
      ['introduced', 'referred_to_committee', 'reported_by_committee'].includes(currentStatus)) return true;
  
  // Allow progression to passed_both_chambers from any earlier state
  if (newStatus === 'passed_both_chambers' && 
      ['introduced', 'referred_to_committee', 'reported_by_committee', 'passed_chamber'].includes(currentStatus)) return true;
  
  // Allow progression to presented_to_president from any earlier state
  if (newStatus === 'presented_to_president' && 
      ['introduced', 'referred_to_committee', 'reported_by_committee', 'passed_chamber', 'passed_both_chambers'].includes(currentStatus)) return true;
  
  // Allow progression to signed_into_law from any earlier state
  if (newStatus === 'signed_into_law' && 
      ['introduced', 'referred_to_committee', 'reported_by_committee', 'passed_chamber', 'passed_both_chambers', 'presented_to_president'].includes(currentStatus)) return true;
  
  // Allow progression to vetoed from any earlier state
  if (newStatus === 'vetoed' && 
      ['introduced', 'referred_to_committee', 'reported_by_committee', 'passed_chamber', 'passed_both_chambers', 'presented_to_president'].includes(currentStatus)) return true;
  
  // Allow progression to veto_overridden from any earlier state
  if (newStatus === 'veto_overridden' && 
      ['introduced', 'referred_to_committee', 'reported_by_committee', 'passed_chamber', 'passed_both_chambers', 'presented_to_president', 'vetoed'].includes(currentStatus)) return true;
  
  return false;
} 