'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Progress, Table, Tag } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { usePathname } from 'next/navigation';

type AdminUser = {
  _id?: string;
  email?: string;
  companyName?: string;
  token?: string;
  status?: string;
};

type UsersResponse = {
  users?: AdminUser[];
  total?: number;
};

type AdminTender = {
  _id?: string;
  id?: string;
  publicationNumber?: string;
  title?: string;
  buyerName?: string;
  buyerCountry?: string;
  publicationDate?: string;
  submissionDeadline?: string;
  estimatedValue?: {
    amount?: number | null;
    currency?: string | null;
  };
  estimatedValueEur?: number | null;
};

type TendersResponse = {
  tenders?: AdminTender[];
  total?: number;
};

type SitemapResult = {
  outputPath: string;
  downloadUrl: string;
  tendersCount: number;
  industriesCount: number;
  countriesCount: number;
  urlsCount: number;
  sitemapFilesCount: number;
  maxUrlsPerFile: number;
  sitemapFiles: Array<{
    filename: string;
    outputPath: string;
    downloadUrl: string;
  }>;
  isSitemapIndex: boolean;
  domain: string;
  locales: string[];
};

type ShortTitlesResult = {
  matchedCount: number;
  updatedCount: number;
  failedCount: number;
  batchSize: number;
  errors: Array<{
    id: string;
    message: string;
  }>;
};

type DbCopyResult = {
  filename: string;
  url: string;
  deletedCount: number;
};

type BuyerCollectionResult = {
  isRunning: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  totalTenders: number;
  processedTenders: number;
  noticesFetched: number;
  processedNotices: number;
  updatedTenders: number;
  errors: number;
  failedChunks: number;
};

type AwardBuyerCollectionResult = {
  isRunning: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  totalAwardTenders: number;
  processedAwardTenders: number;
  noticesFetched: number;
  processedNotices: number;
  updatedAwardTenders: number;
  errors: number;
  failedChunks: number;
};

type GatherAllCompetitionTendersStatus = {
  isRunning: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  pagesFetched: number;
  noticesFetched: number;
  totalNoticeCount?: number;
};

type RecentCompetitionTendersCronStatus = {
  isRunning: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  pagesFetched: number;
  noticesFetched: number;
  totalNoticeCount?: number;
  matchesSaved: number;
};

type RecentAwardTendersCronStatus = {
  isRunning: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  pagesFetched: number;
  noticesFetched: number;
  totalNoticeCount?: number;
};

type AwardTendersRefreshStatus = {
  isRunning: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  pagesFetched: number;
  noticesFetched: number;
  totalNoticeCount?: number;
};

type SyncIndexesStatus = {
  isRunning: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  totalModels: number;
  processedModels: number;
  currentModel: string | null;
  errors: Array<{
    model: string;
    message: string;
  }>;
};

type TechJobResult = Record<string, unknown>;

type CronTask = {
  id: string;
  title: string;
  description: string;
  scheduled?: boolean;
  schedule?: {
    enabled: boolean;
    persistedEnabled?: boolean;
    nextRunAt: string | null;
  } | null;
};

type CronRunResult = {
  id: string;
  status: string;
  result: unknown;
};

const tokenStorageKey = 'ted-admin-token';

const defaultCronTasks: CronTask[] = [
  {
    id: 'gather-recent-competition-tenders',
    title: 'Gather recent competition tenders',
    description: 'Collect recent competition tenders and run matching.',
  },
  {
    id: 'gather-recent-award-tenders',
    title: 'Gather recent award tenders',
    description: 'Collect recent TED result notices.',
  },
  {
    id: 'sync-latest-rates',
    title: 'Sync latest exchange rates',
    description: 'Update currency exchange rates.',
  },
  {
    id: 'send-daily-reports',
    title: 'Send daily reports',
    description: 'Send daily tender match notifications.',
  },
  {
    id: 'send-weekly-reports',
    title: 'Send weekly reports',
    description: 'Send weekly tender match notifications.',
  },
  {
    id: 'copy-database-dump-to-cdn',
    title: 'Copy database dump to CDN',
    description: 'Create and upload a database dump.',
  },
];

class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function getApiUrl(path: string) {
  const configuredOrigin = process.env.NEXT_PUBLIC_ADMIN_API_ORIGIN;

  if (configuredOrigin) {
    return `${configuredOrigin}${path}`;
  }

  if (
    typeof window !== 'undefined' &&
    window.location.hostname === 'localhost' &&
    window.location.port === '3001'
  ) {
    return `http://localhost:3000${path}`;
  }

  return path;
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }

  const response = await fetch(getApiUrl(path), {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new ApiRequestError(await response.text(), response.status);
  }

  const text = await response.text();

  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export default function AdminApp() {
  const pathname = usePathname();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersPageSize, setUsersPageSize] = useState(20);
  const [usersLoading, setUsersLoading] = useState(false);
  const [tenders, setTenders] = useState<AdminTender[]>([]);
  const [tendersTotal, setTendersTotal] = useState(0);
  const [tendersPage, setTendersPage] = useState(1);
  const [tendersPageSize, setTendersPageSize] = useState(20);
  const [tendersLoading, setTendersLoading] = useState(false);
  const [sitemapDomain, setSitemapDomain] = useState('');
  const [sitemapLocales, setSitemapLocales] = useState('en');
  const [sitemapMaxUrlsPerFile, setSitemapMaxUrlsPerFile] = useState('40000');
  const [sitemapResult, setSitemapResult] = useState<SitemapResult | null>(
    null,
  );
  const [sitemapLoading, setSitemapLoading] = useState(false);
  const [shortTitlesLimit, setShortTitlesLimit] = useState('100');
  const [shortTitlesBatchSize, setShortTitlesBatchSize] = useState('20');
  const [shortTitlesResult, setShortTitlesResult] =
    useState<ShortTitlesResult | null>(null);
  const [shortTitlesLoading, setShortTitlesLoading] = useState(false);
  const [dbCopyResult, setDbCopyResult] = useState<DbCopyResult | null>(null);
  const [dbCopyLoading, setDbCopyLoading] = useState(false);
  const [syncIndexesLoading, setSyncIndexesLoading] = useState(false);
  const [syncIndexesStatus, setSyncIndexesStatus] =
    useState<SyncIndexesStatus | null>(null);
  const [collectTenderBuyersLoading, setCollectTenderBuyersLoading] =
    useState(false);
  const [collectTenderBuyersResult, setCollectTenderBuyersResult] =
    useState<BuyerCollectionResult | null>(null);
  const [collectAwardBuyersLoading, setCollectAwardBuyersLoading] =
    useState(false);
  const [collectAwardBuyersResult, setCollectAwardBuyersResult] =
    useState<AwardBuyerCollectionResult | null>(null);
  const [gatherAllCompetitionPageLimit, setGatherAllCompetitionPageLimit] =
    useState('70');
  const [gatherAllCompetitionLoading, setGatherAllCompetitionLoading] =
    useState(false);
  const [awardTendersRefreshPageLimit, setAwardTendersRefreshPageLimit] =
    useState('50');
  const [awardTendersRefreshLoading, setAwardTendersRefreshLoading] =
    useState(false);
  const [awardTendersRefreshResult, setAwardTendersRefreshResult] =
    useState<AwardTendersRefreshStatus | null>(null);
  const [cronTaskLoadingById, setCronTaskLoadingById] = useState<
    Record<string, boolean>
  >({});
  const [cronTasks, setCronTasks] = useState<CronTask[]>(defaultCronTasks);
  const [cronRunResult, setCronRunResult] = useState<CronRunResult | null>(
    null,
  );
  const [gatherAllStatus, setGatherAllStatus] =
    useState<GatherAllCompetitionTendersStatus | null>(null);
  const [
    recentCompetitionTendersCronStatus,
    setRecentCompetitionTendersCronStatus,
  ] = useState<RecentCompetitionTendersCronStatus | null>(null);
  const [recentAwardTendersCronStatus, setRecentAwardTendersCronStatus] =
    useState<RecentAwardTendersCronStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const isAuthenticated = Boolean(token);
  const activeSection = pathname.includes('/tenders')
    ? 'tenders'
    : pathname.includes('/users')
      ? 'users'
      : pathname.includes('/tech')
        ? 'tech'
        : 'dashboard';
  const pageTitle = useMemo(() => {
    if (!isAuthenticated) {
      return 'Admin sign in';
    }

    if (activeSection === 'users') {
      return 'Users';
    }

    if (activeSection === 'tenders') {
      return 'Tenders';
    }

    if (activeSection === 'tech') {
      return 'Tech';
    }

    return 'Dashboard';
  }, [activeSection, isAuthenticated]);

  useEffect(() => {
    const savedToken = window.localStorage.getItem(tokenStorageKey);

    if (savedToken) {
      setToken(savedToken);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }

    void loadAdminData(token, activeSection);
  }, [activeSection, token]);

  useEffect(() => {
    if (!token || activeSection !== 'tech') {
      return;
    }

    void loadGatherAllStatus(token);
    void loadAwardTendersRefreshStatus(token);
    void loadSyncIndexesStatus(token);
    void loadCronTasks(token);
    void loadRecentCompetitionTendersCronStatus(token);
    void loadRecentAwardTendersCronStatus(token);
    void loadCollectTenderBuyersStatus(token);
    void loadCollectAwardBuyersStatus(token);
    const interval = window.setInterval(() => {
      void loadGatherAllStatus(token);
      void loadAwardTendersRefreshStatus(token);
      void loadSyncIndexesStatus(token);
      void loadCronTasks(token);
      void loadRecentCompetitionTendersCronStatus(token);
      void loadRecentAwardTendersCronStatus(token);
      void loadCollectTenderBuyersStatus(token);
      void loadCollectAwardBuyersStatus(token);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [activeSection, token]);

  const userColumns: ColumnsType<AdminUser> = [
    {
      title: 'Company',
      dataIndex: 'companyName',
      key: 'companyName',
      render: (value?: string) => value || 'Unnamed company',
      sorter: (left, right) =>
        (left.companyName || '').localeCompare(right.companyName || ''),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      render: (value?: string) => value || '-',
      sorter: (left, right) =>
        (left.email || '').localeCompare(right.email || ''),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (value?: string) =>
        value ? <Tag color="blue">{value}</Tag> : <Tag>unknown</Tag>,
      width: 140,
    },
    {
      title: 'ID',
      dataIndex: '_id',
      key: '_id',
      render: (value?: string) => value || '-',
      responsive: ['lg'],
    },
  ];

  const tenderColumns: ColumnsType<AdminTender> = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (value?: string) => value || 'Untitled tender',
      width: 360,
    },
    {
      title: 'Publication',
      dataIndex: 'publicationNumber',
      key: 'publicationNumber',
      render: (_value, tender) => tender.publicationNumber || tender.id || '-',
      width: 160,
    },
    {
      title: 'Buyer',
      dataIndex: 'buyerName',
      key: 'buyerName',
      render: (value?: string) => value || '-',
      width: 220,
    },
    {
      title: 'Country',
      dataIndex: 'buyerCountry',
      key: 'buyerCountry',
      render: (value?: string) => value || '-',
      width: 110,
    },
    {
      title: 'Published',
      dataIndex: 'publicationDate',
      key: 'publicationDate',
      render: formatDate,
      width: 140,
    },
    {
      title: 'Deadline',
      dataIndex: 'submissionDeadline',
      key: 'submissionDeadline',
      render: formatDate,
      width: 140,
    },
    {
      title: 'Value',
      key: 'estimatedValue',
      render: (_value, tender) => formatEstimatedValue(tender),
      width: 150,
    },
  ];

  async function loadAdminData(
    authToken: string,
    section = activeSection,
    page = usersPage,
    pageSize = usersPageSize,
  ) {
    setIsLoading(true);
    setMessage('');

    try {
      const self = await request<AdminUser>('/users/adm/self', {
        token: authToken,
      }).catch((error) => {
        if (error instanceof ApiRequestError && error.status === 403) {
          signOut();
        }

        throw error;
      });

      setCurrentUser(self);

      if (section === 'users') {
        await loadUsers(authToken, page, pageSize);
      }

      if (section === 'tenders') {
        await loadTenders(authToken, tendersPage, tendersPageSize);
      }

      if (section === 'tech') {
        await loadGatherAllStatus(authToken);
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Failed to load data',
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function loadGatherAllStatus(authToken: string) {
    try {
      const status = await request<GatherAllCompetitionTendersStatus>(
        '/adm/tech/tenders/gather-all-competition/status',
        { token: authToken },
      );

      setGatherAllStatus(status);
    } catch {
      setGatherAllStatus(null);
    }
  }

  async function loadAwardTendersRefreshStatus(authToken: string) {
    try {
      const status = await request<AwardTendersRefreshStatus>(
        '/adm/tech/award-tenders/refresh/status',
        { token: authToken },
      );

      setAwardTendersRefreshResult(status);
      setAwardTendersRefreshLoading(status.isRunning);
    } catch {
      // Keep the current status visible if polling fails.
    }
  }

  async function loadSyncIndexesStatus(authToken: string) {
    try {
      const status = await request<SyncIndexesStatus>(
        '/adm/tech/sync-indexes/status',
        { token: authToken },
      );

      setSyncIndexesStatus(status);
      setSyncIndexesLoading(status.isRunning);
    } catch {
      // Keep the current status visible if polling fails.
    }
  }

  async function loadCronTasks(authToken: string) {
    try {
      const response = await request<{ tasks?: CronTask[] }>('/adm/cron', {
        token: authToken,
      });

      if (response.tasks?.length) {
        setCronTasks(response.tasks);
      }
    } catch {
      // Keep the fallback/static cron task list if polling fails.
    }
  }

  async function loadUsers(
    authToken: string,
    page = usersPage,
    pageSize = usersPageSize,
  ) {
    setUsersLoading(true);

    try {
      const offset = (page - 1) * pageSize;
      const usersResponse = await request<UsersResponse>(
        `/users/adm?limit=${pageSize}&offset=${offset}`,
        {
          token: authToken,
        },
      );

      setUsers(usersResponse.users ?? []);
      setUsersTotal(usersResponse.total ?? 0);
      setUsersPage(page);
      setUsersPageSize(pageSize);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Failed to load data',
      );
    } finally {
      setUsersLoading(false);
    }
  }

  function handleUsersTableChange(pagination: TablePaginationConfig) {
    if (!token) {
      return;
    }

    void loadUsers(
      token,
      pagination.current ?? usersPage,
      pagination.pageSize ?? usersPageSize,
    );
  }

  async function loadTenders(
    authToken: string,
    page = tendersPage,
    pageSize = tendersPageSize,
  ) {
    setTendersLoading(true);

    try {
      const offset = (page - 1) * pageSize;
      const tendersResponse = await request<TendersResponse>(
        `/tenders/adm?limit=${pageSize}&offset=${offset}`,
        {
          token: authToken,
        },
      );

      setTenders(tendersResponse.tenders ?? []);
      setTendersTotal(tendersResponse.total ?? 0);
      setTendersPage(page);
      setTendersPageSize(pageSize);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Failed to load tenders',
      );
    } finally {
      setTendersLoading(false);
    }
  }

  function handleTendersTableChange(pagination: TablePaginationConfig) {
    if (!token) {
      return;
    }

    void loadTenders(
      token,
      pagination.current ?? tendersPage,
      pagination.pageSize ?? tendersPageSize,
    );
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage('');

    try {
      const response = await request<{ user: AdminUser }>('/auth/adm/signin', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const authToken = response.user.token;

      if (!authToken) {
        throw new Error('Sign in response does not include token.');
      }

      window.localStorage.setItem(tokenStorageKey, authToken);
      setToken(authToken);
      setCurrentUser(response.user);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign in failed');
    } finally {
      setIsLoading(false);
    }
  }

  function signOut() {
    window.localStorage.removeItem(tokenStorageKey);
    setToken('');
    setCurrentUser(null);
    setUsers([]);
    setUsersTotal(0);
    setUsersPage(1);
    setUsersPageSize(20);
    setTenders([]);
    setTendersTotal(0);
    setTendersPage(1);
    setTendersPageSize(20);
    setSitemapResult(null);
    setShortTitlesResult(null);
    setDbCopyResult(null);
    setGatherAllStatus(null);
    setAwardTendersRefreshResult(null);
  }

  async function generateSitemap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSitemapLoading(true);
    setMessage('');

    try {
      const result = await request<SitemapResult>('/adm/tech/sitemap', {
        method: 'POST',
        body: JSON.stringify({
          domain: sitemapDomain,
          locales: sitemapLocales,
          maxUrlsPerFile: Number(sitemapMaxUrlsPerFile) || undefined,
        }),
        token,
      });

      setSitemapResult(result);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Failed to generate sitemap',
      );
    } finally {
      setSitemapLoading(false);
    }
  }

  async function downloadSitemap(file?: {
    filename: string;
    downloadUrl: string;
  }) {
    setMessage('');

    try {
      const response = await fetch(
        getApiUrl(file?.downloadUrl ?? '/adm/tech/sitemap/download'),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file?.filename ?? 'tenders-sitemap.xml';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Failed to download sitemap',
      );
    }
  }

  async function generateShortTitles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShortTitlesLoading(true);
    setMessage('');

    try {
      const result = await request<ShortTitlesResult>(
        '/adm/tech/tenders/short-titles',
        {
          method: 'POST',
          body: JSON.stringify({
            limit: Number(shortTitlesLimit) || undefined,
            batchSize: Number(shortTitlesBatchSize) || undefined,
          }),
          token,
        },
      );

      setShortTitlesResult(result);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Failed to generate short titles',
      );
    } finally {
      setShortTitlesLoading(false);
    }
  }

  async function copyDatabaseDumpToCdn() {
    setDbCopyLoading(true);
    setMessage('');

    try {
      const result = await request<DbCopyResult>('/adm/tech/db-copy', {
        method: 'POST',
        token,
      });

      setDbCopyResult(result);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Failed to copy database dump',
      );
    } finally {
      setDbCopyLoading(false);
    }
  }

  async function syncMongoIndexes() {
    const confirmed = window.confirm(
      'Create missing MongoDB indexes now? This can take a long time on large collections.',
    );

    if (!confirmed) {
      return;
    }

    setSyncIndexesLoading(true);
    setMessage('');

    try {
      const status = await request<SyncIndexesStatus>(
        '/adm/tech/sync-indexes',
        {
          method: 'POST',
          token,
        },
      );

      setSyncIndexesStatus(status);
      setSyncIndexesLoading(status.isRunning);
      setMessage('Mongo index synchronization started.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Failed to start Mongo index synchronization',
      );
    }
  }

  async function collectBuyersFromTenders() {
    const confirmed = window.confirm(
      'Start buyer collection for all saved tenders? This can take a long time.',
    );

    if (!confirmed) {
      return;
    }

    setCollectTenderBuyersLoading(true);
    setCollectTenderBuyersResult(null);
    setMessage('');

    try {
      const result = await request<BuyerCollectionResult>(
        '/adm/tech/buyers/collect',
        {
          method: 'POST',
          token,
        },
      );

      setCollectTenderBuyersResult(result);
      setCollectTenderBuyersLoading(result.isRunning);
      setMessage('Tender buyer collection started.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Failed to collect buyers from tenders',
      );
    }
  }

  async function loadRecentCompetitionTendersCronStatus(authToken: string) {
    try {
      const status = await request<RecentCompetitionTendersCronStatus>(
        '/adm/cron/gather-recent-competition-tenders/status',
        { token: authToken },
      );

      setRecentCompetitionTendersCronStatus(status);
    } catch {
      // Keep the current status visible if polling fails.
    }
  }

  async function loadRecentAwardTendersCronStatus(authToken: string) {
    try {
      const status = await request<RecentAwardTendersCronStatus>(
        '/adm/cron/gather-recent-award-tenders/status',
        { token: authToken },
      );

      setRecentAwardTendersCronStatus(status);
    } catch {
      // Keep the current status visible if polling fails.
    }
  }

  async function loadCollectTenderBuyersStatus(authToken: string) {
    try {
      const status = await request<BuyerCollectionResult>(
        '/adm/tech/buyers/collect/status',
        { token: authToken },
      );

      setCollectTenderBuyersResult(status);
      setCollectTenderBuyersLoading(status.isRunning);
    } catch {
      // Keep the current status visible if a polling request fails.
    }
  }

  async function loadCollectAwardBuyersStatus(authToken: string) {
    try {
      const status = await request<AwardBuyerCollectionResult>(
        '/adm/tech/buyers/collect-awards/status',
        { token: authToken },
      );

      setCollectAwardBuyersResult(status);
      setCollectAwardBuyersLoading(status.isRunning);
    } catch {
      // Keep the current status visible if a polling request fails.
    }
  }

  async function collectBuyersFromAwardTenders() {
    const confirmed = window.confirm(
      'Start buyer collection for all saved award tenders? This can take a long time.',
    );

    if (!confirmed) {
      return;
    }

    setCollectAwardBuyersLoading(true);
    setCollectAwardBuyersResult(null);
    setMessage('');

    try {
      const result = await request<AwardBuyerCollectionResult>(
        '/adm/tech/buyers/collect-awards',
        {
          method: 'POST',
          token,
        },
      );

      setCollectAwardBuyersResult(result);
      setCollectAwardBuyersLoading(result.isRunning);
      setMessage('Award tender buyer collection started.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Failed to collect buyers from award tenders',
      );
    }
  }

  async function gatherAllCompetitionTenders() {
    const confirmed = window.confirm(
      'Start full competition tender gathering from TED? This can take a long time.',
    );

    if (!confirmed) {
      return;
    }

    setGatherAllCompetitionLoading(true);
    setMessage('');

    try {
      const status = await request<GatherAllCompetitionTendersStatus>(
        '/adm/tech/tenders/gather-all-competition',
        {
          method: 'POST',
          body: JSON.stringify({
            pageLimit: Number(gatherAllCompetitionPageLimit) || undefined,
          }),
          token,
        },
      );

      setGatherAllStatus(status);
      setGatherAllCompetitionLoading(status.isRunning);
      setMessage('Full competition tender gathering started.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Failed to start full competition tender gathering',
      );
    }
  }

  async function refreshAwardTendersHistory() {
    const confirmed = window.confirm(
      'Refresh award tenders from TED result notices? This can take a long time.',
    );

    if (!confirmed) {
      return;
    }

    setAwardTendersRefreshLoading(true);
    setAwardTendersRefreshResult(null);
    setMessage('');

    try {
      const result = await request<AwardTendersRefreshStatus>(
        '/adm/tech/award-tenders/refresh',
        {
          method: 'POST',
          body: JSON.stringify({
            pageLimit: Number(awardTendersRefreshPageLimit) || undefined,
          }),
          token,
        },
      );

      setAwardTendersRefreshResult(result);
      setAwardTendersRefreshLoading(result.isRunning);
      setMessage('Award tender refresh started.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Failed to refresh award tenders',
      );
    }
  }

  async function runCronTask(task: CronTask) {
    const confirmed = window.confirm(
      `Run cron task "${task.title}" now? This can take a long time.`,
    );

    if (!confirmed) {
      return;
    }

    setCronTaskLoadingById((current) => ({ ...current, [task.id]: true }));
    setCronRunResult(null);
    setMessage('');

    try {
      const result = await request<CronRunResult>(`/adm/cron/${task.id}`, {
        method: 'POST',
        token,
      });

      setCronRunResult(result);
      setMessage(`Cron task "${task.title}" finished.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Failed to run cron task',
      );
    } finally {
      setCronTaskLoadingById((current) => ({
        ...current,
        [task.id]: false,
      }));
    }
  }

  async function toggleCronTask(task: CronTask) {
    if (!task.scheduled || !task.schedule) {
      return;
    }

    const action = task.schedule.enabled ? 'disable' : 'enable';
    setCronTaskLoadingById((current) => ({ ...current, [task.id]: true }));
    setMessage('');

    try {
      await request(`/adm/cron/${task.id}/${action}`, {
        method: 'POST',
        token,
      });
      await loadCronTasks(token);
      setMessage(`Cron task "${task.title}" ${action}d.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : `Failed to ${action} cron task`,
      );
    } finally {
      setCronTaskLoadingById((current) => ({
        ...current,
        [task.id]: false,
      }));
    }
  }

  async function downloadTenderShortTitles() {
    setMessage('');

    try {
      const response = await fetch(
        getApiUrl('/adm/tech/tenders/short-titles/export'),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tender-short-titles-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Failed to download tender short titles',
      );
    }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div>
          <div className="brand">TED Admin</div>
          <nav className="nav">
            <a href="/admin">Dashboard</a>
            <a href="/admin/users">Users</a>
            <a href="/admin/tenders">Tenders</a>
            <a href="/admin/tech">Tech</a>
          </nav>
        </div>
        {isAuthenticated ? (
          <button className="secondaryButton" onClick={signOut}>
            Sign out
          </button>
        ) : null}
      </aside>

      <section className="content">
        <header className="header">
          <div>
            <p className="eyebrow">Administration</p>
            <h1>{pageTitle}</h1>
          </div>
          {currentUser ? (
            <div className="userBadge">
              {currentUser.companyName || currentUser.email}
            </div>
          ) : null}
        </header>

        {message ? <div className="alert">{message}</div> : null}

        {!isAuthenticated ? (
          <form className="loginPanel" onSubmit={signIn}>
            <label>
              Email
              <input
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <label>
              Password
              <input
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            <button disabled={isLoading} type="submit">
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        ) : (
          <div className="grid">
            {activeSection === 'dashboard' ? (
              <section className="panel">
                <h2>Admin sections</h2>
                <p className="mutedText">
                  Use the sidebar to manage users, inspect tenders, or run tech
                  jobs.
                </p>
              </section>
            ) : null}

            {activeSection === 'users' ? (
              <section className="panel panelWide">
                <div className="panelHeader">
                  <div>
                    <h2>Users</h2>
                    <p>{usersTotal} total users</p>
                  </div>
                  <button
                    className="secondaryButton"
                    disabled={isLoading}
                    onClick={() => loadUsers(token)}
                  >
                    Refresh
                  </button>
                </div>
                <Table<AdminUser>
                  columns={userColumns}
                  dataSource={users}
                  loading={usersLoading}
                  onChange={handleUsersTableChange}
                  pagination={{
                    current: usersPage,
                    pageSize: usersPageSize,
                    showSizeChanger: true,
                    total: usersTotal,
                  }}
                  rowKey={(user) => user._id || user.email || 'unknown-user'}
                  scroll={{ x: 720 }}
                />
              </section>
            ) : null}

            {activeSection === 'tenders' ? (
              <section className="panel panelWide">
                <div className="panelHeader">
                  <div>
                    <h2>Tenders</h2>
                    <p>{tendersTotal} total tenders</p>
                  </div>
                  <button
                    className="secondaryButton"
                    disabled={isLoading}
                    onClick={() => loadTenders(token)}
                  >
                    Refresh
                  </button>
                </div>
                <Table<AdminTender>
                  columns={tenderColumns}
                  dataSource={tenders}
                  loading={tendersLoading}
                  onChange={handleTendersTableChange}
                  pagination={{
                    current: tendersPage,
                    pageSize: tendersPageSize,
                    showSizeChanger: true,
                    total: tendersTotal,
                  }}
                  rowKey={(tender) =>
                    tender._id ||
                    tender.id ||
                    tender.publicationNumber ||
                    'unknown-tender'
                  }
                  scroll={{ x: 1320 }}
                />
              </section>
            ) : null}

            {activeSection === 'tech' ? (
              <>
                <section className="panel panelWide">
                  <div className="panelHeader">
                    <div>
                      <h2>Full tender gathering</h2>
                      <p>Current gatherAllCompetitionTenders status.</p>
                    </div>
                    {gatherAllStatus ? (
                      <Tag color={gatherAllStatus.isRunning ? 'processing' : 'default'}>
                        {gatherAllStatus.isRunning ? 'RUNNING' : 'IDLE'}
                      </Tag>
                    ) : (
                      <Tag>UNKNOWN</Tag>
                    )}
                  </div>
                </section>

                <section className="panel panelWide">
                  <div className="panelHeader">
                    <div>
                      <h2>Cron jobs</h2>
                      <p>Run scheduled jobs manually from the admin panel.</p>
                    </div>
                  </div>

                  <div className="statusList">
                    {cronTasks.map((task) => {
                      const isRunning = Boolean(cronTaskLoadingById[task.id]);

                      return (
                        <div key={task.id}>
                          <span>
                            <strong>{task.title}</strong>
                            <small>{task.description}</small>
                            {task.id === 'gather-recent-competition-tenders' &&
                            recentCompetitionTendersCronStatus ? (
                              <small>
                                {recentCompetitionTendersCronStatus.noticesFetched}
                                /
                                {recentCompetitionTendersCronStatus.totalNoticeCount ??
                                  '?'}{' '}
                                notices, pages{' '}
                                {recentCompetitionTendersCronStatus.pagesFetched},
                                matches{' '}
                                {recentCompetitionTendersCronStatus.matchesSaved}
                              </small>
                            ) : null}
                            {task.id === 'gather-recent-award-tenders' &&
                            recentAwardTendersCronStatus ? (
                              <small>
                                {recentAwardTendersCronStatus.noticesFetched}/
                                {recentAwardTendersCronStatus.totalNoticeCount ??
                                  '?'}{' '}
                                notices, pages{' '}
                                {recentAwardTendersCronStatus.pagesFetched}
                              </small>
                            ) : null}
                            {task.scheduled && task.schedule ? (
                              <small>
                                Schedule:{' '}
                                {task.schedule.enabled ? 'enabled' : 'disabled'}
                                {task.schedule.persistedEnabled !== undefined
                                  ? ' (saved)'
                                  : ''}
                                {task.schedule.nextRunAt
                                  ? `, next ${new Date(
                                      task.schedule.nextRunAt,
                                    ).toLocaleString()}`
                                  : ''}
                              </small>
                            ) : null}
                          </span>
                          <div className="buttonGroup">
                            {task.scheduled && task.schedule ? (
                              <button
                                className={
                                  task.schedule.enabled
                                    ? 'secondaryButton dangerButton'
                                    : 'secondaryButton successButton'
                                }
                                disabled={isRunning}
                                onClick={() => toggleCronTask(task)}
                                type="button"
                              >
                                {task.schedule.enabled ? 'Disable' : 'Enable'}
                              </button>
                            ) : null}
                            <button
                              className="secondaryButton"
                              disabled={isRunning}
                              onClick={() => runCronTask(task)}
                              type="button"
                            >
                              {isRunning ? 'Running...' : 'Run'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {cronRunResult ? (
                    <pre className="jsonResult">
                      {JSON.stringify(cronRunResult, null, 2)}
                    </pre>
                  ) : null}
                </section>

                <section className="panel panelWide">
                  <div className="panelHeader">
                    <div>
                      <h2>Mongo indexes</h2>
                      <p>Create missing indexes declared in Mongoose schemas.</p>
                    </div>
                    <button
                      disabled={syncIndexesLoading || syncIndexesStatus?.isRunning}
                      onClick={syncMongoIndexes}
                      type="button"
                    >
                      {syncIndexesLoading || syncIndexesStatus?.isRunning
                        ? 'Syncing indexes...'
                        : 'Sync indexes'}
                    </button>
                  </div>

                  {syncIndexesStatus ? (
                    <>
                      <Progress
                        percent={
                          syncIndexesStatus.totalModels > 0
                            ? Math.round(
                                (syncIndexesStatus.processedModels /
                                  syncIndexesStatus.totalModels) *
                                  100,
                              )
                            : 0
                        }
                        status={
                          syncIndexesStatus.errors.length ||
                          syncIndexesStatus.lastError
                            ? 'exception'
                            : syncIndexesStatus.isRunning
                              ? 'active'
                              : 'success'
                        }
                      />
                      <dl className="stats">
                        <div>
                          <dt>Models</dt>
                          <dd>
                            {syncIndexesStatus.processedModels}/
                            {syncIndexesStatus.totalModels}
                          </dd>
                        </div>
                        <div>
                          <dt>Current model</dt>
                          <dd className="smallStat">
                            {syncIndexesStatus.currentModel ?? '-'}
                          </dd>
                        </div>
                        <div>
                          <dt>Errors</dt>
                          <dd>{syncIndexesStatus.errors.length}</dd>
                        </div>
                      </dl>
                      {syncIndexesStatus.errors.length ? (
                        <div className="errorList">
                          {syncIndexesStatus.errors.slice(0, 8).map((error) => (
                            <div key={`${error.model}-${error.message}`}>
                              <strong>{error.model}</strong>: {error.message}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </section>

                <section className="panel panelWide">
                  <div className="panelHeader">
                    <div>
                      <h2>Tender history refresh</h2>
                      <p>
                        Run TED history jobs for competition tenders and award
                        result notices.
                      </p>
                    </div>
                    <div className="buttonGroup">
                      <label>
                        Competition page limit
                        <input
                          min="1"
                          onChange={(event) =>
                            setGatherAllCompetitionPageLimit(event.target.value)
                          }
                          type="number"
                          value={gatherAllCompetitionPageLimit}
                        />
                      </label>
                      <button
                        disabled={
                          gatherAllCompetitionLoading ||
                          Boolean(gatherAllStatus?.isRunning)
                        }
                        onClick={gatherAllCompetitionTenders}
                        type="button"
                      >
                        {gatherAllCompetitionLoading ||
                        gatherAllStatus?.isRunning
                          ? 'Gathering competition...'
                          : 'Gather all competition'}
                      </button>
                      <label>
                        Awards page limit
                        <input
                          min="1"
                          onChange={(event) =>
                            setAwardTendersRefreshPageLimit(event.target.value)
                          }
                          type="number"
                          value={awardTendersRefreshPageLimit}
                        />
                      </label>
                      <button
                        className="secondaryButton"
                        disabled={awardTendersRefreshLoading}
                        onClick={refreshAwardTendersHistory}
                        type="button"
                      >
                        {awardTendersRefreshLoading
                          ? 'Refreshing awards...'
                          : 'Refresh award tenders'}
                      </button>
                    </div>
                  </div>

                  <div className="statusList">
                    <div>
                      <span>Competition gathering</span>
                      <Tag
                        color={
                          gatherAllCompetitionLoading ||
                          gatherAllStatus?.isRunning
                            ? 'processing'
                            : 'default'
                        }
                      >
                        {gatherAllCompetitionLoading ||
                        gatherAllStatus?.isRunning
                          ? 'RUNNING'
                          : 'IDLE'}
                      </Tag>
                    </div>
                    <div>
                      <span>Award tender refresh</span>
                      <Tag
                        color={
                          awardTendersRefreshLoading ||
                          awardTendersRefreshResult?.isRunning
                            ? 'processing'
                            : 'default'
                        }
                      >
                        {awardTendersRefreshLoading ||
                        awardTendersRefreshResult?.isRunning
                          ? 'RUNNING'
                          : 'IDLE'}
                      </Tag>
                    </div>
                  </div>

                  {gatherAllStatus ? (
                    <dl className="stats">
                      <div>
                        <dt>Competition notices</dt>
                        <dd>
                          {gatherAllStatus.noticesFetched}/
                          {gatherAllStatus.totalNoticeCount ?? '?'}
                        </dd>
                      </div>
                      <div>
                        <dt>Competition pages</dt>
                        <dd>{gatherAllStatus.pagesFetched}</dd>
                      </div>
                      <div>
                        <dt>Competition started</dt>
                        <dd className="smallStat">
                          {gatherAllStatus.startedAt
                            ? new Date(gatherAllStatus.startedAt).toLocaleString()
                            : '-'}
                        </dd>
                      </div>
                      {gatherAllStatus.lastError ? (
                        <div>
                          <dt>Competition error</dt>
                          <dd className="smallStat">
                            {gatherAllStatus.lastError}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}

                  {awardTendersRefreshResult ? (
                    <dl className="stats">
                      <div>
                        <dt>Award refresh notices</dt>
                        <dd>
                          {awardTendersRefreshResult.noticesFetched}/
                          {awardTendersRefreshResult.totalNoticeCount ?? '?'}
                        </dd>
                      </div>
                      <div>
                        <dt>Award refresh pages</dt>
                        <dd>{awardTendersRefreshResult.pagesFetched}</dd>
                      </div>
                      <div>
                        <dt>Award refresh started</dt>
                        <dd className="smallStat">
                          {awardTendersRefreshResult.startedAt
                            ? new Date(
                                awardTendersRefreshResult.startedAt,
                              ).toLocaleString()
                            : '-'}
                        </dd>
                      </div>
                      {awardTendersRefreshResult.lastError ? (
                        <div>
                          <dt>Award refresh error</dt>
                          <dd className="smallStat">
                            {awardTendersRefreshResult.lastError}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                </section>

                <section className="panel panelWide">
                  <div className="panelHeader">
                    <div>
                      <h2>Buyer collection</h2>
                      <p>
                        Backfill buyer references and buyer aggregate metadata
                        from saved tender and award tender notices.
                      </p>
                    </div>
                    <div className="buttonGroup">
                      <button
                        disabled={collectTenderBuyersLoading}
                        onClick={collectBuyersFromTenders}
                        type="button"
                      >
                        {collectTenderBuyersLoading
                          ? 'Collecting tenders...'
                          : 'Collect tender buyers'}
                      </button>
                      <button
                        className="secondaryButton"
                        disabled={collectAwardBuyersLoading}
                        onClick={collectBuyersFromAwardTenders}
                        type="button"
                      >
                        {collectAwardBuyersLoading
                          ? 'Collecting awards...'
                          : 'Collect award buyers'}
                      </button>
                    </div>
                  </div>

                  <div className="statusList">
                    <div>
                      <span>Tender buyers</span>
                      <Tag
                        color={
                          collectTenderBuyersLoading ||
                          collectTenderBuyersResult?.isRunning
                            ? 'processing'
                            : 'default'
                        }
                      >
                        {collectTenderBuyersLoading ||
                        collectTenderBuyersResult?.isRunning
                          ? 'RUNNING'
                          : 'IDLE'}
                      </Tag>
                    </div>
                    <div>
                      <span>Award tender buyers</span>
                      <Tag
                        color={
                          collectAwardBuyersLoading ||
                          collectAwardBuyersResult?.isRunning
                            ? 'processing'
                            : 'default'
                        }
                      >
                        {collectAwardBuyersLoading ||
                        collectAwardBuyersResult?.isRunning
                          ? 'RUNNING'
                          : 'IDLE'}
                      </Tag>
                    </div>
                  </div>

                  {collectTenderBuyersResult ? (
                    <dl className="stats">
                      <div>
                        <dt>Status</dt>
                        <dd>
                          {collectTenderBuyersResult.isRunning
                            ? 'Running'
                            : 'Idle'}
                        </dd>
                      </div>
                      <div>
                        <dt>Processed tenders</dt>
                        <dd>
                          {collectTenderBuyersResult.processedTenders}/
                          {collectTenderBuyersResult.totalTenders}
                        </dd>
                      </div>
                      <div>
                        <dt>TED notices</dt>
                        <dd>{collectTenderBuyersResult.noticesFetched}</dd>
                      </div>
                      <div>
                        <dt>Processed notices</dt>
                        <dd>{collectTenderBuyersResult.processedNotices}</dd>
                      </div>
                      <div>
                        <dt>Updated tenders</dt>
                        <dd>{collectTenderBuyersResult.updatedTenders}</dd>
                      </div>
                      <div>
                        <dt>Errors</dt>
                        <dd>{collectTenderBuyersResult.errors}</dd>
                      </div>
                      <div>
                        <dt>Failed chunks</dt>
                        <dd>{collectTenderBuyersResult.failedChunks}</dd>
                      </div>
                      <div>
                        <dt>Started</dt>
                        <dd className="smallStat">
                          {collectTenderBuyersResult.startedAt
                            ? new Date(
                                collectTenderBuyersResult.startedAt,
                              ).toLocaleString()
                            : '-'}
                        </dd>
                      </div>
                      <div>
                        <dt>Finished</dt>
                        <dd className="smallStat">
                          {collectTenderBuyersResult.finishedAt
                            ? new Date(
                                collectTenderBuyersResult.finishedAt,
                              ).toLocaleString()
                            : '-'}
                        </dd>
                      </div>
                      {collectTenderBuyersResult.lastError ? (
                        <div>
                          <dt>Last error</dt>
                          <dd className="smallStat">
                            {collectTenderBuyersResult.lastError}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}

                  {collectAwardBuyersResult ? (
                    <dl className="stats">
                      <div>
                        <dt>Award status</dt>
                        <dd>
                          {collectAwardBuyersResult.isRunning
                            ? 'Running'
                            : 'Idle'}
                        </dd>
                      </div>
                      <div>
                        <dt>Processed award tenders</dt>
                        <dd>
                          {collectAwardBuyersResult.processedAwardTenders}/
                          {collectAwardBuyersResult.totalAwardTenders}
                        </dd>
                      </div>
                      <div>
                        <dt>Award TED notices</dt>
                        <dd>{collectAwardBuyersResult.noticesFetched}</dd>
                      </div>
                      <div>
                        <dt>Award processed notices</dt>
                        <dd>{collectAwardBuyersResult.processedNotices}</dd>
                      </div>
                      <div>
                        <dt>Updated award tenders</dt>
                        <dd>{collectAwardBuyersResult.updatedAwardTenders}</dd>
                      </div>
                      <div>
                        <dt>Award errors</dt>
                        <dd>{collectAwardBuyersResult.errors}</dd>
                      </div>
                      <div>
                        <dt>Award failed chunks</dt>
                        <dd>{collectAwardBuyersResult.failedChunks}</dd>
                      </div>
                      <div>
                        <dt>Award started</dt>
                        <dd className="smallStat">
                          {collectAwardBuyersResult.startedAt
                            ? new Date(
                                collectAwardBuyersResult.startedAt,
                              ).toLocaleString()
                            : '-'}
                        </dd>
                      </div>
                      <div>
                        <dt>Award finished</dt>
                        <dd className="smallStat">
                          {collectAwardBuyersResult.finishedAt
                            ? new Date(
                                collectAwardBuyersResult.finishedAt,
                              ).toLocaleString()
                            : '-'}
                        </dd>
                      </div>
                      {collectAwardBuyersResult.lastError ? (
                        <div>
                          <dt>Award last error</dt>
                          <dd className="smallStat">
                            {collectAwardBuyersResult.lastError}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                </section>

                <section className="panel panelWide">
                  <div className="panelHeader">
                    <div>
                      <h2>Tender short titles</h2>
                      <p>
                        Generate missing AI short titles for tenders in EN, DE,
                        FR, PL, and RU.
                      </p>
                    </div>
                    <button
                      className="secondaryButton"
                      onClick={downloadTenderShortTitles}
                      type="button"
                    >
                      Download JSON
                    </button>
                  </div>

                  <form
                    className="techForm techFormCompact"
                    onSubmit={generateShortTitles}
                  >
                    <label>
                      Limit
                      <input
                        min="1"
                        onChange={(event) =>
                          setShortTitlesLimit(event.target.value)
                        }
                        type="number"
                        value={shortTitlesLimit}
                      />
                    </label>
                    <label>
                      Batch size
                      <input
                        max="100"
                        min="1"
                        onChange={(event) =>
                          setShortTitlesBatchSize(event.target.value)
                        }
                        type="number"
                        value={shortTitlesBatchSize}
                      />
                    </label>
                    <button disabled={shortTitlesLoading} type="submit">
                      {shortTitlesLoading
                        ? 'Generating...'
                        : 'Generate short titles'}
                    </button>
                  </form>

                  {shortTitlesResult ? (
                    <dl className="stats">
                      <div>
                        <dt>Matched</dt>
                        <dd>{shortTitlesResult.matchedCount}</dd>
                      </div>
                      <div>
                        <dt>Updated</dt>
                        <dd>{shortTitlesResult.updatedCount}</dd>
                      </div>
                      <div>
                        <dt>Failed</dt>
                        <dd>{shortTitlesResult.failedCount}</dd>
                      </div>
                      <div>
                        <dt>Batch size</dt>
                        <dd>{shortTitlesResult.batchSize}</dd>
                      </div>
                    </dl>
                  ) : null}

                  {shortTitlesResult?.errors.length ? (
                    <div className="errorList">
                      {shortTitlesResult.errors.slice(0, 10).map((error) => (
                        <div key={`${error.id}-${error.message}`}>
                          <strong>{error.id}</strong>: {error.message}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>

                <section className="panel panelWide">
                  <div className="panelHeader">
                    <div>
                      <h2>Database dump copy</h2>
                      <p>
                        Create a MongoDB dump and upload it to CDN using the
                        configured backup prefix.
                      </p>
                    </div>
                    <button
                      disabled={dbCopyLoading}
                      onClick={copyDatabaseDumpToCdn}
                      type="button"
                    >
                      {dbCopyLoading ? 'Copying...' : 'Copy database dump'}
                    </button>
                  </div>

                  {dbCopyResult ? (
                    <dl className="stats">
                      <div>
                        <dt>File</dt>
                        <dd className="smallStat">{dbCopyResult.filename}</dd>
                      </div>
                      <div>
                        <dt>Deleted old copies</dt>
                        <dd>{dbCopyResult.deletedCount}</dd>
                      </div>
                      <div>
                        <dt>URL</dt>
                        <dd className="smallStat">
                          <a
                            href={dbCopyResult.url}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {dbCopyResult.url}
                          </a>
                        </dd>
                      </div>
                    </dl>
                  ) : null}
                </section>

                <section className="panel panelWide">
                  <div className="panelHeader">
                    <div>
                      <h2>Tender sitemap</h2>
                      <p>
                        Generate a sitemap file from all saved tenders. Domain
                        and languages are passed to the backend as request
                        parameters.
                      </p>
                    </div>
                  </div>

                  <form
                    className="techForm techFormSitemap"
                    onSubmit={generateSitemap}
                  >
                    <label>
                      Domain
                      <input
                        onChange={(event) =>
                          setSitemapDomain(event.target.value)
                        }
                        placeholder="https://example.com"
                        required
                        type="url"
                        value={sitemapDomain}
                      />
                    </label>
                    <label>
                      Languages
                      <input
                        onChange={(event) =>
                          setSitemapLocales(event.target.value)
                        }
                        placeholder="en,pl,de"
                        required
                        value={sitemapLocales}
                      />
                    </label>
                    <label>
                      URLs per file
                      <input
                        max="50000"
                        min="1"
                        onChange={(event) =>
                          setSitemapMaxUrlsPerFile(event.target.value)
                        }
                        required
                        type="number"
                        value={sitemapMaxUrlsPerFile}
                      />
                    </label>
                    <button disabled={sitemapLoading} type="submit">
                      {sitemapLoading ? 'Generating...' : 'Generate sitemap'}
                    </button>
                  </form>

                  {sitemapResult ? (
                    <>
                      <button
                        className="secondaryButton"
                        onClick={() => downloadSitemap()}
                      >
                        Download sitemap
                      </button>
                      {sitemapResult.sitemapFiles.length > 1 ? (
                        <div className="sitemapFiles">
                          {sitemapResult.sitemapFiles.map((file) => (
                            <button
                              className="secondaryButton"
                              key={file.filename}
                              onClick={() => downloadSitemap(file)}
                            >
                              Download {file.filename}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <dl className="stats">
                        <div>
                          <dt>File</dt>
                          <dd className="smallStat">
                            {sitemapResult.outputPath}
                          </dd>
                        </div>
                        <div>
                          <dt>Domain</dt>
                          <dd className="smallStat">{sitemapResult.domain}</dd>
                        </div>
                        <div>
                          <dt>Languages</dt>
                          <dd>{sitemapResult.locales.join(', ')}</dd>
                        </div>
                        <div>
                          <dt>URLs</dt>
                          <dd>{sitemapResult.urlsCount}</dd>
                        </div>
                        <div>
                          <dt>URLs per file</dt>
                          <dd>{sitemapResult.maxUrlsPerFile}</dd>
                        </div>
                        <div>
                          <dt>Sitemap files</dt>
                          <dd>
                            {sitemapResult.sitemapFilesCount}
                            {sitemapResult.isSitemapIndex ? ' + index' : ''}
                          </dd>
                        </div>
                        <div>
                          <dt>Tenders</dt>
                          <dd>{sitemapResult.tendersCount}</dd>
                        </div>
                        <div>
                          <dt>Industries</dt>
                          <dd>{sitemapResult.industriesCount}</dd>
                        </div>
                        <div>
                          <dt>Countries</dt>
                          <dd>{sitemapResult.countriesCount}</dd>
                        </div>
                      </dl>
                    </>
                  ) : null}
                </section>
              </>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}

function formatDate(value?: string) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatEstimatedValue(tender: AdminTender) {
  const amount = tender.estimatedValue?.amount;
  const currency = tender.estimatedValue?.currency;

  if (typeof amount === 'number' && currency) {
    return `${amount.toLocaleString('en')} ${currency}`;
  }

  if (typeof tender.estimatedValueEur === 'number') {
    return `${tender.estimatedValueEur.toLocaleString('en')} EUR`;
  }

  return '-';
}
