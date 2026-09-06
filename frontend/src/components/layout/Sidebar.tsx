import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import type { ActiveTab, SlackStatus } from '../../types/api';
import {
  Clock,
  Send,
  ChevronDown,
  Settings as SettingsIcon,
  LogOut,
  Plus,
} from 'lucide-react';

interface SidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  scheduledCount: number;
  sentCount: number;
  onOpenPreferences: () => void;
  onOpenCompose: () => void;
}

// Slack Brand Icon SVG
const SlackIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.528 2.528 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"
      fill="#E01E5A"
    />
  </svg>
);

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  scheduledCount,
  sentCount,
  onOpenPreferences,
  onOpenCompose,
}) => {
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [slackStatus, setSlackStatus] = useState<SlackStatus | null>(null);
  const [avatarError, setAvatarError] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.slack.getStatus().then(setSlackStatus).catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full flex items-center justify-between p-2 rounded-2xl bg-surface-pill dark:bg-surface-darkInput hover:bg-gray-200/70 dark:hover:bg-surface-darkInput/80 transition-all cursor-pointer border border-transparent dark:border-surface-darkBorder"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {user?.avatar && !avatarError ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  onError={() => setAvatarError(true)}
                  className="w-8 h-8 rounded-full object-cover border border-gray-300 dark:border-gray-600 flex-shrink-0 shadow-xs"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-emerald-600 dark:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center flex-shrink-0 shadow-xs">
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


          {/* User Dropdown Menu - ONLY Slack Connect & Sign Out */}
          {dropdownOpen && (
            <div
              className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-surface-darkCard rounded-2xl shadow-xl border border-gray-100 dark:border-surface-darkBorder py-1.5 z-40 animate-fadeIn"
              onMouseLeave={() => setDropdownOpen(false)}
            >
              {/* Slack connect option */}
              {slackStatus?.connected ? (
                <div className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-surface-darkInput transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <SlackIcon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate font-medium">Slack connected</span>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" title="Connected" />
                </div>
              ) : (
                <a
                  href={api.slack.getConnectUrl()}
                  className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-surface-darkInput transition-colors cursor-pointer"
                  onClick={() => setDropdownOpen(false)}
                >
                  <SlackIcon className="w-4 h-4 flex-shrink-0" />
                  <span className="font-medium">Connect Slack</span>
                </a>
              )}

              <div className="my-1 border-t border-gray-100 dark:border-surface-darkBorder" />

              {/* Sign Out Option */}
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  logout();
                }}
                className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer font-medium"
              >
                <LogOut className="w-4 h-4 flex-shrink-0" />
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

      {/* Bottom Preferences Link - ONLY ONCE HERE */}
      <div className="pt-4 border-t border-gray-100 dark:border-surface-darkBorder">
        <button
          type="button"
          onClick={() => {
            setDropdownOpen(false);
            onOpenPreferences();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-surface-darkInput transition-colors cursor-pointer font-medium"
        >
          <SettingsIcon className="w-4 h-4" />
          <span>Preferences</span>
        </button>
      </div>
    </aside>
  );
};

