import React, { useState } from 'react';
import type { Email } from '../../types/api';
import {
  ArrowLeft,
  Star,
  Archive,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface EmailDetailProps {
  email: Email;
  onBack: () => void;
  isStarred?: boolean;
  onToggleStar?: () => void;
}

export const EmailDetail: React.FC<EmailDetailProps> = ({
  email,
  onBack,
  isStarred = false,
  onToggleStar,
}) => {
  const [localStarred, setLocalStarred] = useState(isStarred);

  const handleStarClick = () => {
    setLocalStarred(!localStarred);
    if (onToggleStar) {
      onToggleStar();
    }
  };

  const formattedDate = (() => {
    try {
      const dateStr = email.sentAt || email.scheduledAt || email.createdAt;
      const d = parseISO(dateStr);
      return format(d, 'MMM d, yyyy, h:mm a');
    } catch {
      return email.scheduledAt || email.createdAt;
    }
  })();

  const senderName = email.sender?.name || email.sender?.email?.split('@')[0] || 'Sender';
  const senderEmail = email.sender?.email || 'noreply@reachinbox.ai';
  const initial = (senderName || 'S').charAt(0).toUpperCase();

  const isHtml = email.body.includes('<') && email.body.includes('>');

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-surface-darkCard overflow-hidden transition-colors">
      {/* Top Action & Navigation Bar */}
      <div className="h-16 px-6 border-b border-gray-100 dark:border-surface-darkBorder flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-full text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-surface-darkInput transition-colors cursor-pointer"
            title="Back to inbox"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base md:text-lg font-bold text-gray-900 dark:text-white truncate">
            {email.subject || '(No Subject)'}
          </h2>
        </div>

        {/* Right Action Icons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleStarClick}
            className="p-2 rounded-full text-gray-400 hover:text-amber-400 transition-colors cursor-pointer"
            title={localStarred ? 'Unstar email' : 'Star email'}
          >
            <Star className={`w-4 h-4 ${localStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
          </button>

          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer"
            title="Back"
          >
            <Archive className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Email Thread Content */}
      <div className="flex-1 overflow-y-auto p-6 md:p-10 max-w-4xl space-y-6">
        {/* Sender & Recipient Info Row */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-gray-100 dark:border-surface-darkBorder">
          <div className="flex items-start gap-3.5 min-w-0">
            {/* Sender Avatar Circle */}
            <div className="w-10 h-10 rounded-full bg-emerald-600 dark:bg-emerald-700 text-white font-bold flex items-center justify-center text-sm shadow-xs flex-shrink-0">
              {initial}
            </div>

            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-gray-900 dark:text-white text-sm">
                  {senderName}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  &lt;{senderEmail}&gt;
                </span>
              </div>

              {/* To recipient & status badge */}
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span>to</span>
                <span className="font-medium text-gray-800 dark:text-gray-200 truncate">
                  {email.recipient}
                </span>

                {/* Status indicator */}
                {email.status === 'SENT' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Delivered</span>
                  </span>
                ) : email.status === 'SCHEDULED' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40">
                    <Clock className="w-3 h-3" />
                    <span>Scheduled</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-200/60 dark:border-red-800/40">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Failed</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 whitespace-nowrap">
            {formattedDate}
          </span>
        </div>

        {/* Email Body Content - Render real content! */}
        <div className="text-gray-800 dark:text-gray-200 text-sm leading-relaxed min-h-[160px]">
          {isHtml ? (
            <div
              className="prose dark:prose-invert max-w-none break-words"
              dangerouslySetInnerHTML={{ __html: email.body }}
            />
          ) : (
            <div className="whitespace-pre-wrap break-words font-sans space-y-3">
              {email.body}
            </div>
          )}
        </div>

        {/* Error message if failed */}
        {email.errorMessage && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
            <span className="font-semibold">Delivery note:</span> {email.errorMessage}
          </div>
        )}
      </div>
    </div>
  );
};
