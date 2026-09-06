import React from 'react';
import { Search, Filter, RotateCw, X } from 'lucide-react';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  onRefresh,
  isRefreshing = false,
}) => {
  return (
    <header className="h-16 border-b border-gray-100 dark:border-surface-darkBorder px-6 flex items-center justify-between gap-4 bg-white dark:bg-surface-darkCard transition-colors">
      {/* Search Input Bar (matching Figma) */}
      <div className="flex-1 max-w-2xl relative">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-gray-400 absolute left-4 pointer-events-none" />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-11 pr-10 py-2 rounded-full bg-surface-pill dark:bg-surface-darkInput text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all border border-transparent dark:border-surface-darkBorder"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-3.5 p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Action Icons: Filter & Refresh */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          title="Filter emails"
          className="p-2 rounded-full text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-surface-darkInput transition-colors cursor-pointer"
        >
          <Filter className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onRefresh}
          title="Refresh inbox"
          className="p-2 rounded-full text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-surface-darkInput transition-colors cursor-pointer"
        >
          <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-brand-500' : ''}`} />
        </button>
      </div>
    </header>
  );
};
