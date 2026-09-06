import React, { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { api } from '../../services/api';
import type { SlackStatus, Sender } from '../../types/api';
import {
  X,
  Sun,
  Moon,
  Laptop,
  CheckCircle2,
  ExternalLink,
  Activity,
  Loader2,
} from 'lucide-react';

interface PreferencesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSendersUpdated?: () => void;
}

// Slack Logo SVG
const SlackIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.528 2.528 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"
      fill="currentColor"
    />
  </svg>
);

export const PreferencesDrawer: React.FC<PreferencesDrawerProps> = ({
  isOpen,
  onClose,
  onSendersUpdated,
}) => {
  const { theme, setTheme } = useTheme();

  const [slackStatus, setSlackStatus] = useState<SlackStatus | null>(null);
  const [slackLoading, setSlackLoading] = useState(false);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [newSenderName, setNewSenderName] = useState('');
  const [senderCreating, setSenderCreating] = useState(false);
  const [senderDeletingId, setSenderDeletingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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

  const handleCreateEtherealSender = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      setSenderCreating(true);
      await api.senders.createEthereal(newSenderName.trim() || undefined);
      setNewSenderName('');
      await fetchSenders();
      if (onSendersUpdated) onSendersUpdated();
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Failed to generate Ethereal test sender');
    } finally {
      setSenderCreating(false);
    }
  };

  const handleDeleteSender = async (senderId: string) => {
    setErrorMessage(null);
    try {
      setSenderDeletingId(senderId);
      await api.senders.delete(senderId);
      await fetchSenders();
      if (onSendersUpdated) onSendersUpdated();
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Failed to delete sender');
    } finally {
      setSenderDeletingId(null);
    }
  };

  const adminQueuesUrl = `${import.meta.env.VITE_API_URL || ''}/admin/queues`;

  return (
    <div
      className={`fixed inset-0 z-50 transition-visibility duration-300 ${
        isOpen ? 'visible' : 'invisible pointer-events-none'
      }`}
    >
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Slide-In Side Panel from Right */}
      <aside
        className={`fixed top-0 right-0 bottom-0 w-full sm:w-[480px] md:w-[540px] bg-white dark:bg-surface-darkCard shadow-2xl z-50 flex flex-col border-l border-gray-100 dark:border-surface-darkBorder transition-transform duration-300 ease-out transform ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Panel Header */}
        <div className="h-16 px-6 border-b border-gray-100 dark:border-surface-darkBorder flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white font-sans">
            Preferences
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-surface-darkInput transition-colors cursor-pointer"
            title="Close preferences"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Panel Body */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-xs text-red-600 dark:text-red-400 animate-fadeIn">
              {errorMessage}
            </div>
          )}

          {/* 1. Slack Notifications Section */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-2">
              <SlackIcon className="w-4 h-4 text-gray-800 dark:text-gray-200 flex-shrink-0" />
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Slack Notifications
              </h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Get notified in Slack when an email sender hits its hourly rate limit. Affected emails are automatically rescheduled.
            </p>

            {slackLoading ? (
              <div className="py-2 text-xs text-gray-400 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Checking Slack connection...</span>
              </div>
            ) : slackStatus?.connected ? (
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40">
                <div className="flex items-center gap-2.5 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                      Connected to {slackStatus.teamName || 'Slack Workspace'}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                      Channel: {slackStatus.channelName || '#email-alerts'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDisconnectSlack}
                  className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 font-medium px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer flex-shrink-0"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div>
                <a
                  href={api.slack.getConnectUrl()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#4A154B] hover:bg-[#3f1240] text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
                >
                  <SlackIcon className="w-3.5 h-3.5" />
                  <span>Connect with Slack</span>
                </a>
              </div>
            )}
          </section>

          {/* 2. Queue Monitor Section */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-pink-500 flex-shrink-0" />
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Queue Monitor
              </h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Live BullMQ dashboard — inspect active, delayed, completed, and failed jobs in real time.
            </p>
            <div>
              <a
                href={adminQueuesUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-surface-darkBorder bg-white dark:bg-surface-darkInput text-xs font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-surface-darkBorder/40 transition-colors shadow-xs cursor-pointer"
              >
                <span>Open BullMQ Dashboard</span>
                <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
              </a>
            </div>
          </section>

          {/* 3. Email Senders Section (Ethereal test sender creation) */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">
                Email Senders
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Create an Ethereal test sender — a free sandbox SMTP account. Emails are captured for inspection at ethereal.email.
              </p>
            </div>

            {/* Create Sender Form */}
            <form onSubmit={handleCreateEtherealSender} className="flex gap-2.5 items-center">
              <input
                type="text"
                placeholder="Display name (optional)"
                value={newSenderName}
                onChange={(e) => setNewSenderName(e.target.value)}
                disabled={senderCreating}
                className="flex-1 px-3.5 py-2 text-xs rounded-xl bg-surface-input dark:bg-surface-darkInput border border-gray-200 dark:border-surface-darkBorder text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
              />
              <button
                type="submit"
                disabled={senderCreating}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-all shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {senderCreating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <span>Create Sender</span>
                )}
              </button>
            </form>

            {/* Senders List matching screenshot */}
            <div className="space-y-2 pt-1">
              {senders.length === 0 ? (
                <div className="p-4 rounded-xl bg-gray-50 dark:bg-surface-darkInput/40 text-center text-xs text-gray-400">
                  No email senders created yet. Click Create Sender above to provision an Ethereal SMTP test account.
                </div>
              ) : (
                senders.map((s) => {
                  const isDeleting = senderDeletingId === s.id;
                  const initial = (s.name || s.email).charAt(0).toUpperCase();

                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-gray-50/70 dark:bg-surface-darkInput/50 border border-gray-100 dark:border-surface-darkBorder transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        {/* Avatar Initial Circle */}
                        <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center justify-center flex-shrink-0">
                          {initial}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                            {s.name || 'Test Sender'}
                          </div>
                          <div className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                            {s.email}
                          </div>
                        </div>
                      </div>

                      {/* Right Action Links */}
                      <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                        <a
                          href="https://ethereal.email/messages"
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-600 hover:text-brand-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium flex items-center gap-0.5 cursor-pointer"
                        >
                          <span>View inbox</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>

                        <button
                          type="button"
                          onClick={() => handleDeleteSender(s.id)}
                          disabled={isDeleting}
                          className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {isDeleting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-red-500" />
                          ) : (
                            <span>Delete</span>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* 4. Appearance Theme Section */}
          <section className="pt-4 border-t border-gray-100 dark:border-surface-darkBorder space-y-2.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Appearance Theme
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                  theme === 'light'
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-emerald-950 dark:text-emerald-200'
                    : 'border-gray-200 dark:border-surface-darkBorder text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-surface-darkInput'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Light</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                  theme === 'dark'
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-emerald-950 dark:text-emerald-200'
                    : 'border-gray-200 dark:border-surface-darkBorder text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-surface-darkInput'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>Dark</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('system')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                  theme === 'system'
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-emerald-950 dark:text-emerald-200'
                    : 'border-gray-200 dark:border-surface-darkBorder text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-surface-darkInput'
                }`}
              >
                <Laptop className="w-3.5 h-3.5" />
                <span>System</span>
              </button>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
};
