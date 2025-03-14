import React, { useState } from "react";
import BillFeed from "./BillFeed";
import { Header } from "./Header";

interface HomeProps {
  onFilterSelect?: (filter: string) => void;
  onSavedSearchSelect?: (searchId: string) => void;
  onBillClick?: (billId: string) => void;
  isLoading?: boolean;
}

const Home: React.FC<HomeProps> = ({
  onFilterSelect,
  onSavedSearchSelect,
  onBillClick,
  isLoading,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({
    showActive: true,
    showIntroduced: true,
    year: "all",
    billType: "all",
    showWithText: false,
    showWithPdf: false,
    status: "all",
    chamber: "all"
  });

  const handleSearch = (term: string) => {
    setSearchQuery(term);
  };

  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
  };

  return (
    <div className="bg-black min-h-screen text-white">
      <Header />
      <div className="flex-1">
        <BillFeed
          searchQuery={searchQuery}
          filters={filters}
          onSearch={handleSearch}
          onFilterChange={handleFilterChange}
          onBillClick={onBillClick}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
};

export default Home;
