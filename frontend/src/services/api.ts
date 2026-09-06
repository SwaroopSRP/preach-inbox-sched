import axios from 'axios';
import type {
  User,
  Sender,
  Email,
  ScheduleEmailPayload,
  ScheduleEmailResponse,
  SearchEmailsResponse,
  SlackStatus,
} from '../types/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  auth: {
    async getMe(): Promise<User> {
      const res = await apiClient.get<{ user: User }>('/api/auth/me');
      return res.data.user;
    },
    async login(email: string, password: string): Promise<{ user: User; token: string }> {
      const res = await apiClient.post<{ user: User; token: string }>('/api/auth/login', {
        email,
        password,
      });
      return res.data;
    },
    async register(email: string, password: string, name: string): Promise<{ user: User; token: string }> {
      const res = await apiClient.post<{ user: User; token: string }>('/api/auth/register', {
        email,
        password,
        name,
      });
      return res.data;
    },
    async devLogin(email?: string, name?: string): Promise<{ user: User; token: string }> {
      const params = new URLSearchParams({ format: 'json' });
      if (email) params.append('email', email);
      if (name) params.append('name', name);
      const res = await apiClient.get<{ user: User; token: string }>(`/api/auth/dev-login?${params.toString()}`);
      return res.data;
    },
    async logout(): Promise<void> {
      await apiClient.post('/api/auth/logout');
    },
    getGoogleLoginUrl(): string {
      const base = API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
      return `${base}/api/auth/google`;
    },
  },

  senders: {
    async list(): Promise<Sender[]> {
      const res = await apiClient.get<{ senders: Sender[] }>('/api/senders');
      return res.data.senders;
    },
    async create(name: string, email: string): Promise<Sender> {
      const res = await apiClient.post<{ sender: Sender }>('/api/senders', { name, email });
      return res.data.sender;
    },
  },

  emails: {
    async getScheduled(): Promise<Email[]> {
      const res = await apiClient.get<{ emails: Email[] }>('/api/emails/scheduled');
      return res.data.emails;
    },
    async getSent(): Promise<Email[]> {
      const res = await apiClient.get<{ emails: Email[] }>('/api/emails/sent');
      return res.data.emails;
    },
    async getById(id: string): Promise<Email> {
      const res = await apiClient.get<{ email: Email }>(`/api/emails/${id}`);
      return res.data.email;
    },
    async schedule(payload: ScheduleEmailPayload): Promise<ScheduleEmailResponse> {
      const res = await apiClient.post<ScheduleEmailResponse>('/api/emails/schedule', payload);
      return res.data;
    },
    async search(query: string): Promise<SearchEmailsResponse> {
      const res = await apiClient.get<SearchEmailsResponse>(`/api/emails/search?q=${encodeURIComponent(query)}`);
      return res.data;
    },
  },

  slack: {
    async getStatus(): Promise<SlackStatus> {
      const res = await apiClient.get<SlackStatus>('/api/integrations/slack/status');
      return res.data;
    },
    async disconnect(): Promise<void> {
      await apiClient.post('/api/integrations/slack/disconnect');
    },
    getConnectUrl(): string {
      const base = API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
      return `${base}/api/integrations/slack/connect`;
    },
  },

  health: {
    async check(): Promise<any> {
      const res = await apiClient.get('/health');
      return res.data;
    },
  },
};
