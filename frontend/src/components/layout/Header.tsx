import React, { useState, useRef, useEffect } from 'react';
import { Search, Filter, RotateCw, X, Star, Check } from 'lucide-react';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  filter: 'all' | 'starred';
  onFilterChange: (filter: 'all' | 'starred') => void;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  onRefresh,
  isRefreshing = false,
  filter,
  onFilterChange,
}) => {
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        {/* Filter Popover Dropdown */}
        <div className="relative" ref={filterRef}>
          <button
            type="button"
            onClick={() => setFilterMenuOpen(!filterMenuOpen)}
            title="Filter emails"
            className={`p-2 rounded-full transition-all cursor-pointer flex items-center justify-center relative ${
              filter === 'starred'
                ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-surface-darkInput'
            }`}
          >
            <Filter className="w-4 h-4" />
            {filter === 'starred' && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-surface-darkCard" />
            )}
          </button>

          {/* Filter Options Menu */}
          {filterMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-surface-darkCard rounded-2xl shadow-xl border border-gray-100 dark:border-surface-darkBorder py-1.5 z-40 animate-fadeIn text-xs">
              <div className="px-3 py-1.5 font-semibold text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Filter by
              </div>

              {/* All emails */}
              <button
                type="button"
                onClick={() => {
                  onFilterChange('all');
                  setFilterMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2 hover:bg-gray-50 dark:hover:bg-surface-darkInput transition-colors cursor-pointer ${
                  filter === 'all' ? 'text-brand-600 dark:text-emerald-400 font-semibold' : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                <span>All emails</span>
                {filter === 'all' && <Check className="w-3.5 h-3.5" />}
              </button>

              {/* Starred emails */}
              <button
                type="button"
                onClick={() => {
                  onFilterChange('starred');
                  setFilterMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2 hover:bg-gray-50 dark:hover:bg-surface-darkInput transition-colors cursor-pointer ${
                  filter === 'starred' ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span>Starred emails</span>
                </div>
                {filter === 'starred' && <Check className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
        </div>

        {/* Refresh Inbox */}
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

