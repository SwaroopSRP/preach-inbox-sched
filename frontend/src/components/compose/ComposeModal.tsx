import React, { useState, useEffect, useRef } from 'react';
import type { Sender, ScheduleEmailPayload } from '../../types/api';
import { api } from '../../services/api';
import {
  ArrowLeft,
  Paperclip,
  Clock,
  Upload,
  ChevronDown,
  Calendar,
  X,
  Undo,
  Redo,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Strikethrough,
  Check,
  AlertCircle,
} from 'lucide-react';
import { addDays, setHours, setMinutes, setSeconds, format } from 'date-fns';

interface ComposeModalProps {
  onBack: () => void;
  onEmailScheduled: () => void;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({ onBack, onEmailScheduled }) => {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [selectedSenderId, setSelectedSenderId] = useState<string>('');
  const [showSenderDropdown, setShowSenderDropdown] = useState(false);

  // Recipients
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState('');
  const [showAllRecipients, setShowAllRecipients] = useState(false);

  // Subject & Body
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // Throttling Controls
  const [delaySeconds, setDelaySeconds] = useState<number>(2);
  const [hourlyLimit, setHourlyLimit] = useState<number>(200);

  // Scheduling ("Send Later")
  const [scheduledDate, setScheduledDate] = useState<string | null>(null);
  const [showSendLaterModal, setShowSendLaterModal] = useState(false);
  const [tempScheduledInput, setTempScheduledInput] = useState('');

  // Attachments
  const [attachments, setAttachments] = useState<
    Array<{ id: string; name: string; url: string; size: string }>
  >([
    {
      id: 'att-1',
      name: 'Tennis_Coach_Profile.png',
      size: '1.2 MB',
      url: 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?auto=format&fit=crop&w=500&q=80',
    },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  // Load verified senders on mount
  useEffect(() => {
    const loadSenders = async () => {
      try {
        const list = await api.senders.list();
        setSenders(list);
        if (list.length > 0) {
          setSelectedSenderId(list[0].id);
        }
      } catch (err) {
        console.error('Failed to load senders:', err);
      }
    };
    loadSenders();
  }, []);

  const activeSender = senders.find((s) => s.id === selectedSenderId);

  // Add individual recipient
  const handleAddRecipient = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const email = recipientInput.trim().toLowerCase();
      if (email && email.includes('@') && !recipients.includes(email)) {
        setRecipients([...recipients, email]);
        setRecipientInput('');
      }
    }
  };

  const removeRecipient = (indexToRemove: number) => {
    setRecipients(recipients.filter((_, i) => i !== indexToRemove));
  };

  // CSV Lead List Parsing (Mockup 6 & 7)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      // Extract all valid emails from CSV/text file via Regex
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const matches = text.match(emailRegex) || [];
      const uniqueEmails = Array.from(new Set(matches.map((m) => m.toLowerCase())));

      if (uniqueEmails.length > 0) {
        const merged = Array.from(new Set([...recipients, ...uniqueEmails]));
        setRecipients(merged);
        setFeedbackMessage(`Detected ${uniqueEmails.length} valid email address(es) from ${file.name}`);
        setTimeout(() => setFeedbackMessage(null), 4000);
      } else {
        setError('No valid email addresses found in the uploaded file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Attach additional image / file
  const handleAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const newAtt = {
      id: `att-${Date.now()}`,
      name: file.name,
      size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      url: URL.createObjectURL(file),
    };
    setAttachments([...attachments, newAtt]);
    e.target.value = '';
  };

  // Quick Preset Handlers for Send Later
  const setQuickPreset = (preset: 'tomorrow' | '10am' | '11am' | '3pm') => {
    const tomorrow = addDays(new Date(), 1);
    let target: Date;

    switch (preset) {
      case '10am':
        target = setSeconds(setMinutes(setHours(tomorrow, 10), 0), 0);
        break;
      case '11am':
        target = setSeconds(setMinutes(setHours(tomorrow, 11), 0), 0);
        break;
      case '3pm':
        target = setSeconds(setMinutes(setHours(tomorrow, 15), 0), 0);
        break;
      case 'tomorrow':
      default:
        target = setSeconds(setMinutes(setHours(tomorrow, 9), 0), 0);
        break;
    }

    setTempScheduledInput(format(target, "yyyy-MM-dd'T'HH:mm"));
  };

  const handleApplySendLater = () => {
    if (tempScheduledInput) {
      setScheduledDate(new Date(tempScheduledInput).toISOString());
    }
    setShowSendLaterModal(false);
  };

  const handleCancelSendLater = () => {
    setShowSendLaterModal(false);
  };

  // Submit / Dispatch Email Scheduling
  const handleSubmit = async () => {
    setError(null);

    // If typing in recipient box without pressing enter, add it
    let finalRecipients = [...recipients];
    if (recipientInput.trim() && recipientInput.includes('@')) {
      finalRecipients.push(recipientInput.trim().toLowerCase());
    }

    if (!selectedSenderId) {
      setError('Please select a sender identity');
      return;
    }

    if (finalRecipients.length === 0) {
      setError('Please provide at least one recipient email');
      return;
    }

    if (!subject.trim()) {
      setError('Please enter an email subject');
      return;
    }

    if (!body.trim()) {
      setError('Please enter an email body');
      return;
    }

    setLoading(true);

    try {
      const scheduledTime = scheduledDate || new Date(Date.now() + 5000).toISOString();

      const payload: ScheduleEmailPayload = {
        senderId: selectedSenderId,
        recipients: finalRecipients,
        subject: subject.trim(),
        body: body.trim(),
        scheduledAt: scheduledTime,
        delayMs: Math.max(2000, delaySeconds * 1000),
        hourlyLimit: hourlyLimit > 0 ? hourlyLimit : 200,
      };

      await api.emails.schedule(payload);
      onEmailScheduled();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to schedule email');
      setLoading(false);
    }
  };

  const visibleRecipients = showAllRecipients ? recipients : recipients.slice(0, 3);
  const remainingRecipientsCount = recipients.length - 3;

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-surface-darkCard transition-colors relative overflow-hidden">
      {/* Top Header / Action Bar */}
      <div className="h-16 px-6 border-b border-gray-100 dark:border-surface-darkBorder flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-full text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-surface-darkInput transition-colors cursor-pointer"
            title="Back to inbox"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Compose New Email
          </h2>
        </div>

        {/* Right Action Icons & Primary Button */}
        <div className="flex items-center gap-3">
          {/* Attachment Paperclip */}
          <button
            type="button"
            onClick={() => attachmentInputRef.current?.click()}
            className="relative p-2 rounded-full text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-surface-darkInput transition-colors cursor-pointer"
            title="Attach file"
          >
            <Paperclip className="w-5 h-5" />
            {attachments.length > 0 && (
              <span className="absolute top-1 right-1 text-[10px] font-bold text-white bg-brand-500 rounded-full w-4 h-4 flex items-center justify-center">
                {attachments.length}
              </span>
            )}
          </button>
          <input
            type="file"
            ref={attachmentInputRef}
            onChange={handleAttachmentUpload}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx"
          />

          {/* Schedule / Clock Button */}
          <button
            type="button"
            onClick={() => {
              if (!tempScheduledInput) {
                setQuickPreset('tomorrow');
              }
              setShowSendLaterModal(true);
            }}
            className={`p-2 rounded-full transition-colors cursor-pointer ${
              scheduledDate
                ? 'text-brand-600 bg-brand-50 dark:bg-emerald-950/60'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-surface-darkInput'
            }`}
            title="Send later"
          >
            <Clock className="w-5 h-5" />
          </button>

          {/* Primary Action Button (Send / Send Later) */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="py-1.5 px-6 rounded-full border border-brand-500 text-brand-600 dark:text-emerald-400 hover:bg-brand-50 dark:hover:bg-emerald-950/40 font-semibold text-sm transition-all shadow-xs active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Submitting...' : scheduledDate ? 'Send Later' : 'Send'}
          </button>
        </div>
      </div>

      {/* Main Compose Scrollable Canvas */}
      <div className="flex-1 overflow-y-auto p-6 md:p-10 max-w-4xl space-y-4">
        {/* Alerts & Feedback */}
        {error && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-xs flex items-center gap-2 border border-red-200 dark:border-red-900/40">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {feedbackMessage && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-brand-700 dark:text-emerald-300 text-xs flex items-center gap-2 border border-emerald-200 dark:border-emerald-800/40">
            <Check className="w-4 h-4 flex-shrink-0" />
            <span>{feedbackMessage}</span>
          </div>
        )}

        {/* FROM Field */}
        <div className="flex items-center py-2 border-b border-gray-100 dark:border-surface-darkBorder">
          <span className="w-20 text-xs font-medium text-gray-400 dark:text-gray-500">From</span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSenderDropdown(!showSenderDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-pill dark:bg-surface-darkInput text-xs text-gray-800 dark:text-gray-200 font-medium hover:bg-gray-200/70 transition-colors cursor-pointer border border-transparent dark:border-surface-darkBorder"
            >
              <span>{activeSender ? activeSender.email : 'Select Sender'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
            </button>

            {showSenderDropdown && (
              <div
                className="absolute left-0 top-full mt-1 w-64 bg-white dark:bg-surface-darkCard rounded-xl shadow-lg border border-gray-100 dark:border-surface-darkBorder z-20 py-1"
                onMouseLeave={() => setShowSenderDropdown(false)}
              >
                {senders.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSelectedSenderId(s.id);
                      setShowSenderDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-surface-darkInput flex items-center justify-between"
                  >
                    <span className="truncate">{s.email}</span>
                    {s.id === selectedSenderId && <Check className="w-3.5 h-3.5 text-brand-500" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* TO Field with Upload List (Matching Figma mockups 5, 6, 7) */}
        <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-surface-darkBorder">
          <div className="flex items-center flex-1 min-w-0 pr-4">
            <span className="w-20 text-xs font-medium text-gray-400 dark:text-gray-500 flex-shrink-0">
              To
            </span>

            {/* Recipient Pills */}
            <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
              {visibleRecipients.map((rec, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/60 text-brand-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
                >
                  <span>{rec}</span>
                  <button
                    type="button"
                    onClick={() => removeRecipient(index)}
                    className="hover:text-red-500 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}

              {/* +N Badge Counter */}
              {remainingRecipientsCount > 0 && !showAllRecipients && (
                <button
                  type="button"
                  onClick={() => setShowAllRecipients(true)}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-brand-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 cursor-pointer"
                  title="Show all recipients"
                >
                  +{remainingRecipientsCount}
                </button>
              )}

              {/* Input for typing email */}
              <input
                type="email"
                placeholder={recipients.length === 0 ? 'recipient@example.com' : 'Add another...'}
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                onKeyDown={handleAddRecipient}
                className="flex-1 min-w-[140px] text-xs text-gray-800 dark:text-gray-100 placeholder-gray-400 bg-transparent focus:outline-none py-1"
              />
            </div>
          </div>

          {/* "Upload List" CSV/Text Lead Importer */}
          <div className="flex-shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs font-medium text-brand-600 dark:text-emerald-400 hover:text-brand-700 dark:hover:text-emerald-300 transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Upload List</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept=".csv,.txt"
            />
          </div>
        </div>

        {/* SUBJECT Field */}
        <div className="flex items-center py-2 border-b border-gray-100 dark:border-surface-darkBorder">
          <span className="w-20 text-xs font-medium text-gray-400 dark:text-gray-500 flex-shrink-0">
            Subject
          </span>
          <input
            type="text"
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="flex-1 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 bg-transparent focus:outline-none py-1"
          />
        </div>

        {/* Delay & Hourly Limit Controls (Matching Figma) */}
        <div className="flex flex-wrap items-center gap-8 py-2 border-b border-gray-100 dark:border-surface-darkBorder text-xs text-gray-700 dark:text-gray-300">
          <div className="flex items-center gap-3">
            <span className="font-medium text-gray-500 dark:text-gray-400">Delay between 2 emails</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="2"
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(Math.max(2, parseInt(e.target.value) || 2))}
                className="w-16 px-2.5 py-1 text-center rounded-lg bg-surface-pill dark:bg-surface-darkInput border border-gray-200 dark:border-surface-darkBorder text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <span className="text-gray-400 text-[11px]">sec (min 2)</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-medium text-gray-500 dark:text-gray-400">Hourly Limit</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(Math.max(1, parseInt(e.target.value) || 200))}
                className="w-16 px-2.5 py-1 text-center rounded-lg bg-surface-pill dark:bg-surface-darkInput border border-gray-200 dark:border-surface-darkBorder text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <span className="text-gray-400 text-[11px]">emails/hr</span>
            </div>
          </div>
        </div>

        {/* Rich Text Editor Container */}
        <div className="pt-2">
          {/* Editor Toolbar (Matching Figma Mockup Icons) */}
          <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-gray-50 dark:bg-surface-darkInput border border-gray-100 dark:border-surface-darkBorder mb-3 text-gray-500 dark:text-gray-400">
            <button
              type="button"
              className="p-1.5 hover:text-gray-800 dark:hover:text-white rounded hover:bg-gray-200/60 dark:hover:bg-gray-700/50 cursor-pointer"
              title="Undo"
            >
              <Undo className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1.5 hover:text-gray-800 dark:hover:text-white rounded hover:bg-gray-200/60 dark:hover:bg-gray-700/50 cursor-pointer"
              title="Redo"
            >
              <Redo className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-700 mx-1" />

            <button
              type="button"
              onClick={() => {
                setBody((prev) => `${prev} **Bold Text**`);
              }}
              className="p-1.5 hover:text-gray-800 dark:hover:text-white rounded hover:bg-gray-200/60 dark:hover:bg-gray-700/50 cursor-pointer"
              title="Bold"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setBody((prev) => `${prev} *Italic Text*`);
              }}
              className="p-1.5 hover:text-gray-800 dark:hover:text-white rounded hover:bg-gray-200/60 dark:hover:bg-gray-700/50 cursor-pointer"
              title="Italic"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setBody((prev) => `${prev} <u>Underline</u>`);
              }}
              className="p-1.5 hover:text-gray-800 dark:hover:text-white rounded hover:bg-gray-200/60 dark:hover:bg-gray-700/50 cursor-pointer"
              title="Underline"
            >
              <Underline className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1.5 hover:text-gray-800 dark:hover:text-white rounded hover:bg-gray-200/60 dark:hover:bg-gray-700/50 cursor-pointer"
              title="Strikethrough"
            >
              <Strikethrough className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-700 mx-1" />

            <button
              type="button"
              className="p-1.5 hover:text-gray-800 dark:hover:text-white rounded hover:bg-gray-200/60 dark:hover:bg-gray-700/50 cursor-pointer"
              title="Align Left"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1.5 hover:text-gray-800 dark:hover:text-white rounded hover:bg-gray-200/60 dark:hover:bg-gray-700/50 cursor-pointer"
              title="Align Center"
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-700 mx-1" />

            <button
              type="button"
              className="p-1.5 hover:text-gray-800 dark:hover:text-white rounded hover:bg-gray-200/60 dark:hover:bg-gray-700/50 cursor-pointer"
              title="Numbered list"
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1.5 hover:text-gray-800 dark:hover:text-white rounded hover:bg-gray-200/60 dark:hover:bg-gray-700/50 cursor-pointer"
              title="Bulleted list"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1.5 hover:text-gray-800 dark:hover:text-white rounded hover:bg-gray-200/60 dark:hover:bg-gray-700/50 cursor-pointer"
              title="Quote"
            >
              <Quote className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1.5 hover:text-gray-800 dark:hover:text-white rounded hover:bg-gray-200/60 dark:hover:bg-gray-700/50 cursor-pointer"
              title="Link"
            >
              <LinkIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Textarea */}
          <textarea
            rows={10}
            placeholder="Type Your Reply..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full p-4 rounded-xl bg-gray-50/50 dark:bg-surface-darkInput/40 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 border border-gray-100 dark:border-surface-darkBorder focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none transition-all leading-relaxed"
          />
        </div>

        {/* Attached Files Preview Cards at Bottom (Mockup 6 & 7) */}
        {attachments.length > 0 && (
          <div className="pt-4">
            <span className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-2 block">
              Attachments ({attachments.length})
            </span>
            <div className="flex flex-wrap gap-3">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="relative group w-36 rounded-xl overflow-hidden border border-gray-200 dark:border-surface-darkBorder bg-gray-50 dark:bg-surface-darkInput"
                >
                  <div className="h-20 overflow-hidden bg-gray-200 dark:bg-gray-800">
                    <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="p-2">
                    <div className="text-[11px] font-medium text-gray-800 dark:text-gray-200 truncate">
                      {att.name}
                    </div>
                    <div className="text-[9px] text-gray-400">{att.size}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAttachments(attachments.filter((a) => a.id !== att.id))}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-red-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* "Send Later" Popover / Modal (Matching Figma Mockup 5) */}
      {showSendLaterModal && (
        <div className="absolute right-6 top-16 w-80 bg-white dark:bg-surface-darkCard rounded-2xl shadow-2xl border border-gray-200 dark:border-surface-darkBorder p-5 z-50 animate-fadeIn space-y-4">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Send Later</h3>

          {/* Date and Time Picker */}
          <div className="relative">
            <input
              type="datetime-local"
              value={tempScheduledInput}
              onChange={(e) => setTempScheduledInput(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl bg-gray-50 dark:bg-surface-darkInput border border-gray-200 dark:border-surface-darkBorder text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <Calendar className="w-4 h-4 text-gray-400 absolute right-3 top-2.5 pointer-events-none" />
          </div>

          {/* Quick Preset Options */}
          <div className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
            <button
              type="button"
              onClick={() => setQuickPreset('tomorrow')}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-surface-darkInput transition-colors cursor-pointer"
            >
              Tomorrow
            </button>
            <button
              type="button"
              onClick={() => setQuickPreset('10am')}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-surface-darkInput transition-colors cursor-pointer"
            >
              Tomorrow, 10:00 AM
            </button>
            <button
              type="button"
              onClick={() => setQuickPreset('11am')}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-surface-darkInput transition-colors cursor-pointer"
            >
              Tomorrow, 11:00 AM
            </button>
            <button
              type="button"
              onClick={() => setQuickPreset('3pm')}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-surface-darkInput transition-colors cursor-pointer"
            >
              Tomorrow, 3:00 PM
            </button>
          </div>

          {/* Action Buttons: Cancel and Done */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100 dark:border-surface-darkBorder">
            <button
              type="button"
              onClick={handleCancelSendLater}
              className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 px-3 py-1.5 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplySendLater}
              className="text-xs font-semibold text-brand-600 dark:text-emerald-400 border border-brand-500 px-4 py-1.5 rounded-full hover:bg-brand-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
