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

    cronTaskLoadingById: {},
    cronTasks: defaultCronTasks.slice(),
    cronRunResult: null,
    recentCompetitionTendersCronStatus: null,
    recentAwardTendersCronStatus: null,
  };

  var X_POST_PILLARS = [
    ['interesting_tender', '🔥 Interesting Tender'],
    ['market_insight', '📊 Market Insight'],
    ['contract_award', '🏆 Contract Award'],
    ['procurement_insight', '💡 Procurement Insight'],
  ];

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
            : state.section === 'x-posts'
              ? 'X Posts'
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
      navLinkHtml('/admin/x-posts', 'X Posts', 'x-posts') +
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
    else if (state.section === 'x-posts') inner = xPostsSectionHtml();
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
      '<p>Run scheduled jobs manually from the admin panel.</p></div></div>' +
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
        ['Industries', r.industriesCount],
        ['Countries', r.countriesCount],
      ]);
    }

    html += '</section>';
    return html;
  }

  function techSectionHtml() {
    return (
      gatherAllTagPanelHtml() +
      cronPanelHtml() +
      mongoIndexesPanelHtml() +
      competitionPanelHtml() +
      awardRefreshPanelHtml() +
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

  function xPostGeneratePanelHtml() {
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

  // ---------------- routing ----------------

  function sectionFromPath(pathname) {
    if (pathname.indexOf('/tenders') !== -1) return 'tenders';
    if (pathname.indexOf('/users') !== -1) return 'users';
    if (pathname.indexOf('/tech') !== -1) return 'tech';
    if (pathname.indexOf('/x-posts') !== -1) return 'x-posts';
    return 'dashboard';
  }

  function navigate(event, path) {
    if (event) event.preventDefault();
    history.pushState(null, '', path);
    onRouteChange();
    return false;
  }

  function onRouteChange() {
    state.section = sectionFromPath(window.location.pathname);
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
        if (state.section === 'x-posts') return loadXPosts(state.xPostsPage, state.xPostsPageSize);
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
    if (state.token && state.section === 'tech') startPolling();
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
    Promise.all([
      loadGatherAllStatus(),
      loadAwardTendersRefreshStatus(),
      loadSyncIndexesStatus(),
      loadCronTasks(),
      loadRecentCompetitionTendersCronStatus(),
      loadRecentAwardTendersCronStatus(),
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
        state.message = 'Cron task "' + task.title + '" finished.';
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

  // ---------------- init ----------------

  function init() {
    var savedToken = window.localStorage.getItem(TOKEN_KEY);
    if (savedToken) state.token = savedToken;
    state.section = sectionFromPath(window.location.pathname);
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
  };
})();
