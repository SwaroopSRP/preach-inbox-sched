export type EmailStatus = 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
}

export interface Sender {
  id: string;
  userId: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Email {
  id: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt?: string | null;
  failedAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  sender?: {
    id: string;
    email: string;
    name: string;
  };
}

export interface ScheduleEmailPayload {
  senderId: string;
  recipients: string | string[];
  subject: string;
  body: string;
  scheduledAt: string;
  delayMs?: number;
  hourlyLimit?: number;
}

export interface ScheduleEmailResponse {
  message: string;
  emails: Email[];
}

export interface SearchEmailsResponse {
  source: 'elasticsearch' | 'postgres_fallback';
  count: number;
  emails: Email[];
}

export interface SlackStatus {
  connected: boolean;
  teamName?: string;
  channelName?: string;
  createdAt?: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';
export type ActiveTab = 'scheduled' | 'sent' | 'compose';
