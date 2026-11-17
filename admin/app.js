(function () {
  'use strict';

  var TOKEN_KEY = 'ted-admin-token';

  var defaultCronTasks = [
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
    {
      id: 'gather-pl-bzp-tenders',
      title: 'Gather Poland (BZP) tenders',
      description: 'Collect new contract notices and deadline changes from BZP.',
    },
  ];

  var state = {
    token: '',
    currentUser: null,
    section: 'dashboard',
    message: '',
    isLoading: false,

    email: '',
    password: '',

    users: [],
    usersTotal: 0,
    usersPage: 1,
    usersPageSize: 20,
    usersLoading: false,
    usersSortKey: null,
    usersSortDir: 'asc',

    tenders: [],
    tendersTotal: 0,
    tendersPage: 1,
    tendersPageSize: 20,
    tendersLoading: false,

    sitemapDomain: '',
    sitemapLocales: 'en',
    sitemapMaxUrlsPerFile: '40000',
    sitemapResult: null,
    sitemapLoading: false,

    shortTitlesLimit: '100',
    shortTitlesBatchSize: '20',
    shortTitlesResult: null,
    shortTitlesLoading: false,

    generalAnalysesLimit: '100',
    generalAnalysesBatchSize: '100',
    generalAnalysesResult: null,
    generalAnalysisStatus: null,
    generalAnalysesLoading: false,

    fixAwardCriteriaBatchSize: '100',
    fixAwardCriteriaDryRun: true,
    fixAwardCriteriaResult: null,
    fixAwardCriteriaLoading: false,

    dbCopyResult: null,
    dbCopyLoading: false,

    syncIndexesLoading: false,
    syncIndexesStatus: null,
    forceRebuildIndexes: false,

    collectTenderBuyersLoading: false,
    collectTenderBuyersResult: null,

    contractorStatsRefreshLoading: false,
    contractorStatsRefreshResult: null,

    gatherAllCompetitionPageLimit: '70',
    gatherAllCompetitionLoading: false,
    gatherAllStatus: null,

    awardTendersRefreshPageLimit: '50',
    skipExistingAwardTendersByPublicationNumber: true,
    awardTendersRefreshLoading: false,
    awardTendersRefreshResult: null,

    awardValuesFixRefetchXml: false,
    awardValuesFixLoading: false,
    awardDatesBackfillLoading: false,
    awardCountriesBackfillLoading: false,
    awardValuesFixStatus: null,

    awardValueReviewMinM: '100',
    awardValueReviewLimit: '',
    awardValueReviewRecheck: false,
    awardValueReviewLoading: false,
    awardValueReviewStatus: null,
    awardValueReviewFilter: 'pending',
    awardValueReviewItems: null,
    awardValueReviewCounts: {},
    awardValueReviewBusy: false,

    cronTaskLoadingById: {},
    cronTasks: defaultCronTasks.slice(),
    cronRunResult: null,
    recentCompetitionTendersCronStatus: null,
    recentAwardTendersCronStatus: null,
    plBzpCronStatus: null,
  };

  var X_POST_PILLARS = [
    ['interesting_tender', '🔥 Interesting Tender'],
    ['market_insight', '📊 Market Insight'],
    ['contract_award', '🏆 Contract Award'],
    ['procurement_insight', '💡 Procurement Insight'],
    ['historical_story', '📜 Historical Story'],
  ];

  // Story angles are a second level within a pillar (how it's told, not what
  // it's about). Only Contract Award has one implemented today.
  var X_POST_STORY_ANGLES_BY_PILLAR = {
    contract_award: [
      ['auto', 'Auto'],
      ['company_story', 'Company Story'],
    ],
  };

  Object.assign(state, {
    xPosts: [],
    xPostsTotal: 0,
    xPostsPage: 1,
    xPostsPageSize: 20,
    xPostsLoading: false,
    xPostsStatusFilter: '',
    xPostsPillarFilter: '',

    xPostTopic: '',
    xPostPillar: X_POST_PILLARS[0][0],
    xPostStoryAngle: 'auto',
    xPostFormat: 'single',
    xPostTone: '',
    xPostNotes: '',
    xPostGenerateLoading: false,

    xPostEditingId: null,
    xPostEditPosts: '',
    xPostEditHashtags: '',
    xPostEditNotes: '',
    xPostEditStatus: '',
    xPostEditSaving: false,

    xPostImageLoadingById: {},
  });

  var MARKETING_TASK_CATEGORIES = [
    ['ctr', 'CTR / snippet'],
    ['content', 'Content'],
    ['content_gap', 'Content gap'],
    ['technical', 'Technical'],
    ['conversion', 'Conversion'],
    ['traffic_drop', 'Traffic drop'],
    ['tracking', 'Tracking'],
    ['cannibalization', 'Cannibalization'],
    ['internal_linking', 'Internal linking'],
  ];
  var MARKETING_TASK_STATUSES = ['new', 'in_progress', 'done', 'rejected'];
  var MARKETING_TASK_PRIORITIES = ['high', 'medium', 'low'];

  Object.assign(state, {
    // status -> tasks shown in that board column / total tasks with that status
    marketingBoard: {},
    marketingBoardTotals: {},
    marketingTasksLoading: false,
    marketingTasksPriorityFilter: '',
    marketingTasksCategoryFilter: '',

    marketingGenerateDays: '28',
    marketingGenerateMaxTasks: '10',
    marketingGenerateLanguage: 'ru',
    marketingGenerateLoading: false,
    marketingGenerateResult: null,

    marketingNewTitle: '',
    marketingNewDescription: '',
    marketingNewCategory: MARKETING_TASK_CATEGORIES[0][0],
    marketingNewPriority: 'medium',
    marketingNewPageUrl: '',
    marketingNewQuery: '',
    marketingCreateLoading: false,

    // task page (/admin/marketing-tasks/:id)
    marketingTaskId: null,
    marketingTask: null,
    marketingTaskLoading: false,
    marketingCommentDraft: '',
    marketingCommentSaving: false,
    marketingCheckLoading: false,
    marketingCheckDays: '14',

    marketingEditing: false,
    marketingEditTitle: '',
    marketingEditDescription: '',
    marketingEditNotes: '',
    marketingEditSaving: false,
  });

  var pollHandle = null;

  // ---------------- utils ----------------

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(value) {
    if (!value) return '-';
    var date = new Date(value);
    if (isNaN(date.getTime())) return escapeHtml(value);
    return date.toLocaleDateString('en', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  function fmtDateTime(value) {
    if (!value) return '-';
    var date = new Date(value);
    if (isNaN(date.getTime())) return escapeHtml(value);
    return date.toLocaleString();
  }

  function formatEstimatedValue(tender) {
    var amount = tender.estimatedValue && tender.estimatedValue.amount;
    var currency = tender.estimatedValue && tender.estimatedValue.currency;

    if (typeof amount === 'number' && currency) {
      return amount.toLocaleString('en') + ' ' + currency;
    }

    if (typeof tender.estimatedValueEur === 'number') {
      return tender.estimatedValueEur.toLocaleString('en') + ' EUR';
    }

    return '-';
  }

  function statsHtml(pairs) {
    return (
      '<dl class="stats">' +
      pairs
        .map(function (p) {
          var cls = p[2] ? ' class="' + p[2] + '"' : '';
          var value = p[1] === null || p[1] === undefined ? '-' : p[1];
          return '<div><dt>' + escapeHtml(p[0]) + '</dt><dd' + cls + '>' + value + '</dd></div>';
        })
        .join('') +
      '</dl>'
    );
  }

  function tagHtml(text, variant) {
    return '<span class="tag tag-' + (variant || 'default') + '">' + escapeHtml(text) + '</span>';
  }

  function errorListHtml(errors) {
    if (!errors || !errors.length) return '';
    return (
      '<div class="errorList">' +
      errors
        .slice(0, 10)
        .map(function (e) {
          return '<div><strong>' + escapeHtml(e.id || e.model || '') + '</strong>: ' + escapeHtml(e.message || '') + '</div>';
        })
        .join('') +
      '</div>'
    );
  }

  function progressBarHtml(percent, status) {
    var cls = status === 'exception' ? 'exception' : status === 'success' ? 'success' : '';
    var clamped = Math.max(0, Math.min(100, percent || 0));
    return '<div class="progressBar ' + cls + '"><div style="width:' + clamped + '%"></div></div>';
  }

  // ---------------- api ----------------

  function getApiUrl(path) {
    if (window.ADMIN_API_ORIGIN) return window.ADMIN_API_ORIGIN + path;
    return path;
  }

  function apiError(message, status) {
    var err = new Error(message);
    err.status = status;
    return err;
  }

  function request(path, options) {
    options = options || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    if (options.token) headers.Authorization = 'Bearer ' + options.token;

    return fetch(getApiUrl(path), Object.assign({}, options, { headers: headers })).then(function (response) {
      return response.text().then(function (text) {
        if (!response.ok) {
          var message = text;
          try {
            var parsedError = JSON.parse(text);
            if (parsedError && typeof parsedError.message === 'string') message = parsedError.message;
            else if (parsedError && Array.isArray(parsedError.message)) message = parsedError.message.join(', ');
          } catch (e) {}
          throw apiError(message, response.status);
        }
        if (!text) return undefined;
        try {
          return JSON.parse(text);
        } catch (e) {
          return text;
        }
      });
    });
  }

  function downloadBlob(url, filename) {
    return fetch(getApiUrl(url), { headers: { Authorization: 'Bearer ' + state.token } })
      .then(function (response) {
        if (!response.ok) {
          return response.text().then(function (t) {
            throw new Error(t);
          });
        }
        return response.blob();
      })
      .then(function (blob) {
        var objectUrl = window.URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(objectUrl);
      });
  }

  // ---------------- rendering ----------------

  function render() {
    var root = byId('app');
    if (!root) return;
    root.innerHTML = shellHtml();
  }

  function shellHtml() {
    var isAuth = Boolean(state.token);
    var pageTitle = !isAuth
      ? 'Admin sign in'
      : state.section === 'users'
        ? 'Users'
        : state.section === 'tenders'
          ? 'Tenders'
          : state.section === 'tech'
            ? 'Tech'
            : state.section === 'cron'
            ? 'Cron'
            : state.section === 'x-posts'
              ? 'X Posts'
              : state.section === 'marketing-tasks'
                ? 'Marketing Tasks'
                : 'Dashboard';

    return (
      '<main class="shell">' +
      '<aside class="sidebar">' +
      '<div>' +
      '<div class="brand">TED Admin</div>' +
      '<nav class="nav">' +
      navLinkHtml('/admin', 'Dashboard', 'dashboard') +
      navLinkHtml('/admin/users', 'Users', 'users') +
      navLinkHtml('/admin/tenders', 'Tenders', 'tenders') +
      navLinkHtml('/admin/tech', 'Tech', 'tech') +
      navLinkHtml('/admin/cron', 'Cron', 'cron') +
      navLinkHtml('/admin/x-posts', 'X Posts', 'x-posts') +
      navLinkHtml('/admin/marketing-tasks', 'Marketing Tasks', 'marketing-tasks') +
      '</nav>' +
      '</div>' +
      (isAuth ? '<button class="secondaryButton" onclick="Admin.signOut()" type="button">Sign out</button>' : '') +
      '</aside>' +
      '<section class="content">' +
      '<header class="header">' +
      '<div><p class="eyebrow">Administration</p><h1>' +
      escapeHtml(pageTitle) +
      '</h1></div>' +
      (state.currentUser
        ? '<div class="userBadge">' + escapeHtml(state.currentUser.companyName || state.currentUser.email || '') + '</div>'
        : '') +
      '</header>' +
      (state.message ? '<div class="alert">' + escapeHtml(state.message) + '</div>' : '') +
      (!isAuth ? loginPanelHtml() : sectionHtml()) +
      '</section>' +
      '</main>'
    );
  }

  function navLinkHtml(href, label, key) {
    var cls = state.section === key ? ' class="active"' : '';
    return '<a href="' + href + '"' + cls + ' onclick="return Admin.navigate(event, \'' + href + '\')">' + escapeHtml(label) + '</a>';
  }

  function loginPanelHtml() {
    return (
      '<form class="loginPanel" onsubmit="return Admin.signIn(event)">' +
      '<label>Email<input autocomplete="email" required type="email" value="' +
      escapeHtml(state.email) +
      '" oninput="Admin.setField(\'email\', this.value)"></label>' +
      '<label>Password<input autocomplete="current-password" required type="password" value="' +
      escapeHtml(state.password) +
      '" oninput="Admin.setField(\'password\', this.value)"></label>' +
      '<button ' +
      (state.isLoading ? 'disabled' : '') +
      ' type="submit">' +
      (state.isLoading ? 'Signing in...' : 'Sign in') +
      '</button>' +
      '</form>'
    );
  }

  function sectionHtml() {
    var inner;
    if (state.section === 'users') inner = usersSectionHtml();
    else if (state.section === 'tenders') inner = tendersSectionHtml();
    else if (state.section === 'tech') inner = techSectionHtml();
    else if (state.section === 'cron') inner = cronSectionHtml();
    else if (state.section === 'x-posts') inner = xPostsSectionHtml();
    else if (state.section === 'marketing-tasks') inner = marketingTasksSectionHtml();
    else inner = dashboardSectionHtml();
    return '<div class="grid">' + inner + '</div>';
  }

  function dashboardSectionHtml() {
    return (
      '<section class="panel"><h2>Admin sections</h2>' +
      '<p class="mutedText">Use the sidebar to manage users, inspect tenders, or run tech jobs.</p></section>'
    );
  }

  // ---- users ----

  function sortedUsers() {
    var rows = state.users.slice();
    if (!state.usersSortKey) return rows;
    var key = state.usersSortKey;
    var dir = state.usersSortDir === 'asc' ? 1 : -1;
    rows.sort(function (a, b) {
      return String(a[key] || '').localeCompare(String(b[key] || '')) * dir;
    });
    return rows;
  }

  function sortableTh(label, key, sortKey, sortDir) {
    var arrow = '';
    if (sortKey === key) arrow = '<span class="sortArrow">' + (sortDir === 'asc' ? '▲' : '▼') + '</span>';
    return '<th class="sortable" onclick="Admin.toggleUsersSort(\'' + key + '\')">' + escapeHtml(label) + arrow + '</th>';
  }

  function usersSectionHtml() {
    var rows = sortedUsers();
    var bodyRows = rows
      .map(function (u) {
        return (
          '<tr>' +
          '<td>' + escapeHtml(u.companyName || 'Unnamed company') + '</td>' +
          '<td>' + escapeHtml(u.email || '-') + '</td>' +
          '<td>' + (u.status ? tagHtml(u.status, 'blue') : tagHtml('unknown')) + '</td>' +
          '<td>' + escapeHtml(u._id || '-') + '</td>' +
          '</tr>'
        );
      })
      .join('');

    return (
      '<section class="panel panelWide">' +
      '<div class="panelHeader"><div><h2>Users</h2><p>' +
      state.usersTotal +
      ' total users</p></div>' +
      '<button class="secondaryButton" ' +
      (state.usersLoading ? 'disabled' : '') +
      ' onclick="Admin.loadUsers()" type="button">Refresh</button></div>' +
      '<div class="tableWrap"><table class="dataTable"><thead><tr>' +
      sortableTh('Company', 'companyName', state.usersSortKey, state.usersSortDir) +
      sortableTh('Email', 'email', state.usersSortKey, state.usersSortDir) +
      '<th>Status</th>' +
      '<th>ID</th>' +
      '</tr></thead><tbody>' +
      (bodyRows || '<tr><td colspan="4" class="tableEmpty">No users</td></tr>') +
      '</tbody></table></div>' +
      paginationHtml('users', state.usersPage, state.usersPageSize, state.usersTotal) +
      '</section>'
    );
  }

  // ---- tenders ----

  function tendersSectionHtml() {
    var rows = state.tenders
      .map(function (t) {
        return (
          '<tr>' +
          '<td class="wrapCell">' + escapeHtml(t.title || 'Untitled tender') + '</td>' +
          '<td>' + escapeHtml(t.publicationNumber || t.id || '-') + '</td>' +
          '<td>' + escapeHtml(t.buyerName || '-') + '</td>' +
          '<td>' + escapeHtml(t.buyerCountry || '-') + '</td>' +
          '<td>' + formatDate(t.publicationDate) + '</td>' +
          '<td>' + formatDate(t.submissionDeadline) + '</td>' +
          '<td>' + escapeHtml(formatEstimatedValue(t)) + '</td>' +
          '</tr>'
        );
      })
      .join('');

    return (
      '<section class="panel panelWide">' +
      '<div class="panelHeader"><div><h2>Tenders</h2><p>' +
      state.tendersTotal +
      ' total tenders</p></div>' +
      '<button class="secondaryButton" ' +
      (state.tendersLoading ? 'disabled' : '') +
      ' onclick="Admin.loadTenders()" type="button">Refresh</button></div>' +
      '<div class="tableWrap"><table class="dataTable"><thead><tr>' +
      '<th>Title</th><th>Publication</th><th>Buyer</th><th>Country</th><th>Published</th><th>Deadline</th><th>Value</th>' +
      '</tr></thead><tbody>' +
      (rows || '<tr><td colspan="7" class="tableEmpty">No tenders</td></tr>') +
      '</tbody></table></div>' +
      paginationHtml('tenders', state.tendersPage, state.tendersPageSize, state.tendersTotal) +
      '</section>'
    );
  }

  function paginationHtml(prefix, page, pageSize, total) {
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    return (
      '<div class="tableFooter">' +
      '<div class="pageInfo">Page ' + page + ' of ' + totalPages + ' (' + total + ' total)</div>' +
      '<div class="pagination">' +
      '<select class="pageSizeSelect" onchange="Admin.changePageSize(\'' + prefix + '\', this.value)">' +
      [10, 20, 50, 100]
        .map(function (size) {
          return '<option value="' + size + '"' + (size === pageSize ? ' selected' : '') + '>' + size + ' / page</option>';
        })
        .join('') +
      '</select>' +
      '<button ' + (page <= 1 ? 'disabled' : '') + ' onclick="Admin.changePage(\'' + prefix + '\', ' + (page - 1) + ')" type="button">Prev</button>' +
      '<button ' + (page >= totalPages ? 'disabled' : '') + ' onclick="Admin.changePage(\'' + prefix + '\', ' + (page + 1) + ')" type="button">Next</button>' +
      '</div>' +
      '</div>'
    );
  }

  // ---- tech ----

  function cronTaskRowHtml(task, index) {
    var isRunning = Boolean(state.cronTaskLoadingById[task.id]);
    var extra = '';

    if (task.id === 'gather-recent-competition-tenders' && state.recentCompetitionTendersCronStatus) {
      var s = state.recentCompetitionTendersCronStatus;
      extra +=
        '<small>' +
        s.noticesFetched +
        '/' +
        (s.totalNoticeCount != null ? s.totalNoticeCount : '?') +
        ' notices, pages ' +
        s.pagesFetched +
        ', matches ' +
        s.matchesSaved +
        '</small>';
    }

    if (task.id === 'gather-recent-award-tenders' && state.recentAwardTendersCronStatus) {
      var s2 = state.recentAwardTendersCronStatus;
      extra +=
        '<small>' +
        s2.noticesFetched +
        '/' +
        (s2.totalNoticeCount != null ? s2.totalNoticeCount : '?') +
        ' notices, pages ' +
        s2.pagesFetched +
        '</small>';
    }

    if (task.id === 'gather-pl-bzp-tenders' && state.plBzpCronStatus && state.plBzpCronStatus.recent) {
      var s3 = state.plBzpCronStatus.recent;
      var a3 = s3.amendments || {};
      extra +=
        '<small>' +
        (s3.isRunning ? 'Running: ' : 'Last run: ') +
        s3.noticesFetched +
        ' notices, saved ' +
        s3.saved +
        ', updated ' +
        s3.updated +
        ', skipped ' +
        s3.skipped +
        ', failed ' +
        s3.failed +
        '; deadline changes applied ' +
        (a3.applied || 0) +
        ', not found ' +
        (a3.notFound || 0) +
        (s3.finishedAt ? ', finished ' + fmtDateTime(s3.finishedAt) : '') +
        '</small>' +
        (s3.lastError ? '<small>Error: ' + escapeHtml(s3.lastError) + '</small>' : '');
    }

    if (task.scheduled && task.schedule) {
      extra +=
        '<small>Schedule: ' +
        (task.schedule.enabled ? 'enabled' : 'disabled') +
        (task.schedule.persistedEnabled !== undefined ? ' (saved)' : '') +
        (task.schedule.nextRunAt ? ', next ' + fmtDateTime(task.schedule.nextRunAt) : '') +
        '</small>';
    }

    var toggleBtn = '';
    if (task.scheduled && task.schedule) {
      toggleBtn =
        '<button class="secondaryButton ' +
        (task.schedule.enabled ? 'dangerButton' : 'successButton') +
        '" ' +
        (isRunning ? 'disabled' : '') +
        ' onclick="Admin.toggleCronTask(' + index + ')" type="button">' +
        (task.schedule.enabled ? 'Disable' : 'Enable') +
        '</button>';
    }

    return (
      '<div><span><strong>' +
      escapeHtml(task.title) +
      '</strong><small>' +
      escapeHtml(task.description) +
      '</small>' +
      extra +
      '</span><div class="buttonGroup">' +
      toggleBtn +
      '<button class="secondaryButton" ' +
      (isRunning ? 'disabled' : '') +
      ' onclick="Admin.runCronTask(' + index + ')" type="button">' +
      (isRunning ? 'Running...' : 'Run') +
      '</button></div></div>'
    );
  }

  function gatherAllTagPanelHtml() {
    return (
      '<section class="panel panelWide"><div class="panelHeader"><div><h2>Full tender gathering</h2>' +
      '<p>Current gatherAllCompetitionTenders status.</p></div>' +
      (state.gatherAllStatus
        ? tagHtml(state.gatherAllStatus.isRunning ? 'RUNNING' : 'IDLE', state.gatherAllStatus.isRunning ? 'processing' : 'default')
        : tagHtml('UNKNOWN')) +
      '</div></section>'
    );
  }

  function cronPanelHtml() {
    return (
      '<section class="panel panelWide"><div class="panelHeader"><div><h2>Cron jobs</h2>' +
      '<p>Enable, disable or run scheduled jobs. Enabled state is saved and restored on restart.</p></div></div>' +
      '<div class="statusList">' +
      state.cronTasks.map(cronTaskRowHtml).join('') +
      '</div>' +
      (state.cronRunResult ? '<pre class="jsonResult">' + escapeHtml(JSON.stringify(state.cronRunResult, null, 2)) + '</pre>' : '') +
      '</section>'
    );
  }

  function syncIndexesResultHtml() {
    var s = state.syncIndexesStatus;
    if (!s) return '';
    var percent = s.totalModels > 0 ? Math.round((s.processedModels / s.totalModels) * 100) : 0;
    var status = s.errors.length || s.lastError ? 'exception' : s.isRunning ? 'active' : 'success';
    var html = progressBarHtml(percent, status);

    html += statsHtml([
      ['Models', s.processedModels + '/' + s.totalModels],
      ['Current model', escapeHtml(s.currentModel || '-'), 'smallStat'],
      ['Mode', escapeHtml(s.mode)],
      ['Indexes', s.indexesChecked],
      ['Existing', s.indexesAlreadyPresent],
      ['Created', s.indexesCreated],
      ['Errors', s.errors.length],
      ['Rebuilt', s.indexesRebuilt],
    ]);

    if (s.rebuiltIndexes.length) {
      html +=
        '<div class="resultNote">Rebuilt indexes: ' +
        escapeHtml(
          s.rebuiltIndexes
            .slice(-6)
            .map(function (i) {
              return i.model + '.' + i.index;
            })
            .join(', '),
        ) +
        '</div>';
    }

    if (s.droppedConflictingIndexes.length) {
      html +=
        '<div class="resultNote">Dropped conflicting indexes: ' +
        escapeHtml(
          s.droppedConflictingIndexes
            .slice(-6)
            .map(function (i) {
              return i.model + '.' + i.index;
            })
            .join(', '),
        ) +
        '</div>';
    }

    if (s.errors.length) {
      html += errorListHtml(
        s.errors.slice(0, 8).map(function (e) {
          return { id: e.model, message: e.message };
        }),
      );
    }

    return html;
  }

  function mongoIndexesPanelHtml() {
    var busy = state.syncIndexesLoading || (state.syncIndexesStatus && state.syncIndexesStatus.isRunning);
    return (
      '<section class="panel panelWide"><div class="panelHeader"><div><h2>Mongo indexes</h2>' +
      '<p>Ensure or rebuild indexes declared in Mongoose schemas.</p></div>' +
      '<div class="buttonGroup">' +
      '<label class="checkboxLabel"><input type="checkbox" ' +
      (state.forceRebuildIndexes ? 'checked' : '') +
      ' ' +
      (busy ? 'disabled' : '') +
      ' onchange="Admin.setCheckbox(\'forceRebuildIndexes\', this.checked)"> Force rebuild</label>' +
      '<button ' +
      (busy ? 'disabled' : '') +
      ' onclick="Admin.syncMongoIndexes()" type="button">' +
      (busy ? 'Syncing indexes...' : state.forceRebuildIndexes ? 'Rebuild indexes' : 'Sync indexes') +
      '</button></div></div>' +
      syncIndexesResultHtml() +
      '</section>'
    );
  }

  function competitionPanelHtml() {
    var running = state.gatherAllCompetitionLoading || (state.gatherAllStatus && state.gatherAllStatus.isRunning);
    var html =
      '<section class="panel panelWide"><div class="panelHeader"><div><h2>Competition tender gathering</h2>' +
      '<p>Collect open competition tenders from TED.</p></div>' +
      '<div class="buttonGroup"><label>Competition page limit<input min="1" type="number" value="' +
      escapeHtml(state.gatherAllCompetitionPageLimit) +
      '" oninput="Admin.setField(\'gatherAllCompetitionPageLimit\', this.value)"></label>' +
      '<button ' +
      (running ? 'disabled' : '') +
      ' onclick="Admin.gatherAllCompetitionTenders()" type="button">' +
      (running ? 'Gathering competition...' : 'Gather all competition') +
      '</button></div></div>' +
      '<div class="statusList"><div><span>Competition gathering</span>' +
      tagHtml(running ? 'RUNNING' : 'IDLE', running ? 'processing' : 'default') +
      '</div></div>';

    if (state.gatherAllStatus) {
      var pairs = [
        ['Competition notices', state.gatherAllStatus.noticesFetched + '/' + (state.gatherAllStatus.totalNoticeCount != null ? state.gatherAllStatus.totalNoticeCount : '?')],
        ['Competition pages', state.gatherAllStatus.pagesFetched],
        ['Competition started', escapeHtml(state.gatherAllStatus.startedAt ? fmtDateTime(state.gatherAllStatus.startedAt) : '-'), 'smallStat'],
      ];
      if (state.gatherAllStatus.lastError) pairs.push(['Competition error', escapeHtml(state.gatherAllStatus.lastError), 'smallStat']);
      html += statsHtml(pairs);
    }

    html += '</section>';
    return html;
  }

  function awardRefreshPanelHtml() {
    var running = state.awardTendersRefreshLoading || (state.awardTendersRefreshResult && state.awardTendersRefreshResult.isRunning);
    var html =
      '<section class="panel panelWide"><div class="panelHeader"><div><h2>Award tender refresh</h2>' +
      '<p>Collect award result notices from TED history.</p></div>' +
      '<div class="buttonGroup"><label>Awards page limit<input min="1" type="number" value="' +
      escapeHtml(state.awardTendersRefreshPageLimit) +
      '" oninput="Admin.setField(\'awardTendersRefreshPageLimit\', this.value)"></label>' +
      '<label class="checkboxLabel"><input type="checkbox" ' +
      (state.skipExistingAwardTendersByPublicationNumber ? 'checked' : '') +
      ' onchange="Admin.setCheckbox(\'skipExistingAwardTendersByPublicationNumber\', this.checked)"> Skip existing publication numbers</label>' +
      '<button class="secondaryButton" ' +
      (state.awardTendersRefreshLoading ? 'disabled' : '') +
      ' onclick="Admin.refreshAwardTendersHistory()" type="button">' +
      (state.awardTendersRefreshLoading ? 'Refreshing awards...' : 'Refresh award tenders') +
      '</button></div></div>' +
      '<div class="statusList"><div><span>Award tender refresh</span>' +
      tagHtml(running ? 'RUNNING' : 'IDLE', running ? 'processing' : 'default') +
      '</div></div>';

    var r = state.awardTendersRefreshResult;
    if (r) {
      var pairs = [
        ['Award refresh notices', r.noticesFetched + '/' + (r.totalNoticeCount != null ? r.totalNoticeCount : '?')],
        ['Award refresh pages', r.pagesFetched],
        ['Award date chunks', (r.processedDateChunks || 0) + '/' + (r.totalDateChunks || 0)],
        ['Award incomplete chunks', r.incompleteDateChunks || 0],
        ['Award current chunk', escapeHtml(r.currentDateChunk ? r.currentDateChunk.from + '-' + r.currentDateChunk.to : '-'), 'smallStat'],
        ['Award refresh started', escapeHtml(r.startedAt ? fmtDateTime(r.startedAt) : '-'), 'smallStat'],
      ];
      if (r.lastError) pairs.push(['Award refresh error', escapeHtml(r.lastError), 'smallStat']);
      html += statsHtml(pairs);
    }

    html += '</section>';
    return html;
  }

  function awardValuesFixPanelHtml() {
    var s = state.awardValuesFixStatus;
    var running = state.awardValuesFixLoading || (s && s.isRunning);
    var html =
      '<section class="panel panelWide"><div class="panelHeader"><div><h2>Award values fix</h2>' +
      '<p>Re-apply sanity rules to saved award values (x100 / x1000 typos, lots sum, cap), then refresh buyer and contractor stats. Run a dry run first.</p></div>' +
      '<div class="buttonGroup"><label class="checkboxLabel"><input type="checkbox" ' +
      (state.awardValuesFixRefetchXml ? 'checked' : '') +
      ' onchange="Admin.setCheckbox(\'awardValuesFixRefetchXml\', this.checked)"> Fetch TED XML for awards over 1bn EUR</label>' +
      '<button class="secondaryButton" ' +
      (running ? 'disabled' : '') +
      ' onclick="Admin.fixAwardValues(true)" type="button">Dry run</button>' +
      '<button ' +
      (running ? 'disabled' : '') +
      ' onclick="Admin.fixAwardValues(false)" type="button">' +
      (running ? 'Running...' : 'Apply fixes') +
      '</button>' +
      '<button class="secondaryButton" ' +
      (state.awardDatesBackfillLoading ? 'disabled' : '') +
      ' onclick="Admin.backfillAwardDates()" type="button">' +
      (state.awardDatesBackfillLoading ? 'Recomputing...' : 'Recompute award dates') +
      '</button>' +
      '<button class="secondaryButton" ' +
      (state.awardCountriesBackfillLoading ? 'disabled' : '') +
      ' onclick="Admin.backfillAwardCountries()" type="button">' +
      (state.awardCountriesBackfillLoading ? 'Filling...' : 'Fill missing countries') +
      '</button></div></div>' +
      '<div class="statusList"><div><span>Award values fix</span>' +
      tagHtml(running ? 'RUNNING' : 'IDLE', running ? 'processing' : 'default') +
      '</div></div>';

    if (s && s.startedAt) {
      var rules = Object.keys(s.correctionsByRule || {})
        .map(function (rule) {
          return rule + ': ' + s.correctionsByRule[rule];
        })
        .join(', ');
      var pairs = [
        ['Mode', s.dryRun ? 'Dry run' : 'Apply'],
        ['Processed', s.processed + '/' + s.total],
        ['Changed tenders', s.changedTenders],
        ['Tenders with corrections', s.tendersWithCorrections],
        ['Corrections by rule', escapeHtml(rules || '-'), 'smallStat'],
        ['XML fetched / failed', s.xmlRefetched + ' / ' + s.xmlFailed],
        ['Buyers refreshed', s.buyersRefreshed + '/' + s.buyersToRefresh],
        ['Contractors refreshed', s.contractorsRefreshed + '/' + s.contractorsToRefresh],
        ['Started', escapeHtml(fmtDateTime(s.startedAt)), 'smallStat'],
        ['Finished', escapeHtml(s.finishedAt ? fmtDateTime(s.finishedAt) : '-'), 'smallStat'],
      ];
      if (s.lastError) pairs.push(['Error', escapeHtml(s.lastError), 'smallStat']);
      html += statsHtml(pairs);

      if (!s.isRunning && s.samples && s.samples.length) {
        var fmtEur = function (value) {
          return value == null ? 'null' : Math.round(value).toLocaleString('en-US') + ' EUR';
        };
        html +=
          '<details><summary>Biggest changes (' + s.samples.length + ')</summary><table><thead><tr>' +
          '<th>Notice</th><th>Before</th><th>After</th><th>Rules</th></tr></thead><tbody>' +
          s.samples
            .map(function (sample) {
              return (
                '<tr><td><a target="_blank" rel="noopener" href="https://ted.europa.eu/en/notice/-/detail/' +
                encodeURIComponent(sample.id) + '">' + escapeHtml(sample.id) + '</a></td>' +
                '<td>' + escapeHtml(fmtEur(sample.before)) + '</td>' +
                '<td>' + escapeHtml(fmtEur(sample.after)) + '</td>' +
                '<td>' + escapeHtml(sample.rules.join(', ')) + '</td></tr>'
              );
            })
            .join('') +
          '</tbody></table></details>';
      }
    }

    html += '</section>';
    return html;
  }

  function buyerStatsPanelHtml() {
    var running = state.collectTenderBuyersLoading || (state.collectTenderBuyersResult && state.collectTenderBuyersResult.isRunning);
    var html =
      '<section class="panel panelWide"><div class="panelHeader"><div><h2>Buyer stats refresh</h2>' +
      '<p>Recalculate buyer aggregate metadata from saved tenders and award tenders.</p></div>' +
      '<div class="buttonGroup"><button ' +
      (state.collectTenderBuyersLoading ? 'disabled' : '') +
      ' onclick="Admin.collectBuyersFromTenders()" type="button">' +
      (state.collectTenderBuyersLoading ? 'Refreshing buyer stats...' : 'Refresh buyer stats') +
      '</button></div></div>' +
      '<div class="statusList"><div><span>Buyer stats</span>' +
      tagHtml(running ? 'RUNNING' : 'IDLE', running ? 'processing' : 'default') +
      '</div></div>';

    var r = state.collectTenderBuyersResult;
    if (r) {
      var pairs = [
        ['Status', r.isRunning ? 'Running' : 'Idle'],
        ['Processed buyers', r.processedTenders + '/' + r.totalTenders],
        ['Updated buyers', r.updatedTenders],
        ['Errors', r.errors],
        ['Failed chunks', r.failedChunks],
        ['Started', escapeHtml(r.startedAt ? fmtDateTime(r.startedAt) : '-'), 'smallStat'],
        ['Finished', escapeHtml(r.finishedAt ? fmtDateTime(r.finishedAt) : '-'), 'smallStat'],
      ];
      if (r.lastError) pairs.push(['Last error', escapeHtml(r.lastError), 'smallStat']);
      html += statsHtml(pairs);
    }

    html += '</section>';
    return html;
  }

  function shortTitlesPanelHtml() {
    var html =
      '<section class="panel panelWide"><div class="panelHeader"><div><h2>Tender short titles</h2>' +
      '<p>Generate missing AI short titles for tenders in EN, DE, FR, PL, and RU.</p></div>' +
      '<button class="secondaryButton" onclick="Admin.downloadTenderShortTitles()" type="button">Download JSON</button></div>' +
      '<form class="techForm techFormCompact" onsubmit="return Admin.generateShortTitles(event)">' +
      '<label>Limit<input min="1" type="number" value="' +
      escapeHtml(state.shortTitlesLimit) +
      '" oninput="Admin.setField(\'shortTitlesLimit\', this.value)"></label>' +
      '<label>Batch size<input max="100" min="1" type="number" value="' +
      escapeHtml(state.shortTitlesBatchSize) +
      '" oninput="Admin.setField(\'shortTitlesBatchSize\', this.value)"></label>' +
      '<button ' +
      (state.shortTitlesLoading ? 'disabled' : '') +
      ' type="submit">' +
      (state.shortTitlesLoading ? 'Generating...' : 'Generate short titles') +
      '</button></form>';

    var r = state.shortTitlesResult;
    if (r) {
      html += statsHtml([
        ['Matched', r.matchedCount],
        ['Updated', r.updatedCount],
        ['Failed', r.failedCount],
        ['Batch size', r.batchSize],
      ]);
      html += errorListHtml(r.errors);
    }

    html += '</section>';
    return html;
  }

  function generalAnalysisPanelHtml() {
    var html =
      '<section class="panel panelWide"><div class="panelHeader"><div><h2>Tender general analysis</h2>' +
      '<p>Queue missing or stale general analyses for saved tenders.</p></div></div>' +
      '<form class="techForm techFormCompact" onsubmit="return Admin.generateGeneralAnalyses(event)">' +
      '<label>Limit<input max="1000" min="1" type="number" value="' +
      escapeHtml(state.generalAnalysesLimit) +
      '" oninput="Admin.setField(\'generalAnalysesLimit\', this.value)"></label>' +
      '<label>Batch size<input max="500" min="1" type="number" value="' +
      escapeHtml(state.generalAnalysesBatchSize) +
      '" oninput="Admin.setField(\'generalAnalysesBatchSize\', this.value)"></label>' +
      '<button ' +
      (state.generalAnalysesLoading ? 'disabled' : '') +
      ' type="submit">' +
      (state.generalAnalysesLoading ? 'Queueing...' : 'Queue general analyses') +
      '</button></form>';

    var s = state.generalAnalysisStatus;
    if (s) {
      html +=
        '<div class="statusList"><div><span>Base analysis queue</span>' +
        tagHtml(s.queue.size > 0 ? 'RUNNING' : 'IDLE', s.queue.size > 0 ? 'processing' : 'default') +
        '</div></div>';
      html += statsHtml([
        ['Done', s.doneCount],
        ['In queue', s.queue.size],
        ['Running', s.queue.running],
        ['Waiting', s.queue.pending],
        ['Processing records', s.processingCount],
        ['Failed', s.failedCount],
        ['Total analyses', s.totalAnalyses],
        ['Total tenders', s.totalTenders],
        ['Concurrency', s.queue.concurrency],
      ]);
    }

    var r = state.generalAnalysesResult;
    if (r) {
      html += statsHtml([
        ['Scanned', r.scannedCount],
        ['Matched', r.matchedCount],
        ['Queued', r.enqueuedCount],
        ['Skipped', r.skippedCount],
        ['Limit', r.limit],
        ['Batch size', r.batchSize],
        ['Errors', r.errors.length],
      ]);
      html += errorListHtml(r.errors);
    }

    html += '</section>';
    return html;
  }

  function fixAwardCriteriaPanelHtml() {
    var html =
      '<section class="panel panelWide"><div class="panelHeader"><div><h2>Lot award criteria fix</h2>' +
      '<p>Rebuild saved lots award criteria from TED XML notices when the structured TED lot criteria are misaligned. ' +
      'Processes all matching tenders; batch size only controls database read chunks.</p></div></div>' +
      '<form class="techForm techFormCompact" onsubmit="return Admin.fixTenderLotAwardCriteria(event)">' +
      '<label>Batch size<input max="5000" min="1" type="number" value="' +
      escapeHtml(state.fixAwardCriteriaBatchSize) +
      '" oninput="Admin.setField(\'fixAwardCriteriaBatchSize\', this.value)"></label>' +
      '<label class="checkboxLabel"><input type="checkbox" ' +
      (state.fixAwardCriteriaDryRun ? 'checked' : '') +
      ' onchange="Admin.setCheckbox(\'fixAwardCriteriaDryRun\', this.checked)"> Dry run</label>' +
      '<button ' +
      (state.fixAwardCriteriaLoading ? 'disabled' : '') +
      ' type="submit">' +
      (state.fixAwardCriteriaLoading ? 'Running...' : state.fixAwardCriteriaDryRun ? 'Preview fixes' : 'Apply fixes') +
      '</button></form>';

    var r = state.fixAwardCriteriaResult;
    if (r) {
      html += statsHtml([
        ['Total', r.totalCount],
        ['Scanned', r.scannedCount],
        ['Remaining', r.remainingCount],
        ['XML fetched', r.xmlFetchedCount],
        ['Matched', r.matchedCount],
        ['Updated', r.updatedCount],
        ['No XML criteria', r.xmlWithoutCriteriaCount],
        ['Errors', r.errors.length],
      ]);
      if (r.changedTenderIds.length) {
        html += '<div class="errorList"><strong>Changed tenders</strong>: ' + escapeHtml(r.changedTenderIds.slice(0, 20).join(', ')) + '</div>';
      }
      html += errorListHtml(r.errors);
    }

    html += '</section>';
    return html;
  }

  function dbCopyPanelHtml() {
    var running = state.dbCopyLoading || (state.dbCopyResult && state.dbCopyResult.isRunning);
    var html =
      '<section class="panel panelWide"><div class="panelHeader"><div><h2>Database dump copy</h2>' +
      '<p>Create a MongoDB dump and upload it to CDN using the configured backup prefix. This runs in the background and can take a long time for large databases.</p></div>' +
      '<button ' +
      (state.dbCopyLoading ? 'disabled' : '') +
      ' onclick="Admin.copyDatabaseDumpToCdn()" type="button">' +
      (state.dbCopyLoading ? 'Starting...' : 'Copy database dump') +
      '</button></div>' +
      '<div class="statusList"><div><span>Database dump copy</span>' +
      tagHtml(running ? 'RUNNING' : 'IDLE', running ? 'processing' : 'default') +
      '</div></div>';

    var r = state.dbCopyResult;
    if (r) {
      var pairs = [
        ['Started', escapeHtml(r.startedAt ? fmtDateTime(r.startedAt) : '-'), 'smallStat'],
        ['Finished', escapeHtml(r.finishedAt ? fmtDateTime(r.finishedAt) : '-'), 'smallStat'],
      ];
      if (r.lastError) pairs.push(['Last error', escapeHtml(r.lastError), 'smallStat']);
      html += statsHtml(pairs);

      if (r.result) {
        html +=
          '<dl class="stats"><div><dt>File</dt><dd class="smallStat">' +
          escapeHtml(r.result.filename) +
          '</dd></div><div><dt>Deleted old copies</dt><dd>' +
          r.result.deletedCount +
          '</dd></div><div><dt>URL</dt><dd class="smallStat"><a href="' +
          escapeHtml(r.result.url) +
          '" rel="noreferrer" target="_blank">' +
          escapeHtml(r.result.url) +
          '</a></dd></div></dl>';
      }
    }

    html += '</section>';
    return html;
  }

  function contractorStatsPanelHtml() {
    var running = state.contractorStatsRefreshLoading || (state.contractorStatsRefreshResult && state.contractorStatsRefreshResult.isRunning);
    var html =
      '<section class="panel panelWide"><div class="panelHeader"><div><h2>Contractor stats refresh</h2>' +
      '<p>Recalculate contractor award metadata from saved award tenders.</p></div>' +
      '<div class="buttonGroup"><button ' +
      (state.contractorStatsRefreshLoading ? 'disabled' : '') +
      ' onclick="Admin.refreshContractorStats()" type="button">' +
      (state.contractorStatsRefreshLoading ? 'Refreshing contractor stats...' : 'Refresh contractor stats') +
      '</button></div></div>' +
      '<div class="statusList"><div><span>Contractor stats</span>' +
      tagHtml(running ? 'RUNNING' : 'IDLE', running ? 'processing' : 'default') +
      '</div></div>';

    var r = state.contractorStatsRefreshResult;
    if (r) {
      var pairs = [
        ['Status', r.isRunning ? 'Running' : 'Idle'],
        ['Processed contractors', r.processedContractors + '/' + r.totalContractors],
        ['Updated contractors', r.updatedContractors],
        ['Errors', r.errors],
        ['Failed chunks', r.failedChunks],
        ['Started', escapeHtml(r.startedAt ? fmtDateTime(r.startedAt) : '-'), 'smallStat'],
        ['Finished', escapeHtml(r.finishedAt ? fmtDateTime(r.finishedAt) : '-'), 'smallStat'],
      ];
      if (r.lastError) pairs.push(['Last error', escapeHtml(r.lastError), 'smallStat']);
      html += statsHtml(pairs);
    }

    html += '</section>';
    return html;
  }

  function sitemapPanelHtml() {
    var html =
      '<section class="panel panelWide"><div class="panelHeader"><div><h2>Tender sitemap</h2>' +
      '<p>Generate a sitemap file from all saved tenders. Domain and languages are passed to the backend as request parameters.</p></div></div>' +
      '<form class="techForm techFormSitemap" onsubmit="return Admin.generateSitemap(event)">' +
      '<label>Domain<input placeholder="https://example.com" required type="url" value="' +
      escapeHtml(state.sitemapDomain) +
      '" oninput="Admin.setField(\'sitemapDomain\', this.value)"></label>' +
      '<label>Languages<input placeholder="en,pl,de" required value="' +
      escapeHtml(state.sitemapLocales) +
      '" oninput="Admin.setField(\'sitemapLocales\', this.value)"></label>' +
      '<label>URLs per file<input max="50000" min="1" required type="number" value="' +
      escapeHtml(state.sitemapMaxUrlsPerFile) +
      '" oninput="Admin.setField(\'sitemapMaxUrlsPerFile\', this.value)"></label>' +
      '<button ' +
      (state.sitemapLoading ? 'disabled' : '') +
      ' type="submit">' +
      (state.sitemapLoading ? 'Generating...' : 'Generate sitemap') +
      '</button></form>';

    var r = state.sitemapResult;
    if (r) {
      html += '<button class="secondaryButton" onclick="Admin.downloadSitemap()" type="button">Download sitemap</button>';

      if (r.sitemapFiles.length > 1) {
        html +=
          '<div class="sitemapFiles">' +
          r.sitemapFiles
            .map(function (f, idx) {
              return '<button class="secondaryButton" onclick="Admin.downloadSitemapFile(' + idx + ')" type="button">Download ' + escapeHtml(f.filename) + '</button>';
            })
            .join('') +
          '</div>';
      }

      html += statsHtml([
        ['File', escapeHtml(r.outputPath), 'smallStat'],
        ['Domain', escapeHtml(r.domain), 'smallStat'],
        ['Languages', escapeHtml(r.locales.join(', '))],
        ['URLs', r.urlsCount],
        ['URLs per file', r.maxUrlsPerFile],
        ['Sitemap files', r.sitemapFilesCount + (r.isSitemapIndex ? ' + index' : '')],
        ['Tenders', r.tendersCount],
        ['Award tenders', r.awardTendersCount],
        ['Award directory', r.awardDirectoryCount],
        ['Industries', r.industriesCount],
        ['Countries', r.countriesCount],
      ]);
    }

    html += '</section>';
    return html;
  }

  var AWARD_VALUE_REVIEW_FILTERS = [
    ['pending', 'Pending'],
    ['applied', 'Applied'],
    ['rejected', 'Rejected'],
    ['no_change', 'No change'],
    ['stale', 'Stale'],
    ['failed', 'Failed'],
  ];

  function fmtMoneyValue(money) {
    if (!money || money.amount == null) return 'null';
    var text = Math.round(money.amount).toLocaleString('en-US') + ' ' + (money.currency || '');
    if (money.currency !== 'EUR' && money.eur != null) {
      text += ' (' + Math.round(money.eur).toLocaleString('en-US') + ' EUR)';
    }
    return text;
  }

  function awardValueReviewChangeHtml(change) {
    var target =
      change.scope === 'tender'
        ? 'Total'
        : 'Lot ' + (change.lotIndex + 1) + (change.lotTitle ? ': ' + change.lotTitle.slice(0, 60) : '');
    var verdicts = {
      replaced: ['from web', 'green'],
      shifted: ['÷' + change.factor, 'blue'],
      invalid: ['remove', 'red'],
    };
    var verdict = verdicts[change.verdict] || [change.verdict, 'default'];
    return (
      '<div class="reviewChange"><div><strong>' + escapeHtml(target) + '</strong> ' +
      tagHtml(verdict[0], verdict[1]) + '</div>' +
      '<div>' + escapeHtml(fmtMoneyValue(change.before)) + ' → <strong>' + escapeHtml(fmtMoneyValue(change.after)) + '</strong></div>' +
      (change.source ? awardPriceFindingHtml(change.source) : '') +
      '<div class="mutedText">' + escapeHtml(change.reason || '') + '</div></div>'
    );
  }

  function awardPriceFindingHtml(finding) {
    var host = finding.url;
    try {
      host = new URL(finding.url).hostname;
    } catch (e) {}
    return (
      '<blockquote class="reviewQuote">«' + escapeHtml(finding.quote) + '»<br>' +
      '<a target="_blank" rel="noopener" href="' + escapeHtml(finding.url) + '">' + escapeHtml(host) + '</a>' +
      ' <span class="mutedText">' + escapeHtml(finding.scope + ', VAT ' + finding.vat) + '</span></blockquote>'
    );
  }

  function awardValueReviewWebHtml(item) {
    var web = item.webSearch;
    if (!web) return '';
    var findings = web.findings || [];
    var errors = web.errors || [];
    var summary =
      'Web: ' + (findings.length ? findings.length + ' price(s)' : 'no price') + ' on ' + web.pagesFetched + ' page(s)';
    return (
      '<details class="reviewWeb"><summary class="mutedText">' + escapeHtml(summary) +
      (errors.length ? ' ' + tagHtml(errors.length + ' error(s)', 'red') : '') + '</summary>' +
      findings.map(awardPriceFindingHtml).join('') +
      errorListHtml(
        errors.map(function (e) {
          return { id: e.stage + ' ' + e.target.slice(0, 80), message: e.message };
        }),
      ) +
      '<div class="mutedText">Queries: ' + escapeHtml((web.queries || []).join(' | ')) + '</div></details>'
    );
  }

  function awardValueReviewRowHtml(item) {
    var isPending = item.status === 'pending';
    var disabled = state.awardValueReviewBusy ? ' disabled' : '';
    var changes = (item.changes || []).map(awardValueReviewChangeHtml).join('');
    if (!changes) changes = '<span class="mutedText">' + escapeHtml(item.errorMessage || item.reason || '-') + '</span>';
    changes += awardValueReviewWebHtml(item);

    return (
      '<tr><td><a target="_blank" rel="noopener" href="https://ted.europa.eu/en/notice/-/detail/' +
      encodeURIComponent(item.tenderId) + '">' + escapeHtml(item.tenderId) + '</a>' +
      '<div>' + escapeHtml((item.title || '').slice(0, 140)) + '</div>' +
      '<div class="mutedText">' + escapeHtml(item.buyerName || '') + '</div></td>' +
      '<td>' + changes + '</td>' +
      '<td>' + escapeHtml(item.confidence || '-') + '</td>' +
      '<td>' +
      (isPending
        ? '<div class="buttonGroup"><button' + disabled + ' onclick="Admin.applyAwardValueReviews([\'' + item._id + '\'])" type="button">Apply</button>' +
          '<button class="secondaryButton"' + disabled + ' onclick="Admin.rejectAwardValueReviews([\'' + item._id + '\'])" type="button">Reject</button></div>'
        : tagHtml(item.status, item.status === 'applied' ? 'green' : 'default')) +
      '</td></tr>'
    );
  }

  function awardValueReviewPanelHtml() {
    var s = state.awardValueReviewStatus;
    var running = state.awardValueReviewLoading || (s && s.isRunning);
    var counts = state.awardValueReviewCounts || {};
    var items = state.awardValueReviewItems || [];
    var pendingItems = items.filter(function (item) {
      return item.status === 'pending';
    });

    var html =
      '<section class="panel panelWide"><div class="panelHeader"><div><h2>Award value LLM review</h2>' +
      '<p>LLM checks award values over the threshold against the subject, lots and the buyer\'s usual award size. Nothing changes until you press Apply; applied values survive "Award values fix" and re-import.</p></div>' +
      '<div class="buttonGroup"><label>Min award, M EUR<input min="1" type="number" value="' +
      escapeHtml(state.awardValueReviewMinM) +
      '" oninput="Admin.setField(\'awardValueReviewMinM\', this.value)"></label>' +
      '<label>Limit<input min="1" type="number" placeholder="all" value="' +
      escapeHtml(state.awardValueReviewLimit) +
      '" oninput="Admin.setField(\'awardValueReviewLimit\', this.value)"></label>' +
      '<label class="checkboxLabel"><input type="checkbox" ' +
      (state.awardValueReviewRecheck ? 'checked' : '') +
      ' onchange="Admin.setCheckbox(\'awardValueReviewRecheck\', this.checked)"> Re-check not applied</label>' +
      (s && s.isRunning
        ? '<button class="secondaryButton" onclick="Admin.stopAwardValueReview()" type="button">' +
          (s.stopRequested ? 'Stopping...' : 'Stop') + '</button>'
        : '') +
      '<button ' + (running ? 'disabled' : '') + ' onclick="Admin.startAwardValueReview()" type="button">' +
      (running ? 'Reviewing...' : 'Run review') + '</button></div></div>' +
      '<div class="statusList"><div><span>Award value review</span>' +
      tagHtml(running ? 'RUNNING' : 'IDLE', running ? 'processing' : 'default') +
      '</div></div>';

    if (s && s.startedAt) {
      var pairs = [
        ['Processed', s.processed + '/' + s.total],
        ['Flagged', s.flagged],
        ['No change', s.noChange],
        ['Failed', s.failed],
        ['Web price found', s.webSearchEnabled ? s.withWebPrice : 'web search off (no BRAVE_API_KEY)', 'smallStat'],
        ['Min award', Math.round(s.minAwardValueEur / 1e6) + 'M EUR'],
        ['Started', escapeHtml(fmtDateTime(s.startedAt)), 'smallStat'],
        ['Finished', escapeHtml(s.finishedAt ? fmtDateTime(s.finishedAt) : '-'), 'smallStat'],
      ];
      if (s.lastError) pairs.push(['Error', escapeHtml(s.lastError), 'smallStat']);
      html += statsHtml(pairs);

      if (s.errors && s.errors.length) {
        html +=
          '<h3>Errors</h3>' +
          errorListHtml(
            s.errors.map(function (e) {
              return { id: e.stage + ' ×' + e.count, message: e.message + ' (e.g. ' + e.example.slice(0, 100) + ')' };
            }),
          );
      }
    }

    html +=
      '<div class="buttonGroup"><select onchange="Admin.setAwardValueReviewFilter(this.value)">' +
      AWARD_VALUE_REVIEW_FILTERS.map(function (f) {
        return (
          '<option value="' + f[0] + '"' + (state.awardValueReviewFilter === f[0] ? ' selected' : '') + '>' +
          escapeHtml(f[1] + ' (' + (counts[f[0]] || 0) + ')') + '</option>'
        );
      }).join('') +
      '</select>' +
      (pendingItems.length
        ? '<button ' + (state.awardValueReviewBusy ? 'disabled' : '') +
          ' onclick="Admin.applyAllAwardValueReviews()" type="button">Apply all shown (' + pendingItems.length + ')</button>'
        : '') +
      '</div>' +
      '<div class="tableWrap"><table class="dataTable"><thead><tr>' +
      '<th>Notice</th><th>What will change</th><th>Confidence</th><th></th></tr></thead><tbody>' +
      (items.length
        ? items.map(awardValueReviewRowHtml).join('')
        : '<tr><td colspan="4" class="tableEmpty">' + (state.awardValueReviewItems ? 'Nothing here' : 'Loading...') + '</td></tr>') +
      '</tbody></table></div></section>';

    return html;
  }

  function cronSectionHtml() {
    return cronPanelHtml();
  }

  function techSectionHtml() {
    return (
      gatherAllTagPanelHtml() +
      mongoIndexesPanelHtml() +
      competitionPanelHtml() +
      awardRefreshPanelHtml() +
      awardValuesFixPanelHtml() +
      awardValueReviewPanelHtml() +
      buyerStatsPanelHtml() +
      shortTitlesPanelHtml() +
      generalAnalysisPanelHtml() +
      fixAwardCriteriaPanelHtml() +
      dbCopyPanelHtml() +
      contractorStatsPanelHtml() +
      sitemapPanelHtml()
    );
  }

  // ---- x-posts ----

  function xPostStatusTagVariant(status) {
    if (status === 'published') return 'green';
    if (status === 'approved') return 'blue';
    return 'default';
  }

  function xPostPillarLabel(pillar) {
    var found = X_POST_PILLARS.filter(function (p) {
      return p[0] === pillar;
    })[0];
    return found ? found[1] : '-';
  }

  function xPostStoryAngleLabel(pillar, storyAngle) {
    if (!storyAngle) return null;
    var options = X_POST_STORY_ANGLES_BY_PILLAR[pillar] || [];
    var found = options.filter(function (a) {
      return a[0] === storyAngle;
    })[0];
    return found ? found[1] : storyAngle;
  }

  function xPostGeneratePanelHtml() {
    var storyAngleOptions = X_POST_STORY_ANGLES_BY_PILLAR[state.xPostPillar];

    return (
      '<section class="panel panelWide"><div class="panelHeader"><div><h2>Write an X post</h2>' +
      '<p>Generates a draft with AI following the house style rules in .claude/skills/x-post/X_POSTS_GUIDELINES.md.</p></div></div>' +
      '<form class="xPostForm" onsubmit="return Admin.generateXPost(event)">' +
      '<label>Topic / brief (optional — leave empty to let the AI pick)<textarea placeholder="What is this post about? Leave empty to let the AI choose a fresh subject itself." rows="3" oninput="Admin.setField(\'xPostTopic\', this.value)">' +
      escapeHtml(state.xPostTopic) +
      '</textarea></label>' +
      '<div class="xPostFormRow">' +
      '<label>Pillar<select required onchange="Admin.setField(\'xPostPillar\', this.value)">' +
      X_POST_PILLARS.map(function (p) {
        return '<option value="' + p[0] + '"' + (state.xPostPillar === p[0] ? ' selected' : '') + '>' + escapeHtml(p[1]) + '</option>';
      }).join('') +
      '</select></label>' +
      (storyAngleOptions
        ? '<label>Story angle<select onchange="Admin.setField(\'xPostStoryAngle\', this.value)">' +
          storyAngleOptions
            .map(function (a) {
              return '<option value="' + a[0] + '"' + (state.xPostStoryAngle === a[0] ? ' selected' : '') + '>' + escapeHtml(a[1]) + '</option>';
            })
            .join('') +
          '</select></label>'
        : '') +
      '<label>Format<select onchange="Admin.setField(\'xPostFormat\', this.value)">' +
      '<option value="single"' + (state.xPostFormat === 'single' ? ' selected' : '') + '>Single post</option>' +
      '<option value="thread"' + (state.xPostFormat === 'thread' ? ' selected' : '') + '>Thread</option>' +
      '</select></label>' +
      '<label>Tone (optional)<input placeholder="e.g. confident, dry humor" value="' +
      escapeHtml(state.xPostTone) +
      '" oninput="Admin.setField(\'xPostTone\', this.value)"></label>' +
      '</div>' +
      '<label>Extra notes (optional)<textarea rows="2" oninput="Admin.setField(\'xPostNotes\', this.value)">' +
      escapeHtml(state.xPostNotes) +
      '</textarea></label>' +
      '<button ' +
      (state.xPostGenerateLoading ? 'disabled' : '') +
      ' type="submit">' +
      (state.xPostGenerateLoading ? 'Generating...' : 'Generate draft') +
      '</button>' +
      '</form>' +
      '</section>'
    );
  }

  function xPostCardHtml(item) {
    var isEditing = state.xPostEditingId === item._id;
    var body;

    if (isEditing) {
      body =
        '<label>Posts (separate thread posts with a line containing only ---)<textarea rows="6" oninput="Admin.setField(\'xPostEditPosts\', this.value)">' +
        escapeHtml(state.xPostEditPosts) +
        '</textarea></label>' +
        '<label>Hashtags (comma separated, no #)<input value="' +
        escapeHtml(state.xPostEditHashtags) +
        '" oninput="Admin.setField(\'xPostEditHashtags\', this.value)"></label>' +
        '<label>Notes<input value="' +
        escapeHtml(state.xPostEditNotes) +
        '" oninput="Admin.setField(\'xPostEditNotes\', this.value)"></label>' +
        '<label>Status<select onchange="Admin.setField(\'xPostEditStatus\', this.value)">' +
        ['draft', 'approved', 'published']
          .map(function (s) {
            return '<option value="' + s + '"' + (state.xPostEditStatus === s ? ' selected' : '') + '>' + s + '</option>';
          })
          .join('') +
        '</select></label>' +
        '<div class="buttonGroup">' +
        '<button class="secondaryButton" ' +
        (state.xPostEditSaving ? 'disabled' : '') +
        ' onclick="Admin.cancelEditXPost()" type="button">Cancel</button>' +
        '<button ' +
        (state.xPostEditSaving ? 'disabled' : '') +
        ' onclick="Admin.saveXPost(\'' + item._id + '\')" type="button">' +
        (state.xPostEditSaving ? 'Saving...' : 'Save') +
        '</button>' +
        '</div>';
    } else {
      var isRegeneratingImage = Boolean(state.xPostImageLoadingById[item._id]);

      body =
        (item.imageUrl
          ? '<img class="xPostImage" src="' + escapeHtml(item.imageUrl) + '" alt="Post card image">'
          : '<div class="xPostImagePlaceholder">No image yet</div>') +
        (item.format === 'single' && item.posts.length > 1
          ? '<p class="mutedText"><em>Pick one variant to post — these are not a thread.</em></p>'
          : '') +
        '<div class="xPostBody">' +
        item.posts
          .map(function (p, idx) {
            var label = '';
            if (item.posts.length > 1) {
              label = item.format === 'single' ? 'Variant ' + (idx + 1) : (idx + 1) + '/' + item.posts.length;
            }
            return '<p>' + (label ? '<strong>' + label + '</strong> ' : '') + escapeHtml(p) + '</p>';
          })
          .join('') +
        '</div>' +
        (item.hashtags && item.hashtags.length
          ? '<p class="mutedText">' +
            escapeHtml(
              item.hashtags
                .map(function (h) {
                  return '#' + h;
                })
                .join(' '),
            ) +
            '</p>'
          : '') +
        (item.notes ? '<p class="mutedText"><em>' + escapeHtml(item.notes) + '</em></p>' : '') +
        (item.sourceSummary ? '<p class="xPostSource">Sourced from: ' + escapeHtml(item.sourceSummary) + '</p>' : '') +
        (item.externalFacts && item.externalFacts.length
          ? '<div class="xPostExternalFacts"><p class="mutedText"><em>External sources — verify before publishing:</em></p><ul>' +
            item.externalFacts
              .map(function (f) {
                return (
                  '<li>' +
                  escapeHtml(f.fact) +
                  ' — <a href="' + escapeHtml(f.sourceUrl) + '" target="_blank" rel="noopener noreferrer">' +
                  escapeHtml(f.sourceTitle || f.sourceUrl) +
                  '</a>' +
                  (f.publishedAt ? ' (' + escapeHtml(f.publishedAt) + ')' : '') +
                  '</li>'
                );
              })
              .join('') +
            '</ul></div>'
          : '') +
        '<div class="buttonGroup">' +
        '<button class="secondaryButton" onclick="Admin.startEditXPost(\'' + item._id + '\')" type="button">Edit</button>' +
        '<button class="secondaryButton" ' +
        (isRegeneratingImage ? 'disabled' : '') +
        ' onclick="Admin.regenerateXPostImage(\'' + item._id + '\')" type="button">' +
        (isRegeneratingImage ? 'Rendering...' : item.imageUrl ? 'Regenerate image' : 'Generate image') +
        '</button>' +
        '<button class="secondaryButton dangerButton" onclick="Admin.deleteXPost(\'' + item._id + '\')" type="button">Delete</button>' +
        '</div>';
    }

    return (
      '<div class="xPostCard">' +
      '<div class="xPostCardHeader"><div>' +
      tagHtml(item.status, xPostStatusTagVariant(item.status)) +
      tagHtml(xPostPillarLabel(item.pillar), 'default') +
      (xPostStoryAngleLabel(item.pillar, item.storyAngle)
        ? tagHtml(xPostStoryAngleLabel(item.pillar, item.storyAngle), 'blue')
        : '') +
      tagHtml(item.format, 'default') +
      '</div><small class="mutedText">' +
      fmtDateTime(item.createdAt) +
      (item.llmModel ? ' &middot; ' + escapeHtml(item.llmModel) : '') +
      '</small></div>' +
      '<p class="xPostTopic">' +
      escapeHtml(item.topic) +
      '</p>' +
      body +
      '</div>'
    );
  }

  function xPostsListPanelHtml() {
    var cards = state.xPosts.map(xPostCardHtml).join('');

    return (
      '<section class="panel panelWide"><div class="panelHeader"><div><h2>Drafts &amp; history</h2><p>' +
      state.xPostsTotal +
      ' total posts</p></div>' +
      '<div class="buttonGroup">' +
      '<select onchange="Admin.setXPostFilter(\'xPostsStatusFilter\', this.value)">' +
      '<option value="">All statuses</option>' +
      ['draft', 'approved', 'published']
        .map(function (s) {
          return '<option value="' + s + '"' + (state.xPostsStatusFilter === s ? ' selected' : '') + '>' + s + '</option>';
        })
        .join('') +
      '</select>' +
      '<select onchange="Admin.setXPostFilter(\'xPostsPillarFilter\', this.value)">' +
      '<option value="">All pillars</option>' +
      X_POST_PILLARS.map(function (p) {
        return '<option value="' + p[0] + '"' + (state.xPostsPillarFilter === p[0] ? ' selected' : '') + '>' + escapeHtml(p[1]) + '</option>';
      }).join('') +
      '</select>' +
      '<button class="secondaryButton" ' +
      (state.xPostsLoading ? 'disabled' : '') +
      ' onclick="Admin.loadXPosts()" type="button">Refresh</button>' +
      '</div></div>' +
      '<div class="xPostList">' +
      (cards || '<p class="mutedText">No X posts yet.</p>') +
      '</div>' +
      paginationHtml('xPosts', state.xPostsPage, state.xPostsPageSize, state.xPostsTotal) +
      '</section>'
    );
  }

  function xPostsSectionHtml() {
    return xPostGeneratePanelHtml() + xPostsListPanelHtml();
  }

  // ---- marketing tasks ----

  function marketingCategoryLabel(category) {
    var found = MARKETING_TASK_CATEGORIES.filter(function (c) {
      return c[0] === category;
    })[0];
    return found ? found[1] : category || '-';
  }

  function marketingPriorityTagVariant(priority) {
    if (priority === 'high') return 'red';
    if (priority === 'medium') return 'orange';
    return 'default';
  }

  function marketingStatusTagVariant(status) {
    if (status === 'done') return 'green';
    if (status === 'in_progress') return 'blue';
    if (status === 'rejected') return 'default';
    return 'processing';
  }

  function optionsHtml(values, selected, labels) {
    return values
      .map(function (v, idx) {
        var label = labels ? labels[idx] : v;
        return '<option value="' + escapeHtml(v) + '"' + (selected === v ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
      })
      .join('');
  }

  var marketingCategoryValues = MARKETING_TASK_CATEGORIES.map(function (c) {
    return c[0];
  });
  var marketingCategoryLabels = MARKETING_TASK_CATEGORIES.map(function (c) {
    return c[1];
  });

  function marketingGeneratePanelHtml() {
    var result = state.marketingGenerateResult;

    return (
      '<section class="panel"><div class="panelHeader"><div><h2>Run AI analysis</h2>' +
      '<p>Pulls Search Console + GA4 data for the period, compares it with the previous period and asks AI what to fix. Duplicates of open or recently rejected tasks are skipped. Also runs weekly by cron.</p></div></div>' +
      '<form class="xPostForm" onsubmit="return Admin.generateMarketingTasks(event)">' +
      '<div class="xPostFormRow">' +
      '<label>Period<select onchange="Admin.setField(\'marketingGenerateDays\', this.value)">' +
      optionsHtml(['28', '56', '90'], state.marketingGenerateDays, ['Last 28 days', 'Last 56 days', 'Last 90 days']) +
      '</select></label>' +
      '<label>Max tasks<input type="number" min="1" max="30" value="' +
      escapeHtml(state.marketingGenerateMaxTasks) +
      '" oninput="Admin.setField(\'marketingGenerateMaxTasks\', this.value)"></label>' +
      '<label>Language<select onchange="Admin.setField(\'marketingGenerateLanguage\', this.value)">' +
      optionsHtml(['ru', 'en'], state.marketingGenerateLanguage, ['Russian', 'English']) +
      '</select></label>' +
      '</div>' +
      '<button ' +
      (state.marketingGenerateLoading ? 'disabled' : '') +
      ' type="submit">' +
      (state.marketingGenerateLoading ? 'Analyzing... (up to a minute)' : 'Run analysis') +
      '</button>' +
      '</form>' +
      (result
        ? statsHtml([
            ['Period', escapeHtml(result.periodStart + ' — ' + result.periodEnd)],
            ['Created', result.created ? result.created.length : 0, 'success'],
            ['Reviewed (AI notes on tracked tasks)', result.reviewed || 0],
            ['Skipped (duplicates / invalid)', result.skipped],
          ]) +
          (result.diagnosis
            ? '<p class="marketingTaskSummary"><strong>Diagnosis:</strong> ' + escapeHtml(result.diagnosis) + '</p>'
            : '') +
          (result.dataErrors && result.dataErrors.length
            ? '<div class="errorList">' +
              result.dataErrors
                .map(function (e) {
                  return '<div>' + escapeHtml(e) + '</div>';
                })
                .join('') +
              '</div>'
            : '')
        : '') +
      '</section>'
    );
  }

  function marketingCreatePanelHtml() {
    return (
      '<section class="panel"><div class="panelHeader"><div><h2>Add task manually</h2></div></div>' +
      '<form class="xPostForm" onsubmit="return Admin.createMarketingTask(event)">' +
      '<label>Title<input required maxlength="200" value="' +
      escapeHtml(state.marketingNewTitle) +
      '" oninput="Admin.setField(\'marketingNewTitle\', this.value)"></label>' +
      '<div class="xPostFormRow">' +
      '<label>Category<select onchange="Admin.setField(\'marketingNewCategory\', this.value)">' +
      optionsHtml(marketingCategoryValues, state.marketingNewCategory, marketingCategoryLabels) +
      '</select></label>' +
      '<label>Priority<select onchange="Admin.setField(\'marketingNewPriority\', this.value)">' +
      optionsHtml(MARKETING_TASK_PRIORITIES, state.marketingNewPriority) +
      '</select></label>' +
      '</div>' +
      '<div class="xPostFormRow">' +
      '<label>Page (optional)<input placeholder="/en/tenders or https://..." value="' +
      escapeHtml(state.marketingNewPageUrl) +
      '" oninput="Admin.setField(\'marketingNewPageUrl\', this.value)"></label>' +
      '<label>Search query (optional)<input value="' +
      escapeHtml(state.marketingNewQuery) +
      '" oninput="Admin.setField(\'marketingNewQuery\', this.value)"></label>' +
      '</div>' +
      '<label>Description<textarea required rows="4" maxlength="3000" oninput="Admin.setField(\'marketingNewDescription\', this.value)">' +
      escapeHtml(state.marketingNewDescription) +
      '</textarea></label>' +
      '<button ' +
      (state.marketingCreateLoading ? 'disabled' : '') +
      ' type="submit">' +
      (state.marketingCreateLoading ? 'Saving...' : 'Add task') +
      '</button>' +
      '</form>' +
      '</section>'
    );
  }

  function marketingPageHtml(pageUrl) {
    if (!pageUrl) return '';
    var isAbsolute = /^https?:\/\//i.test(pageUrl);
    return isAbsolute
      ? '<a href="' + escapeHtml(pageUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(pageUrl) + '</a>'
      : '<code>' + escapeHtml(pageUrl) + '</code>';
  }

  var MARKETING_STATUS_LABELS = {
    new: 'New',
    in_progress: 'In progress',
    done: 'Done',
    rejected: 'Rejected',
  };

  var MARKETING_HISTORY_LABELS = {
    created: 'Created',
    status_changed: 'Status',
    comment: 'Comment',
    ai_review: 'AI review',
    metrics: 'Metrics',
    check: 'Check',
  };

  var MARKETING_VERDICT_TAGS = {
    implemented: ['implemented', 'green'],
    partially: ['partially done', 'orange'],
    not_implemented: ['not on site', 'red'],
    unclear: ['unclear', 'default'],
  };

  var MARKETING_EFFECT_TAGS = {
    positive: ['positive effect', 'green'],
    negative: ['negative effect', 'red'],
    none: ['no effect', 'orange'],
    too_early: ['too early', 'blue'],
    unknown: ['effect unknown', 'default'],
  };

  function marketingCheckTagsHtml(entry) {
    var verdict = MARKETING_VERDICT_TAGS[entry.verdict];
    var effect = MARKETING_EFFECT_TAGS[entry.effect];
    if (!verdict && !effect) return '';
    return (
      '<div class="marketingCheckTags">' +
      (verdict ? tagHtml(verdict[0], verdict[1]) : '') +
      (effect ? tagHtml(effect[0], effect[1]) : '') +
      '</div>'
    );
  }

  function marketingTaskPath(id) {
    return '/admin/marketing-tasks/' + id;
  }

  function marketingMetricsHtml(metrics) {
    if (!metrics) return '';
    var parts = [];
    if (metrics.clicks != null) parts.push(metrics.clicks + ' clicks');
    if (metrics.impressions != null) parts.push(metrics.impressions + ' impr.');
    if (metrics.ctr != null) parts.push('CTR ' + (metrics.ctr * 100).toFixed(1) + '%');
    if (metrics.position != null) parts.push('pos ' + metrics.position);
    if (metrics.sessions != null) parts.push(metrics.sessions + ' sessions');
    if (metrics.engagementRate != null) parts.push('engaged ' + Math.round(metrics.engagementRate * 100) + '%');
    if (metrics.keyEvents != null) parts.push(metrics.keyEvents + ' key events');
    return parts.length ? '<div class="marketingHistoryMetrics">' + escapeHtml(parts.join(' · ')) + '</div>' : '';
  }

  function marketingHistoryEntryHtml(entry) {
    var label = MARKETING_HISTORY_LABELS[entry.type] || entry.type;
    if (entry.type === 'status_changed' && entry.status) {
      label += ' → ' + (MARKETING_STATUS_LABELS[entry.status] || entry.status);
    }

    return (
      '<li class="marketingHistoryEntry marketingHistoryEntry-' + escapeHtml(entry.actor) + '">' +
      '<div class="mutedText"><strong>' + escapeHtml(label) + '</strong> &middot; ' +
      escapeHtml(entry.actor) + ' &middot; ' + fmtDateTime(entry.at) +
      (entry.periodStart ? ' &middot; data ' + escapeHtml(entry.periodStart) + ' — ' + escapeHtml(entry.periodEnd) : '') +
      '</div>' +
      marketingCheckTagsHtml(entry) +
      (entry.text ? '<div class="marketingHistoryText">' + escapeHtml(entry.text) + '</div>' : '') +
      marketingMetricsHtml(entry.metrics) +
      '</li>'
    );
  }

  // ---- board ----

  function marketingBoardCardHtml(item) {
    var target = item.query || item.pageUrl;

    return (
      '<a class="marketingCard" draggable="true" href="' + marketingTaskPath(item._id) + '"' +
      ' ondragstart="Admin.dragMarketingTask(event, \'' + item._id + '\')"' +
      ' onclick="return Admin.navigate(event, \'' + marketingTaskPath(item._id) + '\')">' +
      '<div class="marketingCardTitle">' + escapeHtml(item.title) + '</div>' +
      (target ? '<div class="marketingCardTarget">' + escapeHtml(target) + '</div>' : '') +
      '<div class="marketingCardFooter">' +
      tagHtml(item.priority, marketingPriorityTagVariant(item.priority)) +
      tagHtml(marketingCategoryLabel(item.category), 'default') +
      (item.source === 'manual' ? tagHtml('manual', 'default') : '') +
      '<span class="marketingCardMeta">' +
      (item.historyCount ? '&#128172; ' + item.historyCount + ' &middot; ' : '') +
      formatDate(item.createdAt) +
      '</span>' +
      '</div>' +
      '</a>'
    );
  }

  function marketingBoardColumnHtml(status) {
    var items = state.marketingBoard[status] || [];
    var total = state.marketingBoardTotals[status] || 0;

    return (
      '<div class="marketingColumn" data-status="' + status + '"' +
      ' ondragover="Admin.dragOverMarketingColumn(event)"' +
      ' ondragleave="Admin.dragLeaveMarketingColumn(event)"' +
      ' ondrop="Admin.dropMarketingTask(event, \'' + status + '\')">' +
      '<div class="marketingColumnHeader">' +
      '<span>' + escapeHtml(MARKETING_STATUS_LABELS[status]) + '</span>' +
      '<span class="marketingColumnCount">' + total + '</span>' +
      '</div>' +
      '<div class="marketingColumnBody">' +
      (items.map(marketingBoardCardHtml).join('') || '<p class="mutedText marketingColumnEmpty">No tasks</p>') +
      (total > items.length ? '<p class="mutedText marketingColumnEmpty">+' + (total - items.length) + ' older not shown</p>' : '') +
      '</div>' +
      '</div>'
    );
  }

  function marketingBoardHtml() {
    return (
      '<section class="panel panelWide"><div class="panelHeader"><div><h2>Board</h2>' +
      '<p>Drag a card to change its status. Open a card to see its history and add comments.</p></div>' +
      '<div class="buttonGroup">' +
      '<select onchange="Admin.setMarketingTaskFilter(\'marketingTasksPriorityFilter\', this.value)">' +
      '<option value="">All priorities</option>' +
      optionsHtml(MARKETING_TASK_PRIORITIES, state.marketingTasksPriorityFilter) +
      '</select>' +
      '<select onchange="Admin.setMarketingTaskFilter(\'marketingTasksCategoryFilter\', this.value)">' +
      '<option value="">All categories</option>' +
      optionsHtml(marketingCategoryValues, state.marketingTasksCategoryFilter, marketingCategoryLabels) +
      '</select>' +
      '<button class="secondaryButton" ' +
      (state.marketingTasksLoading ? 'disabled' : '') +
      ' onclick="Admin.loadMarketingTasks()" type="button">' +
      (state.marketingTasksLoading ? 'Loading...' : 'Refresh') +
      '</button>' +
      '</div></div>' +
      '<div class="marketingBoard">' +
      MARKETING_TASK_STATUSES.map(marketingBoardColumnHtml).join('') +
      '</div>' +
      '</section>'
    );
  }

  // ---- task page ----

  function marketingTaskEditHtml(item) {
    return (
      '<label>Title<input maxlength="200" value="' +
      escapeHtml(state.marketingEditTitle) +
      '" oninput="Admin.setField(\'marketingEditTitle\', this.value)"></label>' +
      '<label>Description<textarea rows="8" maxlength="3000" oninput="Admin.setField(\'marketingEditDescription\', this.value)">' +
      escapeHtml(state.marketingEditDescription) +
      '</textarea></label>' +
      '<label>Notes<textarea rows="3" maxlength="2000" oninput="Admin.setField(\'marketingEditNotes\', this.value)">' +
      escapeHtml(state.marketingEditNotes) +
      '</textarea></label>' +
      '<div class="buttonGroup">' +
      '<button class="secondaryButton" ' +
      (state.marketingEditSaving ? 'disabled' : '') +
      ' onclick="Admin.cancelEditMarketingTask()" type="button">Cancel</button>' +
      '<button ' +
      (state.marketingEditSaving ? 'disabled' : '') +
      ' onclick="Admin.saveMarketingTask(\'' + item._id + '\')" type="button">' +
      (state.marketingEditSaving ? 'Saving...' : 'Save') +
      '</button>' +
      '</div>'
    );
  }

  function marketingTaskDetailsHtml(item) {
    return (
      '<h2 class="marketingTaskPageTitle">' + escapeHtml(item.title) + '</h2>' +
      (item.scope || item.template || item.estimatedClicks != null
        ? '<p class="mutedText">' +
          [
            item.scope ? 'Scope: ' + escapeHtml(item.scope) : '',
            item.template ? 'Template: ' + escapeHtml(item.template) : '',
            item.estimatedClicks != null ? 'Est. extra clicks / period: +' + escapeHtml(String(item.estimatedClicks)) : '',
          ].filter(Boolean).join(' · ') +
          '</p>'
        : '') +
      '<div class="xPostBody"><p>' + escapeHtml(item.description) + '</p></div>' +
      (item.deliverable ? '<div class="marketingTaskDeliverable"><strong>Deliverable</strong><pre>' + escapeHtml(item.deliverable) + '</pre></div>' : '') +
      (item.acceptanceCriteria ? '<p class="mutedText"><strong>Done when:</strong> ' + escapeHtml(item.acceptanceCriteria) + '</p>' : '') +
      (item.evidence ? '<p class="xPostSource"><strong>Data:</strong> ' + escapeHtml(item.evidence) + '</p>' : '') +
      (item.expectedImpact ? '<p class="mutedText"><strong>Expected impact:</strong> ' + escapeHtml(item.expectedImpact) + '</p>' : '') +
      (item.notes ? '<p class="mutedText"><strong>Notes:</strong> ' + escapeHtml(item.notes) + '</p>' : '') +
      (item.summary ? '<p class="marketingTaskSummary"><strong>Progress:</strong> ' + escapeHtml(item.summary) + '</p>' : '')
    );
  }

  function marketingTaskActivityHtml(item) {
    var history = (item.history || []).slice().reverse();
    var saving = state.marketingCommentSaving;

    return (
      '<h3 class="marketingActivityTitle">Activity</h3>' +
      '<form class="marketingCommentForm" onsubmit="return Admin.addMarketingTaskComment(event, \'' + item._id + '\')">' +
      '<textarea rows="3" maxlength="2000" placeholder="What was done on the site, blockers, questions — the AI reads this on the next analysis run" oninput="Admin.setField(\'marketingCommentDraft\', this.value)">' +
      escapeHtml(state.marketingCommentDraft) +
      '</textarea>' +
      '<div class="buttonGroup"><button type="submit" ' + (saving ? 'disabled' : '') + '>' +
      (saving ? 'Saving...' : 'Add to history') +
      '</button></div>' +
      '</form>' +
      (history.length
        ? '<ul class="marketingHistoryList">' + history.map(marketingHistoryEntryHtml).join('') + '</ul>'
        : '<p class="mutedText">No history yet.</p>')
    );
  }

  function marketingTaskSidebarHtml(item) {
    var rows = [
      ['Status', '<select onchange="Admin.patchMarketingTaskField(\'' + item._id + '\', \'status\', this.value)">' +
        optionsHtml(MARKETING_TASK_STATUSES, item.status, MARKETING_TASK_STATUSES.map(function (s) {
          return MARKETING_STATUS_LABELS[s];
        })) + '</select>'],
      ['Priority', '<select onchange="Admin.patchMarketingTaskField(\'' + item._id + '\', \'priority\', this.value)">' +
        optionsHtml(MARKETING_TASK_PRIORITIES, item.priority) + '</select>'],
      ['Category', escapeHtml(marketingCategoryLabel(item.category))],
      ['Page', item.pageUrl ? marketingPageHtml(item.pageUrl) : '-'],
      ['Query', item.query ? '<strong>' + escapeHtml(item.query) + '</strong>' : '-'],
      ['Source', escapeHtml(item.source) + (item.llmModel ? ' &middot; ' + escapeHtml(item.llmModel) : '')],
      ['Data period', item.periodStart ? escapeHtml(item.periodStart + ' — ' + item.periodEnd) : '-'],
      ['Created', fmtDateTime(item.createdAt)],
      ['Updated', fmtDateTime(item.updatedAt)],
      ['Completed', item.completedAt ? fmtDateTime(item.completedAt) : '-'],
    ];

    return (
      '<section class="panel"><h2>Details</h2>' +
      '<form class="marketingCheckForm" onsubmit="return Admin.checkMarketingTask(event, \x27' + item._id + '\x27)">' +
      '<p class="mutedText">AI checks the live page and the metrics of this page/query, then writes the verdict to the history.</p>' +
      '<div class="buttonGroup">' +
      '<select onchange="Admin.setField(\x27marketingCheckDays\x27, this.value)">' +
      optionsHtml(['7', '14', '28'], state.marketingCheckDays, ['Last 7 vs prev 7 days', 'Last 14 vs prev 14 days', 'Last 28 vs prev 28 days']) +
      '</select>' +
      '<button type="submit" ' + (state.marketingCheckLoading ? 'disabled' : '') + '>' +
      (state.marketingCheckLoading ? 'Checking... (up to a minute)' : 'Run check') +
      '</button>' +
      '</div>' +
      '</form>' +
      '<dl class="marketingDetails">' +
      rows
        .map(function (row) {
          return '<dt>' + row[0] + '</dt><dd>' + row[1] + '</dd>';
        })
        .join('') +
      '</dl>' +
      '<div class="buttonGroup">' +
      (state.marketingEditing
        ? ''
        : '<button class="secondaryButton" onclick="Admin.startEditMarketingTask()" type="button">Edit</button>') +
      '<button class="secondaryButton dangerButton" onclick="Admin.deleteMarketingTask(\'' + item._id + '\')" type="button">Delete</button>' +
      '</div>' +
      '</section>'
    );
  }

  function marketingTaskPageHtml() {
    var item = state.marketingTask;
    var back =
      '<a class="marketingBackLink" href="/admin/marketing-tasks" onclick="return Admin.navigate(event, \'/admin/marketing-tasks\')">&larr; Board</a>';

    if (!item || item._id !== state.marketingTaskId) {
      return (
        '<section class="panel panelWide">' + back +
        '<p class="mutedText">' + (state.marketingTaskLoading ? 'Loading task...' : 'Task not found.') + '</p>' +
        '</section>'
      );
    }

    return (
      '<section class="panel">' +
      back +
      '<div class="marketingTaskPageTags">' +
      tagHtml(MARKETING_STATUS_LABELS[item.status] || item.status, marketingStatusTagVariant(item.status)) +
      tagHtml(item.priority, marketingPriorityTagVariant(item.priority)) +
      tagHtml(marketingCategoryLabel(item.category), 'default') +
      '</div>' +
      (state.marketingEditing ? marketingTaskEditHtml(item) : marketingTaskDetailsHtml(item)) +
      marketingTaskActivityHtml(item) +
      '</section>' +
      marketingTaskSidebarHtml(item)
    );
  }

  function marketingTasksSectionHtml() {
    if (state.marketingTaskId) return marketingTaskPageHtml();
    return marketingBoardHtml() + marketingGeneratePanelHtml() + marketingCreatePanelHtml();
  }

  // ---------------- routing ----------------

  function sectionFromPath(pathname) {
    if (pathname.indexOf('/tenders') !== -1) return 'tenders';
    if (pathname.indexOf('/users') !== -1) return 'users';
    if (pathname.indexOf('/tech') !== -1) return 'tech';
    if (pathname.indexOf('/cron') !== -1) return 'cron';
    if (pathname.indexOf('/x-posts') !== -1) return 'x-posts';
    if (pathname.indexOf('/marketing-tasks') !== -1) return 'marketing-tasks';
    return 'dashboard';
  }

  function navigate(event, path) {
    if (event) event.preventDefault();
    history.pushState(null, '', path);
    onRouteChange();
    return false;
  }

  function applyRoute() {
    var pathname = window.location.pathname;
    var taskId = marketingTaskIdFromPath(pathname);

    if (taskId !== state.marketingTaskId) {
      state.marketingEditing = false;
      state.marketingCommentDraft = '';
    }

    state.section = sectionFromPath(pathname);
    state.marketingTaskId = taskId;
  }

  function onRouteChange() {
    applyRoute();
    render();
    if (state.token) loadSectionData();
    updatePolling();
  }

  // ---------------- auth ----------------

  function signIn(event) {
    event.preventDefault();
    state.isLoading = true;
    state.message = '';
    render();

    request('/auth/adm/signin', {
      method: 'POST',
      body: JSON.stringify({ email: state.email, password: state.password }),
    })
      .then(function (response) {
        var authToken = response && response.user && response.user.token;
        if (!authToken) throw new Error('Sign in response does not include token.');
        localStorage.setItem(TOKEN_KEY, authToken);
        state.token = authToken;
        state.currentUser = response.user;
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Sign in failed';
      })
      .finally(function () {
        state.isLoading = false;
        render();
        if (state.token) {
          loadSectionData();
          updatePolling();
        }
      });

    return false;
  }

  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    stopPolling();
    state.token = '';
    state.currentUser = null;
    state.users = [];
    state.usersTotal = 0;
    state.usersPage = 1;
    state.usersPageSize = 20;
    state.tenders = [];
    state.tendersTotal = 0;
    state.tendersPage = 1;
    state.tendersPageSize = 20;
    state.sitemapResult = null;
    state.shortTitlesResult = null;
    state.generalAnalysesResult = null;
    state.generalAnalysisStatus = null;
    state.dbCopyResult = null;
    state.gatherAllStatus = null;
    state.awardTendersRefreshResult = null;
    state.xPosts = [];
    state.xPostsTotal = 0;
    state.xPostsPage = 1;
    state.xPostsPageSize = 20;
    state.xPostEditingId = null;
    render();
  }

  // ---------------- data loading ----------------

  function loadSectionData() {
    if (!state.token) return;
    state.isLoading = true;
    render();

    request('/users/adm/self', { token: state.token })
      .then(function (self) {
        state.currentUser = self;
        if (state.section === 'users') return loadUsers(state.usersPage, state.usersPageSize);
        if (state.section === 'tenders') return loadTenders(state.tendersPage, state.tendersPageSize);
        if (state.section === 'tech') return loadGatherAllStatus();
        if (state.section === 'cron') return loadCronSectionData();
        if (state.section === 'x-posts') return loadXPosts(state.xPostsPage, state.xPostsPageSize);
        if (state.section === 'marketing-tasks')
          return state.marketingTaskId ? loadMarketingTask(state.marketingTaskId) : loadMarketingTasks();
      })
      .catch(function (error) {
        if (error && error.status === 403) {
          signOut();
          return;
        }
        state.message = error && error.message ? error.message : 'Failed to load data';
      })
      .finally(function () {
        state.isLoading = false;
        render();
      });
  }

  function loadUsers(page, pageSize) {
    page = page || state.usersPage;
    pageSize = pageSize || state.usersPageSize;
    state.usersLoading = true;
    render();

    var offset = (page - 1) * pageSize;
    return request('/users/adm?limit=' + pageSize + '&offset=' + offset, { token: state.token })
      .then(function (response) {
        state.users = response.users || [];
        state.usersTotal = response.total || 0;
        state.usersPage = page;
        state.usersPageSize = pageSize;
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to load data';
      })
      .finally(function () {
        state.usersLoading = false;
        render();
      });
  }

  function loadTenders(page, pageSize) {
    page = page || state.tendersPage;
    pageSize = pageSize || state.tendersPageSize;
    state.tendersLoading = true;
    render();

    var offset = (page - 1) * pageSize;
    return request('/tenders/adm?limit=' + pageSize + '&offset=' + offset, { token: state.token })
      .then(function (response) {
        state.tenders = response.tenders || [];
        state.tendersTotal = response.total || 0;
        state.tendersPage = page;
        state.tendersPageSize = pageSize;
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to load tenders';
      })
      .finally(function () {
        state.tendersLoading = false;
        render();
      });
  }

  function loadXPosts(page, pageSize) {
    page = page || state.xPostsPage;
    pageSize = pageSize || state.xPostsPageSize;
    state.xPostsLoading = true;
    render();

    var params = 'page=' + page + '&limit=' + pageSize;
    if (state.xPostsStatusFilter) params += '&status=' + encodeURIComponent(state.xPostsStatusFilter);
    if (state.xPostsPillarFilter) params += '&pillar=' + encodeURIComponent(state.xPostsPillarFilter);

    return request('/x-posts/adm?' + params, { token: state.token })
      .then(function (response) {
        state.xPosts = response.items || [];
        state.xPostsTotal = response.total || 0;
        state.xPostsPage = page;
        state.xPostsPageSize = pageSize;
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to load X posts';
      })
      .finally(function () {
        state.xPostsLoading = false;
        render();
      });
  }

  function changePage(prefix, page) {
    if (page < 1) return;
    if (prefix === 'users') loadUsers(page, state.usersPageSize);
    else if (prefix === 'tenders') loadTenders(page, state.tendersPageSize);
    else if (prefix === 'xPosts') loadXPosts(page, state.xPostsPageSize);
  }

  function changePageSize(prefix, size) {
    size = Number(size);
    if (prefix === 'users') loadUsers(1, size);
    else if (prefix === 'tenders') loadTenders(1, size);
    else if (prefix === 'xPosts') loadXPosts(1, size);
  }

  function toggleUsersSort(key) {
    if (state.usersSortKey === key) {
      state.usersSortDir = state.usersSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.usersSortKey = key;
      state.usersSortDir = 'asc';
    }
    render();
  }

  // ---- tech status polling ----

  function loadGatherAllStatus() {
    return request('/adm/tech/tenders/gather-all-competition/status', { token: state.token })
      .then(function (status) {
        state.gatherAllStatus = status;
      })
      .catch(function () {
        state.gatherAllStatus = null;
      });
  }

  function loadAwardTendersRefreshStatus() {
    return request('/adm/tech/award-tenders/refresh/status', { token: state.token })
      .then(function (status) {
        state.awardTendersRefreshResult = status;
        state.awardTendersRefreshLoading = status.isRunning;
      })
      .catch(function () {});
  }

  function loadAwardValuesFixStatus() {
    return request('/adm/tech/award-tenders/fix-award-values/status', { token: state.token })
      .then(function (status) {
        state.awardValuesFixStatus = status;
        state.awardValuesFixLoading = status.isRunning;
      })
      .catch(function () {});
  }

  function loadAwardValueReviewItems() {
    return request(
      '/adm/tech/award-tenders/value-review/items?status=' + encodeURIComponent(state.awardValueReviewFilter),
      { token: state.token },
    )
      .then(function (response) {
        state.awardValueReviewItems = response.items || [];
        state.awardValueReviewCounts = response.counts || {};
      })
      .catch(function () {});
  }

  function loadAwardValueReviewStatus() {
    return request('/adm/tech/award-tenders/value-review/status', { token: state.token })
      .then(function (status) {
        var wasRunning = state.awardValueReviewStatus && state.awardValueReviewStatus.isRunning;
        state.awardValueReviewStatus = status;
        state.awardValueReviewLoading = status.isRunning;
        // Items grow while the review runs, so keep the list fresh until it ends
        if (status.isRunning || wasRunning || !state.awardValueReviewItems) return loadAwardValueReviewItems();
      })
      .catch(function () {});
  }

  function loadSyncIndexesStatus() {
    return request('/adm/tech/sync-indexes/status', { token: state.token })
      .then(function (status) {
        state.syncIndexesStatus = status;
        state.syncIndexesLoading = status.isRunning;
      })
      .catch(function () {});
  }

  function loadCronTasks() {
    return request('/adm/cron', { token: state.token })
      .then(function (response) {
        if (response && response.tasks && response.tasks.length) state.cronTasks = response.tasks;
      })
      .catch(function () {});
  }

  function loadRecentCompetitionTendersCronStatus() {
    return request('/adm/cron/gather-recent-competition-tenders/status', { token: state.token })
      .then(function (status) {
        state.recentCompetitionTendersCronStatus = status;
      })
      .catch(function () {});
  }

  function loadPlBzpCronStatus() {
    return request('/adm/cron/gather-pl-bzp-tenders/status', { token: state.token })
      .then(function (status) {
        state.plBzpCronStatus = status;
      })
      .catch(function () {});
  }

  function loadCronSectionData() {
    return Promise.all([
      loadCronTasks(),
      loadRecentCompetitionTendersCronStatus(),
      loadRecentAwardTendersCronStatus(),
      loadPlBzpCronStatus(),
    ]);
  }

  function loadRecentAwardTendersCronStatus() {
    return request('/adm/cron/gather-recent-award-tenders/status', { token: state.token })
      .then(function (status) {
        state.recentAwardTendersCronStatus = status;
      })
      .catch(function () {});
  }

  function loadCollectTenderBuyersStatus() {
    return request('/adm/tech/buyers/collect/status', { token: state.token })
      .then(function (status) {
        state.collectTenderBuyersResult = status;
        state.collectTenderBuyersLoading = status.isRunning;
      })
      .catch(function () {});
  }

  function loadContractorStatsRefreshStatus() {
    return request('/adm/tech/contractors/refresh-stats/status', { token: state.token })
      .then(function (status) {
        state.contractorStatsRefreshResult = status;
        state.contractorStatsRefreshLoading = status.isRunning;
      })
      .catch(function () {});
  }

  function loadGeneralAnalysisStatus() {
    return request('/adm/tech/tenders/general-analysis/status', { token: state.token })
      .then(function (status) {
        state.generalAnalysisStatus = status;
      })
      .catch(function () {});
  }

  function loadDbCopyStatus() {
    return request('/adm/tech/db-copy/status', { token: state.token })
      .then(function (status) {
        state.dbCopyResult = status;
        state.dbCopyLoading = status.isRunning;
      })
      .catch(function () {});
  }

  function updatePolling() {
    if (state.token && (state.section === 'tech' || state.section === 'cron')) startPolling();
    else stopPolling();
  }

  function startPolling() {
    stopPolling();
    pollTick();
    pollHandle = window.setInterval(pollTick, 3000);
  }

  function stopPolling() {
    if (pollHandle) {
      window.clearInterval(pollHandle);
      pollHandle = null;
    }
  }

  function pollTick() {
    if (!state.token) return;
    if (state.section === 'cron') {
      loadCronSectionData().then(render).catch(render);
      return;
    }
    Promise.all([
      loadGatherAllStatus(),
      loadAwardTendersRefreshStatus(),
      loadAwardValuesFixStatus(),
      loadAwardValueReviewStatus(),
      loadSyncIndexesStatus(),
      loadCollectTenderBuyersStatus(),
      loadContractorStatsRefreshStatus(),
      loadGeneralAnalysisStatus(),
      loadDbCopyStatus(),
    ])
      .then(render)
      .catch(render);
  }

  // ---------------- actions ----------------

  function downloadSitemapRequest(filename, url) {
    state.message = '';
    downloadBlob(url || '/adm/tech/sitemap/download', filename || 'tenders-sitemap.xml').catch(function (error) {
      state.message = error && error.message ? error.message : 'Failed to download sitemap';
      render();
    });
  }

  function generateSitemap(event) {
    event.preventDefault();
    state.sitemapLoading = true;
    state.message = '';
    render();

    request('/adm/tech/sitemap', {
      method: 'POST',
      token: state.token,
      body: JSON.stringify({
        domain: state.sitemapDomain,
        locales: state.sitemapLocales,
        maxUrlsPerFile: Number(state.sitemapMaxUrlsPerFile) || undefined,
      }),
    })
      .then(function (result) {
        state.sitemapResult = result;
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to generate sitemap';
      })
      .finally(function () {
        state.sitemapLoading = false;
        render();
      });

    return false;
  }

  function generateShortTitles(event) {
    event.preventDefault();
    state.shortTitlesLoading = true;
    state.message = '';
    render();

    request('/adm/tech/tenders/short-titles', {
      method: 'POST',
      token: state.token,
      body: JSON.stringify({
        limit: Number(state.shortTitlesLimit) || undefined,
        batchSize: Number(state.shortTitlesBatchSize) || undefined,
      }),
    })
      .then(function (result) {
        state.shortTitlesResult = result;
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to generate short titles';
      })
      .finally(function () {
        state.shortTitlesLoading = false;
        render();
      });

    return false;
  }

  function downloadTenderShortTitles() {
    state.message = '';
    downloadBlob('/adm/tech/tenders/short-titles/export', 'tender-short-titles-' + new Date().toISOString().slice(0, 10) + '.json').catch(function (error) {
      state.message = error && error.message ? error.message : 'Failed to download tender short titles';
      render();
    });
  }

  function generateGeneralAnalyses(event) {
    event.preventDefault();
    state.generalAnalysesLoading = true;
    state.message = '';
    render();

    request('/adm/tech/tenders/general-analysis', {
      method: 'POST',
      token: state.token,
      body: JSON.stringify({
        limit: Number(state.generalAnalysesLimit) || undefined,
        batchSize: Number(state.generalAnalysesBatchSize) || undefined,
      }),
    })
      .then(function (result) {
        state.generalAnalysesResult = result;
        return loadGeneralAnalysisStatus();
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to queue general analyses';
      })
      .finally(function () {
        state.generalAnalysesLoading = false;
        render();
      });

    return false;
  }

  function fixTenderLotAwardCriteria(event) {
    event.preventDefault();

    if (!state.fixAwardCriteriaDryRun) {
      var confirmed = window.confirm('Update tender lots award criteria from XML? Run dry-run first if you have not checked the expected changes.');
      if (!confirmed) return false;
    }

    state.fixAwardCriteriaLoading = true;
    state.message = '';
    render();

    request('/adm/tech/tenders/fix-lots-award-criteria', {
      method: 'POST',
      token: state.token,
      body: JSON.stringify({
        batchSize: Number(state.fixAwardCriteriaBatchSize) || undefined,
        dryRun: state.fixAwardCriteriaDryRun,
      }),
    })
      .then(function (result) {
        state.fixAwardCriteriaResult = result;
        state.message = result.dryRun ? 'Award criteria dry-run finished.' : 'Award criteria fix finished.';
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to fix lot award criteria';
      })
      .finally(function () {
        state.fixAwardCriteriaLoading = false;
        render();
      });

    return false;
  }

  function copyDatabaseDumpToCdn() {
    state.dbCopyLoading = true;
    state.message = '';
    render();

    request('/adm/tech/db-copy', { method: 'POST', token: state.token })
      .then(function (status) {
        state.dbCopyResult = status;
        state.dbCopyLoading = status.isRunning;
        state.message = 'Database dump copy started.';
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to copy database dump';
        state.dbCopyLoading = false;
      })
      .finally(function () {
        render();
      });
  }

  function syncMongoIndexes() {
    var confirmed = window.confirm(
      state.forceRebuildIndexes
        ? 'Drop and rebuild declared MongoDB indexes now? This can take a long time and can slow production queries while indexes rebuild.'
        : 'Create missing MongoDB indexes now? Existing indexes will be kept.',
    );
    if (!confirmed) return;

    state.syncIndexesLoading = true;
    state.message = '';
    render();

    request('/adm/tech/sync-indexes' + (state.forceRebuildIndexes ? '?force=true' : ''), {
      method: 'POST',
      token: state.token,
    })
      .then(function (status) {
        state.syncIndexesStatus = status;
        state.syncIndexesLoading = status.isRunning;
        state.message = state.forceRebuildIndexes ? 'Mongo index rebuild started.' : 'Mongo index synchronization started.';
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to start Mongo index synchronization';
        state.syncIndexesLoading = false;
      })
      .finally(function () {
        render();
      });
  }

  function collectBuyersFromTenders() {
    var confirmed = window.confirm('Refresh buyer stats from saved tenders and award tenders? This can take a long time.');
    if (!confirmed) return;

    state.collectTenderBuyersLoading = true;
    state.collectTenderBuyersResult = null;
    state.message = '';
    render();

    request('/adm/tech/buyers/collect', { method: 'POST', token: state.token })
      .then(function (result) {
        state.collectTenderBuyersResult = result;
        state.collectTenderBuyersLoading = result.isRunning;
        state.message = 'Buyer stats refresh started.';
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to refresh buyer stats';
        state.collectTenderBuyersLoading = false;
      })
      .finally(function () {
        render();
      });
  }

  function refreshContractorStats() {
    var confirmed = window.confirm('Refresh contractor stats from saved award tenders? This can take a long time.');
    if (!confirmed) return;

    state.contractorStatsRefreshLoading = true;
    state.contractorStatsRefreshResult = null;
    state.message = '';
    render();

    request('/adm/tech/contractors/refresh-stats', { method: 'POST', token: state.token })
      .then(function (result) {
        state.contractorStatsRefreshResult = result;
        state.contractorStatsRefreshLoading = result.isRunning;
        state.message = 'Contractor stats refresh started.';
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to refresh contractor stats';
        state.contractorStatsRefreshLoading = false;
      })
      .finally(function () {
        render();
      });
  }

  function gatherAllCompetitionTenders() {
    var confirmed = window.confirm('Start full competition tender gathering from TED? This can take a long time.');
    if (!confirmed) return;

    state.gatherAllCompetitionLoading = true;
    state.message = '';
    render();

    request('/adm/tech/tenders/gather-all-competition', {
      method: 'POST',
      token: state.token,
      body: JSON.stringify({ pageLimit: Number(state.gatherAllCompetitionPageLimit) || undefined }),
    })
      .then(function (status) {
        state.gatherAllStatus = status;
        state.gatherAllCompetitionLoading = status.isRunning;
        state.message = 'Full competition tender gathering started.';
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to start full competition tender gathering';
        state.gatherAllCompetitionLoading = false;
      })
      .finally(function () {
        render();
      });
  }

  function refreshAwardTendersHistory() {
    var confirmed = window.confirm('Refresh award tenders from TED result notices? This can take a long time.');
    if (!confirmed) return;

    state.awardTendersRefreshLoading = true;
    state.awardTendersRefreshResult = null;
    state.message = '';
    render();

    request('/adm/tech/award-tenders/refresh', {
      method: 'POST',
      token: state.token,
      body: JSON.stringify({
        pageLimit: Number(state.awardTendersRefreshPageLimit) || undefined,
        skipExistingByPublicationNumber: state.skipExistingAwardTendersByPublicationNumber,
      }),
    })
      .then(function (result) {
        state.awardTendersRefreshResult = result;
        state.awardTendersRefreshLoading = result.isRunning;
        state.message = 'Award tender refresh started.';
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to refresh award tenders';
        state.awardTendersRefreshLoading = false;
      })
      .finally(function () {
        render();
      });
  }

  function fixAwardValues(dryRun) {
    if (!dryRun) {
      var confirmed = window.confirm('Apply award value fixes to the database and refresh buyer/contractor stats?');
      if (!confirmed) return;
    }

    state.awardValuesFixLoading = true;
    state.message = '';
    render();

    request('/adm/tech/award-tenders/fix-award-values', {
      method: 'POST',
      token: state.token,
      body: JSON.stringify({
        dryRun: dryRun,
        refetchXml: state.awardValuesFixRefetchXml,
      }),
    })
      .then(function (status) {
        state.awardValuesFixStatus = status;
        state.awardValuesFixLoading = status.isRunning;
        state.message = dryRun ? 'Award values dry run started.' : 'Award values fix started.';
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to start award values fix';
        state.awardValuesFixLoading = false;
      })
      .finally(function () {
        render();
      });
  }

  function startAwardValueReview() {
    state.awardValueReviewLoading = true;
    state.message = '';
    render();

    request('/adm/tech/award-tenders/value-review', {
      method: 'POST',
      token: state.token,
      body: JSON.stringify({
        minAwardValueEur: Number(state.awardValueReviewMinM) * 1e6 || undefined,
        limit: Number(state.awardValueReviewLimit) || undefined,
        recheck: state.awardValueReviewRecheck,
      }),
    })
      .then(function (status) {
        state.awardValueReviewStatus = status;
        state.awardValueReviewLoading = status.isRunning;
        state.message = 'Award value review started.';
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to start award value review';
        state.awardValueReviewLoading = false;
      })
      .finally(render);
  }

  function stopAwardValueReview() {
    request('/adm/tech/award-tenders/value-review/stop', { method: 'POST', token: state.token })
      .then(function (status) {
        state.awardValueReviewStatus = status;
      })
      .catch(function () {})
      .finally(render);
  }

  function setAwardValueReviewFilter(value) {
    state.awardValueReviewFilter = value;
    state.awardValueReviewItems = null;
    render();
    loadAwardValueReviewItems().then(render);
  }

  function awardValueReviewAction(action, ids) {
    if (!ids.length) return;

    state.awardValueReviewBusy = true;
    state.message = '';
    render();

    request('/adm/tech/award-tenders/value-review/' + action, {
      method: 'POST',
      token: state.token,
      body: JSON.stringify({ ids: ids }),
    })
      .then(function (result) {
        state.message =
          action === 'apply'
            ? 'Applied: ' + result.applied + (result.stale ? ', stale (values changed since review): ' + result.stale : '')
            : 'Rejected: ' + result.rejected;
        return loadAwardValueReviewItems();
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to ' + action + ' award value review';
      })
      .finally(function () {
        state.awardValueReviewBusy = false;
        render();
      });
  }

  function applyAllAwardValueReviews() {
    var ids = (state.awardValueReviewItems || [])
      .filter(function (item) {
        return item.status === 'pending';
      })
      .map(function (item) {
        return item._id;
      });
    if (!window.confirm('Apply ' + ids.length + ' suggested award value changes and refresh buyer/contractor stats?')) return;
    awardValueReviewAction('apply', ids);
  }

  function backfillAwardDates() {
    var confirmed = window.confirm('Recompute awardDate for all award tenders?');
    if (!confirmed) return;

    state.awardDatesBackfillLoading = true;
    state.message = '';
    render();

    request('/adm/tech/award-tenders/backfill-award-dates', { method: 'POST', token: state.token })
      .then(function (result) {
        state.message =
          'Award dates recomputed: ' +
          result.modified +
          ' changed of ' +
          result.matched +
          ', ' +
          result.withoutAwardDate +
          ' without award date.';
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to recompute award dates';
      })
      .finally(function () {
        state.awardDatesBackfillLoading = false;
        render();
      });
  }

  function backfillAwardCountries() {
    var confirmed = window.confirm('Fill missing award countries from lead buyer countries?');
    if (!confirmed) return;

    state.awardCountriesBackfillLoading = true;
    state.message = '';
    render();

    request('/adm/tech/award-tenders/backfill-award-countries', { method: 'POST', token: state.token })
      .then(function (result) {
        state.message =
          'Award countries filled: ' + result.filled + ', still without country: ' + result.withoutCountry + '.';
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to fill award countries';
      })
      .finally(function () {
        state.awardCountriesBackfillLoading = false;
        render();
      });
  }

  function runCronTask(index) {
    var task = state.cronTasks[index];
    if (!task) return;
    var confirmed = window.confirm('Run cron task "' + task.title + '" now? This can take a long time.');
    if (!confirmed) return;

    state.cronTaskLoadingById[task.id] = true;
    state.cronRunResult = null;
    state.message = '';
    render();

    request('/adm/cron/' + task.id, { method: 'POST', token: state.token })
      .then(function (result) {
        state.cronRunResult = result;
        state.message =
          'Cron task "' + task.title + '" ' + (result && result.result && result.result.started ? 'started in the background.' : 'finished.');
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to run cron task';
      })
      .finally(function () {
        state.cronTaskLoadingById[task.id] = false;
        render();
      });
  }

  function toggleCronTask(index) {
    var task = state.cronTasks[index];
    if (!task || !task.scheduled || !task.schedule) return;

    var action = task.schedule.enabled ? 'disable' : 'enable';
    state.cronTaskLoadingById[task.id] = true;
    state.message = '';
    render();

    request('/adm/cron/' + task.id + '/' + action, { method: 'POST', token: state.token })
      .then(function () {
        return loadCronTasks();
      })
      .then(function () {
        state.message = 'Cron task "' + task.title + '" ' + action + 'd.';
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to ' + action + ' cron task';
      })
      .finally(function () {
        state.cronTaskLoadingById[task.id] = false;
        render();
      });
  }

  function generateXPost(event) {
    event.preventDefault();

    state.xPostGenerateLoading = true;
    state.message = '';
    render();

    request('/x-posts/adm/generate', {
      method: 'POST',
      token: state.token,
      body: JSON.stringify({
        topic: state.xPostTopic.trim() || undefined,
        pillar: state.xPostPillar || undefined,
        storyAngle: X_POST_STORY_ANGLES_BY_PILLAR[state.xPostPillar] ? state.xPostStoryAngle || undefined : undefined,
        format: state.xPostFormat || undefined,
        tone: state.xPostTone || undefined,
        notes: state.xPostNotes || undefined,
      }),
    })
      .then(function () {
        state.xPostTopic = '';
        state.xPostTone = '';
        state.xPostNotes = '';
        state.message = 'Draft generated.';
        return loadXPosts(1, state.xPostsPageSize);
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to generate X post';
      })
      .finally(function () {
        state.xPostGenerateLoading = false;
        render();
      });

    return false;
  }

  function setXPostFilter(name, value) {
    state[name] = value;
    loadXPosts(1, state.xPostsPageSize);
  }

  function startEditXPost(id) {
    var item = state.xPosts.filter(function (p) {
      return p._id === id;
    })[0];
    if (!item) return;

    state.xPostEditingId = id;
    state.xPostEditPosts = item.posts.join('\n---\n');
    state.xPostEditHashtags = (item.hashtags || []).join(', ');
    state.xPostEditNotes = item.notes || '';
    state.xPostEditStatus = item.status;
    render();
  }

  function cancelEditXPost() {
    state.xPostEditingId = null;
    render();
  }

  function saveXPost(id) {
    var posts = state.xPostEditPosts
      .split('\n---\n')
      .map(function (p) {
        return p.trim();
      })
      .filter(Boolean);

    if (!posts.length) {
      state.message = 'Posts cannot be empty.';
      render();
      return;
    }

    var hashtags = state.xPostEditHashtags
      .split(',')
      .map(function (h) {
        return h.trim().replace(/^#/, '');
      })
      .filter(Boolean);

    state.xPostEditSaving = true;
    state.message = '';
    render();

    request('/x-posts/adm/' + id, {
      method: 'PATCH',
      token: state.token,
      body: JSON.stringify({
        posts: posts,
        hashtags: hashtags,
        notes: state.xPostEditNotes || undefined,
        status: state.xPostEditStatus || undefined,
      }),
    })
      .then(function () {
        state.xPostEditingId = null;
        state.message = 'X post updated.';
        return loadXPosts(state.xPostsPage, state.xPostsPageSize);
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to update X post';
      })
      .finally(function () {
        state.xPostEditSaving = false;
        render();
      });
  }

  function regenerateXPostImage(id) {
    state.xPostImageLoadingById[id] = true;
    state.message = '';
    render();

    request('/x-posts/adm/' + id + '/image', { method: 'POST', token: state.token })
      .then(function () {
        state.message = 'Image regenerated.';
        return loadXPosts(state.xPostsPage, state.xPostsPageSize);
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to render image';
      })
      .finally(function () {
        state.xPostImageLoadingById[id] = false;
        render();
      });
  }

  function deleteXPost(id) {
    var confirmed = window.confirm('Delete this X post draft? This cannot be undone.');
    if (!confirmed) return;

    state.message = '';

    request('/x-posts/adm/' + id, { method: 'DELETE', token: state.token })
      .then(function () {
        state.message = 'X post deleted.';
        return loadXPosts(state.xPostsPage, state.xPostsPageSize);
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to delete X post';
      })
      .finally(function () {
        render();
      });
  }

  function marketingTaskIdFromPath(pathname) {
    var match = /\/marketing-tasks\/([a-f0-9]{24})/i.exec(pathname);
    return match ? match[1] : null;
  }

  // Open tasks are ordered by priority; closed ones show the latest first.
  var MARKETING_BOARD_QUERIES = {
    new: 'sort=priority&limit=100',
    in_progress: 'sort=priority&limit=100',
    done: 'sort=recent&limit=30',
    rejected: 'sort=recent&limit=30',
  };

  function loadMarketingTasks() {
    state.marketingTasksLoading = true;
    render();

    var filters = '';
    if (state.marketingTasksPriorityFilter) filters += '&priority=' + encodeURIComponent(state.marketingTasksPriorityFilter);
    if (state.marketingTasksCategoryFilter) filters += '&category=' + encodeURIComponent(state.marketingTasksCategoryFilter);

    return Promise.all(
      MARKETING_TASK_STATUSES.map(function (status) {
        return request('/marketing-tasks/adm?status=' + status + '&' + MARKETING_BOARD_QUERIES[status] + filters, {
          token: state.token,
        });
      }),
    )
      .then(function (responses) {
        MARKETING_TASK_STATUSES.forEach(function (status, idx) {
          state.marketingBoard[status] = responses[idx].items || [];
          state.marketingBoardTotals[status] = responses[idx].total || 0;
        });
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to load marketing tasks';
      })
      .finally(function () {
        state.marketingTasksLoading = false;
        render();
      });
  }

  function loadMarketingTask(id) {
    state.marketingTaskLoading = true;
    render();

    return request('/marketing-tasks/adm/' + id, { token: state.token })
      .then(function (task) {
        state.marketingTask = task;
      })
      .catch(function (error) {
        state.marketingTask = null;
        state.message = error && error.message ? error.message : 'Failed to load task';
      })
      .finally(function () {
        state.marketingTaskLoading = false;
        render();
      });
  }

  function generateMarketingTasks(event) {
    event.preventDefault();

    state.marketingGenerateLoading = true;
    state.marketingGenerateResult = null;
    state.message = '';
    render();

    request('/marketing-tasks/adm/generate', {
      method: 'POST',
      token: state.token,
      body: JSON.stringify({
        days: Number(state.marketingGenerateDays) || undefined,
        maxTasks: Number(state.marketingGenerateMaxTasks) || undefined,
        language: state.marketingGenerateLanguage || undefined,
      }),
    })
      .then(function (result) {
        state.marketingGenerateResult = result;
        state.message = 'Analysis finished: ' + (result.created ? result.created.length : 0) + ' new task(s).';
        return loadMarketingTasks();
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to run marketing analysis';
      })
      .finally(function () {
        state.marketingGenerateLoading = false;
        render();
      });

    return false;
  }

  function createMarketingTask(event) {
    event.preventDefault();

    state.marketingCreateLoading = true;
    state.message = '';
    render();

    request('/marketing-tasks/adm', {
      method: 'POST',
      token: state.token,
      body: JSON.stringify({
        title: state.marketingNewTitle.trim(),
        description: state.marketingNewDescription.trim(),
        category: state.marketingNewCategory,
        priority: state.marketingNewPriority,
        pageUrl: state.marketingNewPageUrl.trim() || undefined,
        query: state.marketingNewQuery.trim() || undefined,
      }),
    })
      .then(function () {
        state.marketingNewTitle = '';
        state.marketingNewDescription = '';
        state.marketingNewPageUrl = '';
        state.marketingNewQuery = '';
        state.message = 'Task added.';
        return loadMarketingTasks();
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to add task';
      })
      .finally(function () {
        state.marketingCreateLoading = false;
        render();
      });

    return false;
  }

  function setMarketingTaskFilter(name, value) {
    state[name] = value;
    loadMarketingTasks();
  }

  /** PATCHes a task and refreshes whichever view is open (task page or board). */
  function patchMarketingTask(id, body, successMessage) {
    state.message = '';

    return request('/marketing-tasks/adm/' + id, {
      method: 'PATCH',
      token: state.token,
      body: JSON.stringify(body),
    })
      .then(function (task) {
        state.message = successMessage;
        if (state.marketingTaskId === id) {
          state.marketingTask = task;
          render();
          return;
        }
        return loadMarketingTasks();
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to update task';
        render();
      });
  }

  function patchMarketingTaskField(id, field, value) {
    var body = {};
    body[field] = value;
    patchMarketingTask(id, body, 'Task ' + field + ' changed to ' + value + '.');
  }

  function dragMarketingTask(event, id) {
    event.dataTransfer.setData('text/plain', id);
    event.dataTransfer.effectAllowed = 'move';
  }

  function dragOverMarketingColumn(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    event.currentTarget.classList.add('marketingColumnDropTarget');
  }

  function dragLeaveMarketingColumn(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      event.currentTarget.classList.remove('marketingColumnDropTarget');
    }
  }

  function dropMarketingTask(event, status) {
    event.preventDefault();
    event.currentTarget.classList.remove('marketingColumnDropTarget');

    var id = event.dataTransfer.getData('text/plain');
    var fromStatus = MARKETING_TASK_STATUSES.filter(function (s) {
      return (state.marketingBoard[s] || []).some(function (t) {
        return t._id === id;
      });
    })[0];
    if (!id || !fromStatus || fromStatus === status) return;

    // Move the card right away; the reload after PATCH brings the real order.
    var item = state.marketingBoard[fromStatus].filter(function (t) {
      return t._id === id;
    })[0];
    state.marketingBoard[fromStatus] = state.marketingBoard[fromStatus].filter(function (t) {
      return t._id !== id;
    });
    state.marketingBoard[status] = [Object.assign({}, item, { status: status })].concat(state.marketingBoard[status]);
    state.marketingBoardTotals[fromStatus] -= 1;
    state.marketingBoardTotals[status] += 1;
    render();

    patchMarketingTask(id, { status: status }, 'Moved to ' + MARKETING_STATUS_LABELS[status] + '.');
  }

  function startEditMarketingTask() {
    var item = state.marketingTask;
    if (!item) return;

    state.marketingEditing = true;
    state.marketingEditTitle = item.title || '';
    state.marketingEditDescription = item.description || '';
    state.marketingEditNotes = item.notes || '';
    render();
  }

  function cancelEditMarketingTask() {
    state.marketingEditing = false;
    render();
  }

  function saveMarketingTask(id) {
    if (!state.marketingEditTitle.trim() || !state.marketingEditDescription.trim()) {
      state.message = 'Title and description cannot be empty.';
      render();
      return;
    }

    state.marketingEditSaving = true;
    render();

    patchMarketingTask(
      id,
      {
        title: state.marketingEditTitle.trim(),
        description: state.marketingEditDescription.trim(),
        notes: state.marketingEditNotes,
      },
      'Task updated.',
    ).finally(function () {
      state.marketingEditing = false;
      state.marketingEditSaving = false;
      render();
    });
  }

  function addMarketingTaskComment(event, id) {
    if (event) event.preventDefault();

    var text = state.marketingCommentDraft.trim();
    if (!text) return false;

    state.marketingCommentSaving = true;
    state.message = '';
    render();

    request('/marketing-tasks/adm/' + id + '/comments', {
      method: 'POST',
      token: state.token,
      body: JSON.stringify({ text: text }),
    })
      .then(function (task) {
        state.marketingTask = task;
        state.marketingCommentDraft = '';
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to add comment';
      })
      .finally(function () {
        state.marketingCommentSaving = false;
        render();
      });

    return false;
  }

  function checkMarketingTask(event, id) {
    if (event) event.preventDefault();

    state.marketingCheckLoading = true;
    state.message = '';
    render();

    request('/marketing-tasks/adm/' + id + '/check', {
      method: 'POST',
      token: state.token,
      body: JSON.stringify({ days: Number(state.marketingCheckDays) || undefined }),
    })
      .then(function (result) {
        state.marketingTask = result.task;
        state.message =
          'Check finished.' +
          (result.dataErrors && result.dataErrors.length ? ' Data errors: ' + result.dataErrors.join('; ') : '');
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to check task';
      })
      .finally(function () {
        state.marketingCheckLoading = false;
        render();
      });

    return false;
  }

  function deleteMarketingTask(id) {
    var confirmed = window.confirm('Delete this task? Consider marking it "rejected" instead, so the AI does not suggest it again.');
    if (!confirmed) return;

    state.message = '';

    request('/marketing-tasks/adm/' + id, { method: 'DELETE', token: state.token })
      .then(function () {
        state.message = 'Task deleted.';
        navigate(null, '/admin/marketing-tasks');
      })
      .catch(function (error) {
        state.message = error && error.message ? error.message : 'Failed to delete task';
        render();
      });
  }

  // ---------------- init ----------------

  function init() {
    var savedToken = window.localStorage.getItem(TOKEN_KEY);
    if (savedToken) state.token = savedToken;
    applyRoute();
    render();

    if (state.token) {
      loadSectionData();
      updatePolling();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('popstate', onRouteChange);

  window.Admin = {
    navigate: navigate,
    signIn: signIn,
    signOut: signOut,
    setField: function (name, value) {
      state[name] = value;
    },
    setCheckbox: function (name, value) {
      state[name] = value;
      render();
    },
    loadUsers: function () {
      loadUsers(state.usersPage, state.usersPageSize);
    },
    loadTenders: function () {
      loadTenders(state.tendersPage, state.tendersPageSize);
    },
    toggleUsersSort: toggleUsersSort,
    changePage: changePage,
    changePageSize: changePageSize,
    generateSitemap: generateSitemap,
    downloadSitemap: function () {
      downloadSitemapRequest(null, null);
    },
    downloadSitemapFile: function (index) {
      var f = state.sitemapResult && state.sitemapResult.sitemapFiles[index];
      downloadSitemapRequest(f ? f.filename : null, f ? f.downloadUrl : null);
    },
    generateShortTitles: generateShortTitles,
    downloadTenderShortTitles: downloadTenderShortTitles,
    generateGeneralAnalyses: generateGeneralAnalyses,
    fixTenderLotAwardCriteria: fixTenderLotAwardCriteria,
    copyDatabaseDumpToCdn: copyDatabaseDumpToCdn,
    syncMongoIndexes: syncMongoIndexes,
    collectBuyersFromTenders: collectBuyersFromTenders,
    refreshContractorStats: refreshContractorStats,
    gatherAllCompetitionTenders: gatherAllCompetitionTenders,
    refreshAwardTendersHistory: refreshAwardTendersHistory,
    fixAwardValues: fixAwardValues,
    startAwardValueReview: startAwardValueReview,
    stopAwardValueReview: stopAwardValueReview,
    setAwardValueReviewFilter: setAwardValueReviewFilter,
    applyAwardValueReviews: function (ids) {
      awardValueReviewAction('apply', ids);
    },
    rejectAwardValueReviews: function (ids) {
      awardValueReviewAction('reject', ids);
    },
    applyAllAwardValueReviews: applyAllAwardValueReviews,
    backfillAwardDates: backfillAwardDates,
    backfillAwardCountries: backfillAwardCountries,
    runCronTask: runCronTask,
    toggleCronTask: toggleCronTask,
    generateXPost: generateXPost,
    loadXPosts: function () {
      loadXPosts(state.xPostsPage, state.xPostsPageSize);
    },
    setXPostFilter: setXPostFilter,
    startEditXPost: startEditXPost,
    cancelEditXPost: cancelEditXPost,
    saveXPost: saveXPost,
    deleteXPost: deleteXPost,
    regenerateXPostImage: regenerateXPostImage,
    loadMarketingTasks: function () {
      loadMarketingTasks();
    },
    generateMarketingTasks: generateMarketingTasks,
    createMarketingTask: createMarketingTask,
    setMarketingTaskFilter: setMarketingTaskFilter,
    patchMarketingTaskField: patchMarketingTaskField,
    dragMarketingTask: dragMarketingTask,
    dragOverMarketingColumn: dragOverMarketingColumn,
    dragLeaveMarketingColumn: dragLeaveMarketingColumn,
    dropMarketingTask: dropMarketingTask,
    startEditMarketingTask: startEditMarketingTask,
    cancelEditMarketingTask: cancelEditMarketingTask,
    saveMarketingTask: saveMarketingTask,
    deleteMarketingTask: deleteMarketingTask,
    addMarketingTaskComment: addMarketingTaskComment,
    checkMarketingTask: checkMarketingTask,
  };
})();
