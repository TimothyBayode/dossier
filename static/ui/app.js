/**
 * The panel and the console are the same app: the Forge context decides which
 * one is on screen. On an issue the panel compiles four views of that issue. On
 * a global page the console summarises a project over a date window.
 *
 * All data comes through `invoke('resolver', …)`, the same service functions the
 * Rovo actions call. Nothing is re-derived in the browser.
 */
(function () {
  'use strict';

  var bridge = window.forgeBridge || {};
  var invoke = bridge.invoke;
  var view = bridge.view;

  var BUDGETS = [400, 800, 1500, 3000, 6000, 8000];
  var WINDOWS = [7, 14, 30, 90];
  var STORAGE_KEY = 'dossier.budget';
  var DEFAULT_BUDGET = 1500;

  var TABS = [
    { key: 'dossier', label: 'Dossier', action: 'compile' },
    { key: 'related', label: 'Related', action: 'related' },
    { key: 'owners', label: 'People', action: 'owners' },
    { key: 'changes', label: 'Changes', action: 'changes' },
  ];

  var app = document.getElementById('app');
  var state = {
    issueKey: null,
    budget: readBudget(),
    tab: 'dossier',
    project: '',
    windowDays: 14,
    results: {},
    pending: {},
    error: null,
    publish: 'idle',
    publishMessage: null,
  };

  function readBudget() {
    try {
      var stored = Number(window.localStorage.getItem(STORAGE_KEY));
      return BUDGETS.indexOf(stored) === -1 ? DEFAULT_BUDGET : stored;
    } catch (error) {
      return DEFAULT_BUDGET;
    }
  }

  function writeBudget(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch (error) {
      /* a sandboxed iframe may refuse storage; the in-memory value still works */
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** The dossier is a constrained dialect: headings, quotes, bullets, emphasis, links. */
  function inline(value) {
    return escapeHtml(value)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/(^|[\s(])_([^_]+)_(?=[\s.,)]|$)/g, '$1<em>$2</em>')
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
      );
  }

  function renderMarkdown(markdown) {
    var lines = String(markdown || '').split('\n');
    var out = [];
    var footer = [];
    var paragraph = [];
    var list = [];
    var quote = [];

    function flushParagraph() {
      if (!paragraph.length) return;
      out.push('<p>' + inline(paragraph.join(' ')) + '</p>');
      paragraph = [];
    }

    function flushList() {
      if (!list.length) return;
      out.push('<ul>' + list.map(function (item) {
        return '<li>' + inline(item) + '</li>';
      }).join('') + '</ul>');
      list = [];
    }

    function flushQuote() {
      if (!quote.length) return;
      out.push('<blockquote><p>' + inline(quote.join(' ')) + '</p></blockquote>');
      quote = [];
    }

    function flushAll() {
      flushParagraph();
      flushList();
      flushQuote();
    }

    for (var i = 0; i < lines.length; i += 1) {
      var trimmed = lines[i].trim();

      if (!trimmed) {
        flushAll();
        continue;
      }

      if (trimmed.indexOf('## ') === 0) {
        flushAll();
        out.push('<h2>' + inline(trimmed.slice(3)) + '</h2>');
        continue;
      }

      if (trimmed.indexOf('# ') === 0) {
        flushAll();
        out.push('<h1>' + inline(trimmed.slice(2)) + '</h1>');
        continue;
      }

      if (trimmed.indexOf('> ') === 0) {
        flushParagraph();
        flushList();
        quote.push(trimmed.slice(2));
        continue;
      }

      if (trimmed.indexOf('- ') === 0) {
        flushParagraph();
        flushQuote();
        list.push(trimmed.slice(2));
        continue;
      }

      // The compiler's trailing provenance lines are wrapped in underscores.
      if (/^_.*_$/.test(trimmed)) {
        flushAll();
        footer.push('<em>' + inline(trimmed.slice(1, -1)) + '</em>');
        continue;
      }

      flushList();
      flushQuote();
      paragraph.push(trimmed);
    }

    flushAll();

    var html = out.join('');
    if (footer.length) {
      html += '<footer>' + footer.map(function (line) {
        return '<p>' + line + '</p>';
      }).join('') + '</footer>';
    }
    return html;
  }

  function isConsole() {
    return !state.issueKey;
  }

  function budgetOptions() {
    return BUDGETS.map(function (value) {
      return '<option value="' + value + '"' + (value === state.budget ? ' selected' : '') + '>' +
        (value === DEFAULT_BUDGET ? value + ' (default)' : value) + '</option>';
    }).join('');
  }

  function windowOptions() {
    return WINDOWS.map(function (value) {
      return '<option value="' + value + '"' + (value === state.windowDays ? ' selected' : '') + '>Last ' +
        value + ' days</option>';
    }).join('');
  }

  function projectOf(issueKey) {
    return String(issueKey || '').split('-')[0];
  }

  function daysAgo(days) {
    return new Date(Date.now() - days * 86400000).toISOString();
  }

  function shell() {
    var header = isConsole()
      ? '<header class="header">' +
          '<div class="brand">' + markSvg() +
            '<div>' +
              '<h1 class="title">Dossier console</h1>' +
              '<p class="subtitle">What moved, and who knows it, across a project.</p>' +
            '</div>' +
          '</div>' +
          '<span class="key">Project</span>' +
        '</header>'
      : '<header class="header">' +
          '<div class="brand">' + markSvg() +
            '<div>' +
              '<h1 class="title">Dossier</h1>' +
              '<p class="subtitle">Context an agent can trust, inside a budget.</p>' +
            '</div>' +
          '</div>' +
          '<span class="key" title="This panel is scoped to the issue you are viewing">' +
            escapeHtml(state.issueKey) +
          '</span>' +
        '</header>';

    var controls = isConsole()
      ? '<form class="controls" id="form">' +
          '<div class="field grow">' +
            '<label for="project">Project key</label>' +
            '<input id="project" name="project" placeholder="PROJ" autocomplete="off" spellcheck="false" ' +
              'value="' + escapeHtml(state.project) + '" required />' +
          '</div>' +
          '<div class="field">' +
            '<label for="window">Window</label>' +
            '<select id="window" name="window">' + windowOptions() + '</select>' +
          '</div>' +
          '<button type="submit" id="run">Summarise</button>' +
        '</form>'
      : '<form class="controls" id="form">' +
          '<div class="field">' +
            '<label for="budget">Token budget</label>' +
            '<select id="budget" name="budget">' + budgetOptions() + '</select>' +
          '</div>' +
          '<button type="submit" id="run">Compile dossier</button>' +
          '<button type="button" class="secondary" data-act="refresh" title="Read the issue and graph again">' +
            'Refresh' +
          '</button>' +
        '</form>';

    var tabs = isConsole()
      ? ''
      : '<div class="tabs" role="tablist" aria-label="Dossier views">' +
          TABS.map(function (tab) {
            var selected = tab.key === state.tab;
            return '<button type="button" role="tab" class="tab" data-tab="' + tab.key + '" ' +
              'aria-selected="' + (selected ? 'true' : 'false') + '">' + tab.label + '</button>';
          }).join('') +
        '</div>';

    return header + controls +
      '<div id="alert" hidden></div>' +
      tabs +
      '<div id="results" role="tabpanel"></div>';
  }

  function markSvg() {
    return '<svg class="mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">' +
      '<rect width="32" height="32" rx="7" fill="#1e40af"/>' +
      '<path d="M10 6h8l5 5v15a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" fill="#f8fafc"/>' +
      '<path d="M18 6l5 5h-5z" fill="#93c5fd"/>' +
      '<rect x="12.5" y="14" width="7" height="1.8" rx="0.9" fill="#1e3a8a"/>' +
      '<rect x="12.5" y="18" width="7" height="1.8" rx="0.9" fill="#1e3a8a"/>' +
      '<rect x="12.5" y="22" width="4.5" height="1.8" rx="0.9" fill="#f59e0b"/>' +
    '</svg>';
  }

  function activeTab() {
    return isConsole() ? 'changes' : state.tab;
  }

  function render() {
    app.innerHTML = shell();

    var form = document.getElementById('form');
    var alert = document.getElementById('alert');
    var results = document.getElementById('results');

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (isConsole()) {
        state.project = String(document.getElementById('project').value || '').trim().toUpperCase();
        state.windowDays = Number(document.getElementById('window').value) || 14;
        load('changes', true);
        return;
      }
      state.budget = Number(document.getElementById('budget').value) || DEFAULT_BUDGET;
      writeBudget(state.budget);
      state.tab = 'dossier';
      load('dossier', true);
    });

    var refresh = form.querySelector('[data-act="refresh"]');
    if (refresh) {
      refresh.addEventListener('click', function () {
        load(state.tab, true);
      });
    }

    var tabs = app.querySelectorAll('[data-tab]');
    for (var i = 0; i < tabs.length; i += 1) {
      tabs[i].addEventListener('click', function (event) {
        var tab = event.currentTarget.getAttribute('data-tab');
        if (tab === state.tab) return;
        state.tab = tab;
        state.error = null;
        state.publish = 'idle';
        state.publishMessage = null;
        render();
        if (!state.results[tab] && !state.pending[tab]) load(tab, false);
      });
    }

    if (state.error) {
      alert.hidden = false;
      alert.className = 'alert';
      alert.setAttribute('role', 'alert');
      alert.textContent = state.error;
    }

    results.innerHTML = resultsHtml();
    wireResults(results);
  }

  function resultsHtml() {
    var tab = activeTab();

    if (state.pending[tab]) {
      return '<div class="empty" role="status">' + loadingLabel(tab) + '</div>';
    }

    var result = state.results[tab];
    if (!result) return '<div class="empty">' + idleLabel(tab) + '</div>';

    var parts = [];
    if (tab === 'dossier') parts.push(dossierMetrics(result));
    else parts.push(countsLine(tab, result));

    parts.push('<div class="document">' + renderMarkdown(result.markdown) + '</div>');
    parts.push(actionsHtml(tab, result));
    if (tab === 'dossier') parts.push(publishHtml());
    return parts.join('');
  }

  function loadingLabel(tab) {
    if (tab === 'dossier') return 'Reading the issue, its comments, the graph and the sibling work…';
    if (tab === 'related') return 'Searching the graph and the sibling work…';
    if (tab === 'owners') return 'Reading who has touched this work…';
    return 'Reading the window and the changelogs…';
  }

  function idleLabel(tab) {
    if (tab === 'dossier') return 'Compile this issue to see the brief an agent would receive.';
    if (tab === 'related') return 'Find the work that is about the same thing, and why.';
    if (tab === 'owners') return 'Rank the people who have actually touched this work.';
    return 'Summarise what moved in this project.';
  }

  function dossierMetrics(result) {
    var used = Number(result.used) || 0;
    var cap = Number(result.cap) || DEFAULT_BUDGET;
    var pct = Math.max(2, Math.min(100, Math.round((used / cap) * 100)));
    var dropped = Array.isArray(result.dropped) ? result.dropped : [];
    var sections = Array.isArray(result.sections) ? result.sections : [];

    var chips = dropped.length
      ? dropped.map(function (entry) {
          return '<span class="chip">' + escapeHtml(entry.count + ' dropped: ' + entry.title) + '</span>';
        }).join('')
      : '<span class="chip ok">Nothing left out</span>';

    if (result.overBudget) chips += '<span class="chip">Identity facts exceed this budget</span>';
    if (Number(result.graphUnavailable) > 0) {
      chips += '<span class="chip">Graph unavailable, dossier may be thinner</span>';
    }

    var meta = [
      '<span><strong>' + used + '</strong> / ' + cap + ' est. tokens</span>',
      '<span>' + sections.length + ' sections</span>',
    ];
    if (typeof result.commentsRead === 'number') {
      meta.push('<span>' + result.commentsRead + ' comments read</span>');
    }

    return '<div class="metrics">' +
      '<div class="meter' + (used >= cap ? ' full' : '') + '" role="img" ' +
        'aria-label="' + used + ' of ' + cap + ' estimated tokens used">' +
        '<span style="width:' + pct + '%"></span>' +
      '</div>' +
      meta.join('') +
    '</div>' +
    '<div class="chips" style="margin:8px 0 12px">' + chips + '</div>';
  }

  function countsLine(tab, result) {
    var bits = [];
    if (tab === 'related') {
      bits.push((result.rows || []).length + ' rows');
      if (Number(result.graphUnavailable) > 0) bits.push('graph unavailable');
    } else if (tab === 'owners') {
      bits.push((result.people || []).length + ' people');
      if (typeof result.commentsRead === 'number') bits.push(result.commentsRead + ' comments read');
    } else if (tab === 'changes') {
      var counts = result.counts || {};
      bits.push((counts.moved || 0) + ' status moves');
      bits.push((counts.created || 0) + ' opened');
      bits.push((counts.resolved || 0) + ' resolved');
      bits.push((counts.stale || 0) + ' stale');
      if (typeof result.issuesScanned === 'number') bits.push(result.issuesScanned + ' issues scanned');
    }
    return '<p class="status">' + escapeHtml(bits.join(' · ')) + '</p>';
  }

  function actionsHtml(tab, result) {
    var buttons = '<button type="button" class="secondary" data-act="copy">Copy Markdown</button>';
    if (tab === 'dossier' && state.publish === 'idle') {
      buttons += '<button type="button" class="secondary" data-act="publish">Publish to issue</button>';
    }
    return '<div class="actions">' + buttons + '</div>';
  }

  function publishHtml() {
    if (state.publish === 'confirm') {
      return '<div class="notice warn">' +
        '<p>Post this brief as a comment on <strong>' + escapeHtml(state.issueKey) + '</strong>? ' +
        'This is the only write in the app: it adds a comment and changes nothing else.</p>' +
        '<div class="actions">' +
          '<button type="button" data-act="publish-confirm">Confirm publish</button>' +
          '<button type="button" class="secondary" data-act="publish-cancel">Cancel</button>' +
        '</div>' +
      '</div>';
    }
    if (state.publish === 'busy') {
      return '<div class="notice" role="status">Posting the brief…</div>';
    }
    if (state.publish === 'done') {
      return '<div class="notice ok" role="status">' + escapeHtml(state.publishMessage || 'Posted.') + '</div>';
    }
    return '';
  }

  function wireResults(results) {
    var copy = results.querySelector('[data-act="copy"]');
    if (copy) copy.addEventListener('click', copyMarkdown);

    var publish = results.querySelector('[data-act="publish"]');
    if (publish) {
      publish.addEventListener('click', function () {
        state.publish = 'confirm';
        render();
      });
    }

    var cancel = results.querySelector('[data-act="publish-cancel"]');
    if (cancel) {
      cancel.addEventListener('click', function () {
        state.publish = 'idle';
        render();
      });
    }

    var confirm = results.querySelector('[data-act="publish-confirm"]');
    if (confirm) confirm.addEventListener('click', doPublish);
  }

  function currentResult() {
    return state.results[activeTab()];
  }

  function copyMarkdown() {
    var result = currentResult();
    if (!result) return;
    var button = document.querySelector('[data-act="copy"]');
    var text = result.markdown || '';
    var done = function () {
      if (!button) return;
      button.textContent = 'Copied';
      window.setTimeout(function () { button.textContent = 'Copy Markdown'; }, 1600);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }

    function fallback() {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy');
        done();
      } catch (error) {
        if (button) button.textContent = 'Select and copy manually';
      }
      document.body.removeChild(area);
    }
  }

  function inputFor(tab) {
    if (tab === 'dossier') return { issueKey: state.issueKey, budget: state.budget };
    if (tab === 'changes') {
      return {
        projectKey: isConsole() ? state.project : projectOf(state.issueKey),
        since: daysAgo(isConsole() ? state.windowDays : 14),
        staleDays: 14,
      };
    }
    return { issueKey: state.issueKey };
  }

  async function load(tab, force) {
    if (state.pending[tab]) return;
    if (!force && state.results[tab]) {
      render();
      return;
    }

    state.error = null;
    state.publish = 'idle';
    state.publishMessage = null;

    if (isConsole() && tab === 'changes' && !state.project) {
      state.error = 'Give me a project key like PROJ.';
      render();
      return;
    }

    if (!invoke) {
      state.error = 'This preview is not running inside Jira. Deploy the app and open it on a site.';
      render();
      return;
    }

    var tabDef = TABS.filter(function (item) { return item.key === tab; })[0];
    var action = tabDef ? tabDef.action : 'changes';

    state.pending[tab] = true;
    render();

    try {
      var response = await invoke('resolver', { action: action, input: inputFor(tab) });
      if (!response || !response.ok) {
        throw new Error((response && response.error) || 'The resolver returned nothing.');
      }
      state.results[tab] = response;
    } catch (error) {
      state.error = error && error.message ? error.message : 'Something went wrong.';
    } finally {
      delete state.pending[tab];
      render();
    }
  }

  async function doPublish() {
    if (!invoke) {
      state.error = 'This preview is not running inside Jira, so it cannot publish.';
      state.publish = 'idle';
      render();
      return;
    }

    state.publish = 'busy';
    state.error = null;
    render();

    try {
      var response = await invoke('resolver', {
        action: 'publish',
        input: { issueKey: state.issueKey, budget: state.budget },
      });
      if (!response || !response.ok) {
        throw new Error((response && response.error) || 'The resolver returned nothing.');
      }
      var comment = response.commentId ? ' (comment ' + response.commentId + ')' : '';
      state.publishMessage = 'Posted to ' + state.issueKey + comment + '.';
      state.publish = 'done';
    } catch (error) {
      state.publish = 'idle';
      state.error = error && error.message ? error.message : 'Publishing failed and changed nothing.';
    }
    render();
  }

  async function boot() {
    // A local preview can pass ?issue=PROJ-123; inside Jira the context wins.
    var params = new URLSearchParams(window.location.search);
    var fromUrl = params.get('issue');

    if (view && typeof view.getContext === 'function') {
      try {
        var context = await view.getContext();
        var issue = context && context.extension && context.extension.issue;
        if (issue && issue.key) state.issueKey = String(issue.key);
      } catch (error) {
        // Standalone preview: no Forge context, fall through to the console.
      }
    }

    if (!state.issueKey && fromUrl) state.issueKey = String(fromUrl).toUpperCase();

    render();
    if (state.issueKey) load('dossier', false);
  }

  boot();
})();
