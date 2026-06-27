'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Table, Tag } from 'antd';
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

type GatherAllCompetitionTendersStatus = {
  isRunning: boolean;
};

const tokenStorageKey = 'ted-admin-token';

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
  const [collectTenderBuyersLoading, setCollectTenderBuyersLoading] =
    useState(false);
  const [collectAwardBuyersLoading, setCollectAwardBuyersLoading] =
    useState(false);
  const [gatherAllStatus, setGatherAllStatus] =
    useState<GatherAllCompetitionTendersStatus | null>(null);
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
    const interval = window.setInterval(
      () => void loadGatherAllStatus(token),
      5000,
    );

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

  async function collectBuyersFromTenders() {
    const confirmed = window.confirm(
      'Start buyer collection for all saved tenders? This can take a long time.',
    );

    if (!confirmed) {
      return;
    }

    setCollectTenderBuyersLoading(true);
    setMessage('');

    try {
      await request('/adm/tech/buyers/collect', {
        method: 'POST',
        token,
      });

      setMessage('Tender buyer collection finished.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Failed to collect buyers from tenders',
      );
    } finally {
      setCollectTenderBuyersLoading(false);
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
    setMessage('');

    try {
      await request('/adm/tech/buyers/collect-awards', {
        method: 'POST',
        token,
      });

      setMessage('Award tender buyer collection finished.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Failed to collect buyers from award tenders',
      );
    } finally {
      setCollectAwardBuyersLoading(false);
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
                          collectTenderBuyersLoading ? 'processing' : 'default'
                        }
                      >
                        {collectTenderBuyersLoading ? 'RUNNING' : 'IDLE'}
                      </Tag>
                    </div>
                    <div>
                      <span>Award tender buyers</span>
                      <Tag
                        color={
                          collectAwardBuyersLoading
                            ? 'processing'
                            : 'default'
                        }
                      >
                        {collectAwardBuyersLoading ? 'RUNNING' : 'IDLE'}
                      </Tag>
                    </div>
                  </div>
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
