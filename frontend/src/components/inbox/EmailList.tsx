import React from 'react';
import type { Email } from '../../types/api';
import { Clock, Star, Mail, AlertTriangle, ArrowRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface EmailListProps {
  type: 'scheduled' | 'sent';
  emails: Email[];
  loading: boolean;
  onSelectEmail: (email: Email) => void;
  onComposeClick: () => void;
  starredIds: Set<string>;
  onToggleStar: (id: string) => void;
  isFilterActive?: boolean;
}

export const EmailList: React.FC<EmailListProps> = ({
  type,
  emails,
  loading,
  onSelectEmail,
  onComposeClick,
  starredIds,
  onToggleStar,
  isFilterActive = false,
}) => {
  const formatScheduledBadge = (dateStr: string) => {
    try {
      const d = parseISO(dateStr);
      return format(d, 'EEE h:mm:ss a');
    } catch {
      return dateStr;
    }
  };

  const cleanBodySnippet = (htmlOrText: string) => {
    const stripped = htmlOrText.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
    return stripped.length > 90 ? `${stripped.slice(0, 90)}...` : stripped;
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 py-3 px-4 rounded-xl animate-pulse bg-gray-50/70 dark:bg-surface-darkInput/40"
          >
            <div className="w-32 h-4 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="w-28 h-5 bg-gray-200 dark:bg-gray-700 rounded-full" />
            <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (emails.length === 0) {
    if (isFilterActive) {
      return (
        <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 select-none animate-fadeIn">
          <div className="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center text-amber-500 mb-4 border border-amber-100 dark:border-amber-800/30">
            <Star className="w-7 h-7 fill-amber-400 text-amber-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">
            No starred emails found
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mb-6">
            Click the star icon next to any email in your {type === 'scheduled' ? 'scheduled' : 'sent'} inbox to bookmark it here for quick access.
          </p>
        </div>
      );
    }

    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 select-none">
        <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-brand-500 mb-4 border border-emerald-100 dark:border-emerald-800/30">
          <Mail className="w-7 h-7" />
        </div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">
          {type === 'scheduled' ? 'No scheduled emails' : 'No sent emails yet'}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mb-6">
          {type === 'scheduled'
            ? 'When you schedule outreach emails or lead campaigns, they will queue here with live delivery countdowns.'
            : 'Sent messages dispatched via Ethereal SMTP will be tracked and archived here.'}
        </p>
        <button
          type="button"
          onClick={onComposeClick}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer active:scale-95"
        >
          <span>Compose New Email</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-surface-darkBorder">
      {emails.map((email) => {
        const isStarred = starredIds.has(email.id);
        const snippet = cleanBodySnippet(email.body);

        return (
          <div
            key={email.id}
            onClick={() => onSelectEmail(email)}
            className="group flex items-center gap-3 md:gap-4 py-3.5 px-6 hover:bg-gray-50/80 dark:hover:bg-surface-darkInput/50 transition-colors cursor-pointer"
          >
            {/* Recipient Column */}
            <div className="w-36 md:w-44 flex-shrink-0">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate block">
                To: {email.recipient}
              </span>
            </div>

            {/* Status / Scheduled Badge */}
            <div className="flex-shrink-0">
              {type === 'scheduled' ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#FFF0E6] text-[#D97706] dark:bg-amber-950/40 dark:text-amber-400 border border-orange-200/70 dark:border-amber-800/40 shadow-xs">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{formatScheduledBadge(email.scheduledAt)}</span>
                </div>
              ) : email.status === 'SENT' ? (
                <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#F1F5F9] text-[#64748B] dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-xs">
                  <span>Sent</span>
                </div>
              ) : (
                <div
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900 shadow-xs"
                  title={email.errorMessage || 'Failed to send'}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>Failed</span>
                </div>
              )}
            </div>

            {/* Subject and Preview snippet */}
            <div className="flex-1 min-w-0 flex items-baseline gap-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate flex-shrink-0">
                {email.subject || '(No Subject)'}
              </span>
              <span className="text-gray-400 text-xs">-</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate font-normal">
                {snippet}
              </span>
            </div>

            {/* Star action */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleStar(email.id);
              }}
              className="p-1.5 text-gray-300 hover:text-amber-400 dark:text-gray-600 dark:hover:text-amber-400 transition-colors flex-shrink-0 cursor-pointer"
              title={isStarred ? 'Unstar' : 'Star'}
            >
              <Star className={`w-4 h-4 ${isStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

