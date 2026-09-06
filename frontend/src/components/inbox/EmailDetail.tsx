import React, { useState } from 'react';
import type { Email } from '../../types/api';
import {
  ArrowLeft,
  Star,
  Archive,
  Trash2,
  ChevronDown,
  Paperclip,
  Download,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface EmailDetailProps {
  email: Email;
  onBack: () => void;
}

export const EmailDetail: React.FC<EmailDetailProps> = ({ email, onBack }) => {
  const [isStarred, setIsStarred] = useState(false);
  const [showRecipientDropdown, setShowRecipientDropdown] = useState(false);

  const formattedDate = (() => {
    try {
      const d = parseISO(email.sentAt || email.scheduledAt || email.createdAt);
      return format(d, 'MMM d, h:mm a');
    } catch {
      return email.scheduledAt;
    }
  })();

  const senderName = email.sender?.name || 'Amanda Clark';
  const senderEmail = email.sender?.email || 'sender@example.com';
  const initial = senderName.charAt(0).toUpperCase();

  // Sample tennis coach mockup attachments matching Figma
  const attachments = [
    {
      id: 'att-1',
      name: 'Tennis_Coach_Profile.png',
      size: '1.2 MB',
      url: 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?auto=format&fit=crop&w=500&q=80',
    },
    {
      id: 'att-2',
      name: 'Tennis_Coach_Profile2.png',
      size: '1.2 MB',
      url: 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?auto=format&fit=crop&w=500&q=80',
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-surface-darkCard overflow-hidden transition-colors">
      {/* Top Action & Navigation Bar */}
      <div className="h-16 px-6 border-b border-gray-100 dark:border-surface-darkBorder flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-full text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-surface-darkInput transition-colors cursor-pointer"
            title="Back to inbox"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white truncate">
            {email.subject || 'Oliver, hello there! | MJWYT44 BM#52W01'}
          </h2>
        </div>

        {/* Right Action Icons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsStarred(!isStarred)}
            className="p-2 rounded-full text-gray-400 hover:text-amber-400 transition-colors cursor-pointer"
            title="Star email"
          >
            <Star className={`w-4 h-4 ${isStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
          </button>

          <button
            type="button"
            className="p-2 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer"
            title="Archive"
          >
            <Archive className="w-4 h-4" />
          </button>

          <button
            type="button"
            className="p-2 rounded-full text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Email Thread Content */}
      <div className="flex-1 overflow-y-auto p-6 md:p-10 max-w-4xl space-y-6">
        {/* Sender Info Row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            {/* Sender Avatar Circle */}
            <div className="w-10 h-10 rounded-full bg-brand-500 text-white font-bold flex items-center justify-center text-sm shadow-sm flex-shrink-0">
              {initial}
            </div>

            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900 dark:text-white text-sm">
                  {senderName}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  &lt;{senderEmail}&gt;
                </span>
              </div>

              {/* To me dropdown */}
              <div className="relative inline-block">
                <button
                  type="button"
                  onClick={() => setShowRecipientDropdown(!showRecipientDropdown)}
                  className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                >
                  <span>to me</span>
                  <ChevronDown className="w-3 h-3" />
                </button>

                {showRecipientDropdown && (
                  <div className="absolute left-0 top-full mt-1 p-3 bg-white dark:bg-surface-darkCard rounded-xl shadow-lg border border-gray-100 dark:border-surface-darkBorder z-20 w-64 text-xs space-y-1 animate-fadeIn">
                    <div className="text-gray-400 text-[11px]">from: {senderEmail}</div>
                    <div className="text-gray-400 text-[11px]">to: {email.recipient}</div>
                    <div className="text-gray-400 text-[11px]">date: {formattedDate}</div>
                    <div className="text-gray-400 text-[11px]">status: {email.status}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 whitespace-nowrap">
            {formattedDate}
          </span>
        </div>

        {/* Email Body Content */}
        <div className="text-gray-800 dark:text-gray-200 text-sm leading-relaxed space-y-5 pt-2">
          {email.body.includes('<') && email.body.includes('>') ? (
            <div
              className="prose dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: email.body }}
            />
          ) : (
            <>
              <p>Hey Oliver,</p>
              <p>You&apos;ve just RECEIVED something</p>

              {/* Highlighted Yellow Callout Banner (Matching Figma mockup) */}
              <div className="p-4 rounded-xl bg-[#FFFDE7] dark:bg-amber-950/40 border-l-4 border-amber-400 text-gray-900 dark:text-amber-100 space-y-1 shadow-xs">
                <div className="font-bold flex items-center gap-1.5 text-xs md:text-sm text-gray-900 dark:text-amber-200">
                  <span>⚡</span>
                  <span>Extremely Exclusive—Only 4 Spots Worldwide Per Year | $25,000 investment</span>
                  <span>⚡</span>
                </div>
                <p className="text-xs text-gray-700 dark:text-amber-300/90 pl-5">
                  To explore securing your private transformation, simply reply right now with{' '}
                  <span className="font-bold">&quot;FLY OUT FIX&quot;</span>.
                </p>
              </div>

              <div className="pt-2 space-y-1">
                <p>Your coach for world-class performance,</p>
                <p className="font-semibold text-gray-900 dark:text-white">Grant</p>
              </div>

              <p className="italic text-xs text-gray-500 dark:text-gray-400 pt-2">
                P.S. Always remember that you can develop world class technique! 🚀
              </p>
            </>
          )}
        </div>

        {/* Attached Media Cards (Matching Figma mockup) */}
        <div className="pt-6 border-t border-gray-100 dark:border-surface-darkBorder">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3">
            <Paperclip className="w-3.5 h-3.5" />
            <span>2 Attachments</span>
          </div>

          <div className="flex flex-wrap gap-4">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="group relative w-48 rounded-xl overflow-hidden border border-gray-200 dark:border-surface-darkBorder bg-gray-50 dark:bg-surface-darkInput hover:shadow-md transition-all cursor-pointer"
              >
                <div className="h-28 overflow-hidden bg-gray-200 dark:bg-gray-800">
                  <img
                    src={att.url}
                    alt={att.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="p-2.5 flex items-center justify-between">
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                      {att.name}
                    </div>
                    <div className="text-[10px] text-gray-400">{att.size}</div>
                  </div>
                  <Download className="w-3.5 h-3.5 text-gray-400 group-hover:text-brand-500 transition-colors flex-shrink-0" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
