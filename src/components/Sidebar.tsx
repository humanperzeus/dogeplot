import React, { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import {
  BookMarked,
  Filter,
  Home,
  Search,
  Star,
  Tag,
  Clock,
  ChevronRight,
  ChevronLeft,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

interface FilterCount {
  value: string;
  count: number;
}

interface SidebarProps {
  onFilterSelect?: (filter: string) => void;
  onSavedSearchSelect?: (searchId: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const Sidebar = ({
  onFilterSelect = () => {},
  onSavedSearchSelect = () => {},
  isCollapsed = false,
  onToggleCollapse = () => {},
}: SidebarProps) => {
  const [statusCounts, setStatusCounts] = useState<FilterCount[]>([]);
  const [policyCounts, setPolicyCounts] = useState<FilterCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchFilterCounts = async () => {
      setIsLoading(true);
      try {
        // Fetch status counts
        const { data: statusData } = await supabase
          .rpc('get_status_counts');

        if (statusData) {
          setStatusCounts(
            statusData.map(item => ({
              value: item.status,
              count: parseInt(item.count)
            }))
          );
        }

        // Fetch policy area counts
        const { data: policyData } = await supabase
          .rpc('get_policy_area_counts');

        if (policyData) {
          setPolicyCounts(
            policyData.map(item => ({
              value: item.policy_area,
              count: parseInt(item.count)
            }))
          );
        }
      } catch (error) {
        console.error('Error fetching filter counts:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFilterCounts();
  }, []);

  const formatStatusLabel = (status: string) => {
    return status === 'law' ? 'Public Law' : 
           status.charAt(0).toUpperCase() + status.slice(1);
  };

  return (
    <div 
      className={cn(
        "h-full bg-background border-r flex flex-col transition-all duration-300 ease-in-out",
        isCollapsed ? "w-[60px]" : "w-[280px]"
      )}
    >
      <div className="p-2 border-b flex items-center justify-between">
        <Button 
          variant="ghost" 
          size="icon"
          className="w-8 h-8"
          onClick={onToggleCollapse}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </Button>
        {!isCollapsed && (
          <Button variant="outline" className="flex-1 justify-start gap-2 ml-2">
            <Home size={16} />
            Dashboard
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        {!isCollapsed ? (
          <div className="p-4 space-y-4">
            {/* Status Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Bill Status</h3>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Filter size={16} />
                </Button>
              </div>
              <div className="space-y-1">
                {isLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  statusCounts.map((status) => (
                    <Button
                      key={status.value}
                      variant="ghost"
                      className="w-full justify-start gap-2 h-8"
                      onClick={() => onFilterSelect(status.value)}
                    >
                      <Tag size={16} />
                      <span className="flex-1 text-left">{formatStatusLabel(status.value)}</span>
                      <Badge variant="secondary" className="ml-2">
                        {status.count}
                      </Badge>
                    </Button>
                  ))
                )}
              </div>
            </div>

            <Separator />

            {/* Policy Areas Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Policy Areas</h3>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Filter size={16} />
                </Button>
              </div>
              <div className="space-y-1">
                {isLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  policyCounts.map((policy) => (
                    <Button
                      key={policy.value}
                      variant="ghost"
                      className="w-full justify-start gap-2 h-8"
                      onClick={() => onFilterSelect(policy.value)}
                    >
                      <Tag size={16} />
                      <span className="flex-1 text-left">{policy.value}</span>
                      <Badge variant="secondary" className="ml-2">
                        {policy.count}
                      </Badge>
                    </Button>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-4">
            <div className="space-y-2">
              <Button variant="ghost" size="icon" className="w-full h-8">
                <Filter size={16} />
              </Button>
              <Button variant="ghost" size="icon" className="w-full h-8">
                <Search size={16} />
              </Button>
              <Button variant="ghost" size="icon" className="w-full h-8">
                <Clock size={16} />
              </Button>
            </div>
          </div>
        )}
      </ScrollArea>

      {!isCollapsed && (
        <div className="p-4 border-t space-y-2">
          <Button variant="outline" className="w-full justify-start gap-2">
            <Clock size={16} />
            Recent Bills
            <ChevronRight size={16} className="ml-auto" />
          </Button>
          <Button variant="outline" className="w-full justify-start gap-2">
            <Search size={16} />
            Advanced Search
            <ChevronRight size={16} className="ml-auto" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
