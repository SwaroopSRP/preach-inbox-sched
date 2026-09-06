import React, { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import type { SlackStatus, Sender } from '../../types/api';
import {
  X,
  Sun,
  Moon,
  Laptop,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Plus,
  LogOut,
  User as UserIcon,
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendersUpdated?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSendersUpdated,
}) => {
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();

  const [slackStatus, setSlackStatus] = useState<SlackStatus | null>(null);
  const [slackLoading, setSlackLoading] = useState(false);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [newSenderName, setNewSenderName] = useState('');
  const [newSenderEmail, setNewSenderEmail] = useState('');
  const [senderSubmitting, setSenderSubmitting] = useState(false);
  const [senderError, setSenderError] = useState<string | null>(null);

  const fetchSlackStatus = async () => {
    try {
      setSlackLoading(true);
      const status = await api.slack.getStatus();
      setSlackStatus(status);
    } catch (err) {
      console.error('Failed to load Slack status:', err);
    } finally {
      setSlackLoading(false);
    }
  };

  const fetchSenders = async () => {
    try {
      const data = await api.senders.list();
      setSenders(data);
    } catch (err) {
      console.error('Failed to load senders:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSlackStatus();
      fetchSenders();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDisconnectSlack = async () => {
    try {
      setSlackLoading(true);
      await api.slack.disconnect();
      await fetchSlackStatus();
    } catch (err) {
      console.error('Disconnect failed:', err);
    } finally {
      setSlackLoading(false);
    }
  };

  const handleAddSender = async (e: React.FormEvent) => {
    e.preventDefault();
    setSenderError(null);
    if (!newSenderName.trim() || !newSenderEmail.trim()) return;

    try {
      setSenderSubmitting(true);
      await api.senders.create(newSenderName.trim(), newSenderEmail.trim());
      setNewSenderName('');
      setNewSenderEmail('');
      await fetchSenders();
      if (onSendersUpdated) onSendersUpdated();
    } catch (err: any) {
      setSenderError(err.response?.data?.message || 'Failed to add sender identity');
    } finally {
      setSenderSubmitting(false);
    }
  };

  const handleLogout = async () => {
    onClose();
    await logout();
  };

  const adminQueuesUrl = `${import.meta.env.VITE_API_URL || ''}/admin/queues`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-surface-darkCard w-full max-w-xl rounded-2xl shadow-xl border border-gray-100 dark:border-surface-darkBorder overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-surface-darkBorder flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Settings & Preferences</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-surface-darkInput transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* User Information */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-surface-darkInput border border-gray-100 dark:border-surface-darkBorder">
            {user?.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-12 h-12 rounded-full object-cover border border-gray-200" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-brand-50 dark:bg-emerald-950 flex items-center justify-center text-brand-600 font-bold text-lg">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">{user?.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</div>
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors flex items-center gap-1.5 border border-red-200 dark:border-red-900/40 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>

          {/* Theme Selection */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
              Appearance Theme
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                  theme === 'light'
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-emerald-950 dark:text-emerald-200'
                    : 'border-gray-200 dark:border-surface-darkBorder text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-surface-darkInput'
                }`}
              >
                <Sun className="w-4 h-4" />
                <span>Light</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                  theme === 'dark'
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-emerald-950 dark:text-emerald-200'
                    : 'border-gray-200 dark:border-surface-darkBorder text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-surface-darkInput'
                }`}
              >
                <Moon className="w-4 h-4" />
                <span>Dark</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('system')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                  theme === 'system'
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-emerald-950 dark:text-emerald-200'
                    : 'border-gray-200 dark:border-surface-darkBorder text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-surface-darkInput'
                }`}
              >
                <Laptop className="w-4 h-4" />
                <span>System</span>
              </button>
            </div>
          </div>

          {/* Slack Alert Integration */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Slack Rate-Limit Alerts
              </label>
              <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-medium px-2 py-0.5 rounded-full">
                Required Integration
              </span>
            </div>
            <div className="p-4 rounded-xl border border-gray-200 dark:border-surface-darkBorder bg-gray-50/50 dark:bg-surface-darkInput/50 space-y-3">
              <p className="text-xs text-gray-600 dark:text-gray-300">
                Dispatches real-time notifications to your Slack workspace the instant a sender hits their hourly quota cap.
              </p>

              {slackLoading ? (
                <div className="text-xs text-gray-400 py-2">Checking Slack connection status...</div>
              ) : slackStatus?.connected ? (
                <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-brand-500 flex-shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-gray-900 dark:text-white">
                        Connected to {slackStatus.teamName || 'Slack Workspace'}
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400">
                        Alert channel: {slackStatus.channelName || '#email-alerts'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDisconnectSlack}
                    className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 font-medium px-2.5 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-surface-darkCard border border-gray-200 dark:border-surface-darkBorder">
                  <div className="flex items-center gap-2.5">
                    <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                    <span className="text-xs text-gray-700 dark:text-gray-300">Slack not connected</span>
                  </div>
                  <a
                    href={api.slack.getConnectUrl()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors shadow-sm cursor-pointer"
                  >
                    <span>Connect Slack</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Senders Identity Management */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
              Verified Sender Identities
            </label>
            <div className="space-y-2 mb-3 max-h-36 overflow-y-auto">
              {senders.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-surface-darkInput text-xs border border-gray-100 dark:border-surface-darkBorder"
                >
                  <div className="flex items-center gap-2">
                    <UserIcon className="w-3.5 h-3.5 text-gray-400" />
                    <span className="font-medium text-gray-800 dark:text-gray-200">{s.name}</span>
                    <span className="text-gray-500 dark:text-gray-400">&lt;{s.email}&gt;</span>
                  </div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full font-medium">
                    Active
                  </span>
                </div>
              ))}
            </div>

            {/* Add Sender Form */}
            <form onSubmit={handleAddSender} className="space-y-2">
              {senderError && (
                <div className="text-[11px] text-red-500 dark:text-red-400">{senderError}</div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Sender Name (e.g. Sales Team)"
                  value={newSenderName}
                  onChange={(e) => setNewSenderName(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-surface-input dark:bg-surface-darkInput border border-gray-200 dark:border-surface-darkBorder text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <input
                  type="email"
                  placeholder="Sender Email"
                  value={newSenderEmail}
                  onChange={(e) => setNewSenderEmail(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-surface-input dark:bg-surface-darkInput border border-gray-200 dark:border-surface-darkBorder text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <button
                  type="submit"
                  disabled={senderSubmitting}
                  className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>
            </form>
          </div>

          {/* Admin Queue Dashboard Link */}
          <div className="pt-2 border-t border-gray-100 dark:border-surface-darkBorder flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">BullMQ Live Queue Monitor</span>
            <a
              href={adminQueuesUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-brand-600 dark:text-emerald-400 font-medium hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Open Bull Board (/admin/queues)</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
