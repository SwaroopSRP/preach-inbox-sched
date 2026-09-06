import React, { useState, useEffect, useCallback, useTransition } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { LoginView } from './components/auth/LoginView';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { EmailList } from './components/inbox/EmailList';
import { EmailDetail } from './components/inbox/EmailDetail';
import { ComposeModal } from './components/compose/ComposeModal';
import { PreferencesDrawer } from './components/settings/PreferencesDrawer';
import { api } from './services/api';
import type { Email, ActiveTab } from './types/api';

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('scheduled');
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'starred'>('all');

  const [starredIds, setStarredIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('preach_starred_email_ids');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const toggleStar = (id: string) => {
    setStarredIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem('preach_starred_email_ids', JSON.stringify(Array.from(next)));
      } catch (err) {
        console.error('Failed to persist starred emails:', err);
      }
      return next;
    });
  };

  const [scheduledEmails, setScheduledEmails] = useState<Email[]>([]);
  const [sentEmails, setSentEmails] = useState<Email[]>([]);
  const [loadingScheduled, setLoadingScheduled] = useState(true);
  const [loadingSent, setLoadingSent] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchServerResults, setSearchServerResults] = useState<{ query: string; emails: Email[] } | null>(null);
  const [, startTransition] = useTransition();

  // Load emails
  const loadEmails = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [scheduled, sent] = await Promise.all([
        api.emails.getScheduled(),
        api.emails.getSent(),
      ]);
      setScheduledEmails(scheduled);
      setSentEmails(sent);
    } catch (err) {
      console.error('Failed to load emails:', err);
    } finally {
      setLoadingScheduled(false);
      setLoadingSent(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadEmails();
    const interval = setInterval(loadEmails, 12000); // Polling every 12s
    return () => clearInterval(interval);
  }, [loadEmails]);

  // Real-time search with debounce
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchServerResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await api.emails.search(q);
        startTransition(() => {
          setSearchServerResults({ query: q, emails: res.emails });
        });
      } catch (err) {
        console.error('Search failed:', err);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    setSelectedEmail(null);
  };

  const handleOpenCompose = () => {
    setActiveTab('compose');
    setSelectedEmail(null);
  };

  const currentTabEmails = activeTab === 'scheduled' ? scheduledEmails : sentEmails;

  // Real-time fused search: instant client filter + validated server results
  const displayedEmails = (() => {
    const q = searchQuery.toLowerCase().trim();

    if (!q) {
      return filter === 'starred'
        ? currentTabEmails.filter((e) => starredIds.has(e.id))
        : currentTabEmails;
    }

    // 1. Instant client-side match for zero latency
    const localMatches = currentTabEmails.filter((e) => {
      const rec = e.recipient?.toLowerCase() || '';
      const sub = e.subject?.toLowerCase() || '';
      const body = e.body?.toLowerCase() || '';
      const sName = e.sender?.name?.toLowerCase() || '';
      const sEmail = e.sender?.email?.toLowerCase() || '';
      return (
        rec.includes(q) ||
        sub.includes(q) ||
        body.includes(q) ||
        sName.includes(q) ||
        sEmail.includes(q)
      );
    });

    const combinedMap = new Map<string, Email>();
    localMatches.forEach((e) => combinedMap.set(e.id, e));

    // 2. Only merge server results if they strictly match the CURRENT active query
    if (searchServerResults && searchServerResults.query.toLowerCase().trim() === q) {
      searchServerResults.emails.forEach((e) => {
        const tabMatch =
          activeTab === 'scheduled'
            ? e.status === 'SCHEDULED'
            : e.status === 'SENT' || e.status === 'FAILED';
        if (tabMatch) {
          combinedMap.set(e.id, e);
        }
      });
    }

    let list = Array.from(combinedMap.values());
    if (filter === 'starred') {
      list = list.filter((e) => starredIds.has(e.id));
    }

    return list;
  })();


  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-surface-dark transition-colors font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        scheduledCount={scheduledEmails.length}
        sentCount={sentEmails.length}
        onOpenPreferences={() => setIsPreferencesOpen(true)}
        onOpenCompose={handleOpenCompose}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {activeTab === 'compose' ? (
          <ComposeModal
            onBack={() => setActiveTab('scheduled')}
            onEmailScheduled={() => {
              loadEmails();
              setActiveTab('scheduled');
            }}
          />
        ) : selectedEmail ? (
          <EmailDetail
            email={selectedEmail}
            onBack={() => setSelectedEmail(null)}
            isStarred={starredIds.has(selectedEmail.id)}
            onToggleStar={() => toggleStar(selectedEmail.id)}
          />
        ) : (
          <>
            {/* Top Search & Action Bar */}
            <Header
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onRefresh={loadEmails}
              isRefreshing={isRefreshing}
              filter={filter}
              onFilterChange={setFilter}
            />

            {/* Email List Feed */}
            <main className="flex-1 overflow-y-auto">
              <EmailList
                type={activeTab as 'scheduled' | 'sent'}
                emails={displayedEmails}
                loading={activeTab === 'scheduled' ? loadingScheduled : loadingSent}
                onSelectEmail={(email) => setSelectedEmail(email)}
                onComposeClick={handleOpenCompose}
                starredIds={starredIds}
                onToggleStar={toggleStar}
                isFilterActive={filter === 'starred'}
                searchQuery={searchQuery}
              />
            </main>
          </>
        )}
      </div>

      {/* Preferences Slide-In Side Panel */}
      <PreferencesDrawer
        isOpen={isPreferencesOpen}
        onClose={() => setIsPreferencesOpen(false)}
        onSendersUpdated={loadEmails}
      />
    </div>
  );
};

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-surface-dark transition-colors">
        <div className="w-12 h-12 rounded-full border-3 border-brand-500 border-t-transparent animate-spin mb-4" />
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Loading PreachInbox...
        </span>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  return <Dashboard />;
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
