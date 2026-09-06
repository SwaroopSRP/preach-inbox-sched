import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { ActiveTab } from '../../types/api';
import {
  Clock,
  Send,
  ChevronDown,
  Settings as SettingsIcon,
  LogOut,
  ExternalLink,
  Plus,
} from 'lucide-react';

interface SidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  scheduledCount: number;
  sentCount: number;
  onOpenSettings: () => void;
  onOpenCompose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  scheduledCount,
  sentCount,
  onOpenSettings,
  onOpenCompose,
}) => {
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const adminQueuesUrl = `${import.meta.env.VITE_API_URL || ''}/admin/queues`;

  return (
    <aside className="w-64 flex-shrink-0 h-screen bg-white dark:bg-surface-darkCard border-r border-gray-100 dark:border-surface-darkBorder flex flex-col justify-between p-5 transition-colors select-none">
      <div className="space-y-6">
        {/* Top Logo - "ONB" */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="text-3xl font-black tracking-tighter text-gray-900 dark:text-white font-sans">
              ONB
            </span>
          </div>
        </div>

        {/* User Card / Dropdown Trigger */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full flex items-center justify-between p-2 rounded-2xl bg-surface-pill dark:bg-surface-darkInput hover:bg-gray-200/70 dark:hover:bg-surface-darkInput/80 transition-all cursor-pointer border border-transparent dark:border-surface-darkBorder"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-8 h-8 rounded-full object-cover border border-gray-300 dark:border-gray-600 flex-shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center justify-center flex-shrink-0">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
              <div className="text-left min-w-0">
                <div className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                  {user?.name || 'Oliver Brown'}
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                  {user?.email || 'oliver.brown@domain.io'}
                </div>
              </div>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* User Dropdown Menu */}
          {dropdownOpen && (
            <div
              className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-surface-darkCard rounded-xl shadow-lg border border-gray-100 dark:border-surface-darkBorder py-1.5 z-40 animate-fadeIn"
              onMouseLeave={() => setDropdownOpen(false)}
            >
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  onOpenSettings();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-surface-darkInput transition-colors cursor-pointer"
              >
                <SettingsIcon className="w-3.5 h-3.5 text-gray-400" />
                <span>Settings & Slack</span>
              </button>
              <a
                href={adminQueuesUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-surface-darkInput transition-colors cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                <span>BullMQ Dashboard</span>
              </a>
              <div className="my-1 border-t border-gray-100 dark:border-surface-darkBorder" />
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  logout();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>

        {/* Compose Pill Button */}
        <button
          type="button"
          onClick={onOpenCompose}
          className="w-full py-2.5 px-4 rounded-full border border-brand-500 text-brand-600 dark:text-emerald-400 font-semibold text-sm hover:bg-brand-50 dark:hover:bg-emerald-950/40 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm hover:shadow active:scale-[0.98]"
        >
          <Plus className="w-4 h-4 text-brand-500" />
          <span>Compose</span>
        </button>

        {/* Navigation Section */}
        <nav className="space-y-1">
          <div className="px-3 pb-2 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Core
          </div>

          {/* Scheduled Emails */}
          <button
            type="button"
            onClick={() => onTabChange('scheduled')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'scheduled'
                ? 'bg-surface-activePill dark:bg-emerald-950/50 text-brand-700 dark:text-emerald-300 font-semibold'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-surface-darkInput'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Clock className={`w-4 h-4 ${activeTab === 'scheduled' ? 'text-brand-600' : 'text-gray-400'}`} />
              <span>Scheduled</span>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                activeTab === 'scheduled'
                  ? 'text-brand-700 dark:text-emerald-300'
                  : 'text-gray-400 dark:text-gray-500'
              }`}
            >
              {scheduledCount}
            </span>
          </button>

          {/* Sent Emails */}
          <button
            type="button"
            onClick={() => onTabChange('sent')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'sent'
                ? 'bg-surface-activePill dark:bg-emerald-950/50 text-brand-700 dark:text-emerald-300 font-semibold'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-surface-darkInput'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Send className={`w-4 h-4 ${activeTab === 'sent' ? 'text-brand-600' : 'text-gray-400'}`} />
              <span>Sent</span>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                activeTab === 'sent'
                  ? 'text-brand-700 dark:text-emerald-300'
                  : 'text-gray-400 dark:text-gray-500'
              }`}
            >
              {sentCount}
            </span>
          </button>
        </nav>
      </div>

      {/* Bottom Settings Link */}
      <div className="pt-4 border-t border-gray-100 dark:border-surface-darkBorder">
        <button
          type="button"
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-surface-darkInput transition-colors cursor-pointer"
        >
          <SettingsIcon className="w-4 h-4" />
          <span>Preferences & Slack</span>
        </button>
      </div>
    </aside>
  );
};
