/* =========================================================================
   clients.js — client directory & dedicated workspace portal (5.2)
   Comprehensive Client Portal:
   - Full clickable client cards (no clutter buttons)
   - Dedicated workspace view with Back navigation
   - Report & Analytics with day/month/year completion graphics
   - Client Todos & Instructions
   - Rich Markdown Workspace Text Editor with instant formatting & DB persistence
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.clients = (function () {
  'use strict';

  var searchQuery = '';
  var filterStatus = 'all'; /* all | active | paused */
  var activePortalClientId = null;
  var activePortalTab = 'report'; /* report | todos | instructions | details */
  var activeTimeframe = 'month'; /* day | month | year */
  var todoFilterState = 'all'; /* all | open | progress | done | blocked */

  function me() { return OC.store.user(OC.store.session()); }

  function editClient(client, onDone) {
    var h = OC.ui.h;
    var user = me();
    var name = h('input', { type: 'text', value: client.name || '' });
    var clientId = h('input', { type: 'text', value: client.client_id || '' });
    var clientCode = h('input', { type: 'text', value: client.client_code || '' });
    var clientNumber = h('input', { type: 'text', value: client.client_number || client.contact || '' });
    var status = OC.ui.select([
      { value: 'active', label: 'Active' },
      { value: 'paused', label: 'Paused' }
    ], client.status || 'active');

    var currentLabel = OC.ui.clientLabel ? OC.ui.clientLabel(client) : client.name;

    OC.ui.modal({
      title: 'Edit client: ' + currentLabel,
      content: h('div', {}, [
        OC.ui.field('1. Client / Company name', name, { required: true }),
        OC.ui.field('2. Client ID', clientId, { hint: 'Unique client identifier or account number (optional).' }),
        OC.ui.field('3. Client code', clientCode, { hint: 'Short ticker or abbreviation code (optional).' }),
        OC.ui.field('4. Client number', clientNumber, { hint: 'Phone / WhatsApp / Mobile contact number (optional).' }),
        OC.ui.field('Status', status)
      ]),
      actions: [
        {
          label: 'Delete client', onClick: function (close) {
            OC.ui.confirm('Delete client "' + client.name + '"? Existing tasks will remain.', function () {
              OC.store.mutate({ actor: user.id, action: 'client.delete', target: client.name }, function () {
                OC.store.state.clients = OC.store.state.clients.filter(function (c) { return c.id !== client.id; });
              });
              OC.ui.toast('Client deleted.');
              activePortalClientId = null;
              if (onDone) onDone();
              close();
            });
          }
        },
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Save', primary: true, onClick: function (close) {
            if (!name.value.trim()) return 'Client name cannot be empty.';
            OC.store.mutate({
              actor: user.id, action: 'client.update', target: name.value.trim(),
              detail: 'Updated details for ' + client.name
            }, function () {
              client.name = name.value.trim();
              client.client_id = clientId.value.trim();
              client.client_code = clientCode.value.trim();
              client.client_number = clientNumber.value.trim();
              client.contact = clientNumber.value.trim() || client.name;
              client.status = status.value;
            });
            OC.ui.toast('Client updated.');
            if (onDone) onDone();
            close();
          }
        }
      ]
    });
  }

  /* ---- Markdown Simple Formatter Helper ---- */
  function renderMarkdownPreview(rawText) {
    if (!rawText) return '<p class="muted">No details or notes added yet. Use the editor to add customized notes, specifications, or contracts.</p>';
    var escaped = rawText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    var lines = escaped.split('\n');
    var html = [];
    var inList = false;

    lines.forEach(function (line) {
      var trimmed = line.trim();
      if (trimmed.indexOf('### ') === 0) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push('<h3>' + trimmed.slice(4) + '</h3>');
      } else if (trimmed.indexOf('## ') === 0) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push('<h2>' + trimmed.slice(3) + '</h2>');
      } else if (trimmed.indexOf('# ') === 0) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push('<h2>' + trimmed.slice(2) + '</h2>');
      } else if (trimmed.indexOf('- [ ] ') === 0) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push('<div style="display:flex;align-items:center;gap:6px;margin:4px 0;"><input type="checkbox" disabled /> <span>' + trimmed.slice(6) + '</span></div>');
      } else if (trimmed.indexOf('- [x] ') === 0 || trimmed.indexOf('- [X] ') === 0) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push('<div style="display:flex;align-items:center;gap:6px;margin:4px 0;"><input type="checkbox" checked disabled /> <span style="text-decoration:line-through;color:var(--text-secondary);">' + trimmed.slice(6) + '</span></div>');
      } else if (trimmed.indexOf('- ') === 0 || trimmed.indexOf('* ') === 0) {
        if (!inList) { html.push('<ul>'); inList = true; }
        html.push('<li>' + trimmed.slice(2) + '</li>');
      } else if (trimmed.indexOf('> ') === 0) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push('<blockquote>' + trimmed.slice(2) + '</blockquote>');
      } else if (!trimmed) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push('<br/>');
      } else {
        if (inList) { html.push('</ul>'); inList = false; }
        // Inline bold, italic, code
        var formatted = line
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/`(.*?)`/g, '<code>$1</code>');
        html.push('<p style="margin:4px 0;">' + formatted + '</p>');
      }
    });

    if (inList) html.push('</ul>');
    return html.join('');
  }

  /* ---- Dedicated Client Portal View -------------------------------------- */
  function renderClientPortal(host, client, onBack) {
    var h = OC.ui.h;
    var user = me();
    var canCreate = !!(OC.can && OC.can.createClient ? OC.can.createClient(user) : (user && user.admin));

    var clientTodos = OC.store.state.todos.filter(function (t) {
      return t.client === client.id || (Array.isArray(t.clients) && t.clients.indexOf(client.id) > -1);
    });

    var clientInstructions = OC.store.state.instructions.filter(function (ins) {
      return ins.client === client.id || (Array.isArray(ins.tags) && ins.tags.indexOf(client.client_code) > -1);
    });

    var portalContainer = h('div', { class: 'client-portal-container' });

    /* 1. Header Toolbar */
    var header = h('div', { class: 'client-portal-header' }, [
      h('div', { class: 'client-portal-header-top' }, [
        h('div', { class: 'client-portal-title-wrap' }, [
          h('button', {
            class: 'client-portal-back-btn',
            type: 'button',
            onClick: function (e) {
              e.preventDefault();
              if (onBack) onBack();
            }
          }, ['← Back to Clients']),
          h('h2', { style: 'font-size:18px;font-weight:700;color:var(--ink);margin:0;' }, '🏢 ' + client.name),
          h('span', { class: 'chip ' + (client.status === 'active' ? 'dept' : 'custom') }, client.status),
          client.client_id ? h('span', { class: 'chip custom' }, 'ID: ' + client.client_id) : null,
          client.client_code ? h('span', { class: 'chip custom' }, 'Code: ' + client.client_code) : null,
          (client.client_number || client.contact) ? h('span', { class: 'chip custom' }, '📞 ' + (client.client_number || client.contact)) : null
        ].filter(Boolean)),
        canCreate ? h('button', {
          class: 'btn small', type: 'button',
          onClick: function () {
            editClient(client, function () { renderClientPortal(host, client, onBack); });
          }
        }, ['✏️ Edit Client Info']) : null
      ]),
      h('p', { class: 'muted', style: 'font-size:13px;margin:0;' },
        'Client Workspace: Review task completion graphics & reports, manage linked todos, board notices, and customize rich documentation notes.')
    ]);

    /* 2. Navigation Tabs */
    var tabs = [
      ['report', '📊 Report & Analytics'],
      ['todos', '✅ Todos (' + clientTodos.length + ')'],
      ['instructions', '📋 Instructions (' + clientInstructions.length + ')'],
      ['details', '📝 Details & Rich Workspace']
    ];

    var tabNav = h('div', { class: 'client-portal-tabs' }, tabs.map(function (t) {
      return h('button', {
        class: 'client-portal-tab-btn' + (activePortalTab === t[0] ? ' active' : ''),
        type: 'button',
        onClick: function () {
          activePortalTab = t[0];
          renderClientPortal(host, client, onBack);
        }
      }, t[1]);
    }));

    var bodyContent = h('div', { class: 'client-portal-body' });

    /* TAB 1: REPORT & ANALYTICS */
    if (activePortalTab === 'report') {
      var now = new Date();
      var filteredTodos = clientTodos.filter(function (t) {
        if (!t.created_at) return true;
        var tDate = new Date(t.created_at);
        if (activeTimeframe === 'day') {
          return (now - tDate) <= 24 * 60 * 60 * 1000;
        } else if (activeTimeframe === 'month') {
          return (now - tDate) <= 30 * 24 * 60 * 60 * 1000;
        } else if (activeTimeframe === 'year') {
          return (now - tDate) <= 365 * 24 * 60 * 60 * 1000;
        }
        return true;
      });

      var totalT = filteredTodos.length;
      var doneT = filteredTodos.filter(function (t) { return t.state === 'done'; }).length;
      var progT = filteredTodos.filter(function (t) { return t.state === 'progress'; }).length;
      var openT = filteredTodos.filter(function (t) { return t.state === 'open'; }).length;
      var blockedT = filteredTodos.filter(function (t) { return t.state === 'blocked'; }).length;
      var rate = totalT > 0 ? Math.round((doneT / totalT) * 100) : 0;

      var donePct = totalT > 0 ? (doneT / totalT) * 100 : 0;
      var progPct = totalT > 0 ? (progT / totalT) * 100 : 0;
      var openPct = totalT > 0 ? (openT / totalT) * 100 : 0;
      var blockPct = totalT > 0 ? (blockedT / totalT) * 100 : 0;

      var reportView = h('div', { style: 'display:flex;flex-direction:column;gap:16px;' }, [
        /* Timeframe Switcher */
        h('div', { class: 'row', style: 'justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;' }, [
          h('h3', { style: 'margin:0;font-size:15px;' }, '📈 Task Completion Velocity & Workload Distribution'),
          h('div', { class: 'segmented', role: 'group', 'aria-label': 'Select timeframe' }, [
            ['day', '📅 Today (Day)'],
            ['month', '🗓️ This Month'],
            ['year', '📊 This Year'],
            ['all', '🌐 All Time']
          ].map(function (opt) {
            return h('button', {
              type: 'button',
              'aria-pressed': String(activeTimeframe === opt[0]),
              onClick: function () {
                activeTimeframe = opt[0];
                renderClientPortal(host, client, onBack);
              }
            }, opt[1]);
          }))
        ]),

        /* KPI Stat Cards */
        h('div', { class: 'stats-grid', style: 'display:grid;grid-template-columns:repeat(auto-fit, minmax(170px, 1fr));gap:12px;' }, [
          h('div', { class: 'card stat-card' }, [
            h('span', { class: 'k muted', style: 'font-size:12px;' }, 'Total Tasks (' + activeTimeframe + ')'),
            h('div', { class: 'v tabular', style: 'font-size:22px;font-weight:700;' }, String(totalT))
          ]),
          h('div', { class: 'card stat-card' }, [
            h('span', { class: 'k muted', style: 'font-size:12px;' }, 'Completed Rate'),
            h('div', { class: 'v tabular', style: 'font-size:22px;font-weight:700;color:var(--success);' }, rate + '% (' + doneT + ' done)')
          ]),
          h('div', { class: 'card stat-card' }, [
            h('span', { class: 'k muted', style: 'font-size:12px;' }, 'In Progress'),
            h('div', { class: 'v tabular', style: 'font-size:22px;font-weight:700;color:var(--blueprint);' }, String(progT))
          ]),
          h('div', { class: 'card stat-card' }, [
            h('span', { class: 'k muted', style: 'font-size:12px;' }, 'Blocked / Open'),
            h('div', { class: 'v tabular', style: 'font-size:22px;font-weight:700;color:var(--signal);' }, (blockedT + openT) + ' pending')
          ])
        ]),

        /* Visual Task Completion Velocity Graphic */
        h('div', { class: 'card', style: 'padding:18px 20px;' }, [
          h('div', { class: 'row', style: 'justify-content:space-between;align-items:center;' }, [
            h('h4', { style: 'margin:0;font-size:14px;color:var(--ink);' }, 'Task Progress Graphic (' + activeTimeframe.toUpperCase() + ')'),
            h('span', { class: 'chip count' }, totalT + ' Total Tracked')
          ]),
          h('div', { class: 'client-velocity-bar-wrap' }, [
            h('div', { class: 'client-velocity-segment', style: 'width:' + donePct + '%;background:#10b981;', title: 'Done: ' + doneT + ' (' + Math.round(donePct) + '%)' }),
            h('div', { class: 'client-velocity-segment', style: 'width:' + progPct + '%;background:#3b82f6;', title: 'In Progress: ' + progT + ' (' + Math.round(progPct) + '%)' }),
            h('div', { class: 'client-velocity-segment', style: 'width:' + openPct + '%;background:#f59e0b;', title: 'Open: ' + openT + ' (' + Math.round(openPct) + '%)' }),
            h('div', { class: 'client-velocity-segment', style: 'width:' + blockPct + '%;background:#ef4444;', title: 'Blocked: ' + blockedT + ' (' + Math.round(blockPct) + '%)' })
          ]),
          h('div', { class: 'client-graphic-legend' }, [
            h('span', {}, [h('span', { class: 'client-legend-dot', style: 'background:#10b981;' }), 'Completed (' + doneT + ')']),
            h('span', {}, [h('span', { class: 'client-legend-dot', style: 'background:#3b82f6;' }), 'In Progress (' + progT + ')']),
            h('span', {}, [h('span', { class: 'client-legend-dot', style: 'background:#f59e0b;' }), 'Open (' + openT + ')']),
            h('span', {}, [h('span', { class: 'client-legend-dot', style: 'background:#ef4444;' }), 'Blocked (' + blockedT + ')'])
          ])
        ])
      ]);

      bodyContent.appendChild(reportView);
    }

    /* TAB 2: TODOS */
    if (activePortalTab === 'todos') {
      var filteredList = clientTodos.filter(function (t) {
        if (todoFilterState === 'open') return t.state === 'open';
        if (todoFilterState === 'progress') return t.state === 'progress';
        if (todoFilterState === 'done') return t.state === 'done';
        if (todoFilterState === 'blocked') return t.state === 'blocked';
        return true;
      });

      var todosView = h('div', { style: 'display:flex;flex-direction:column;gap:14px;' }, [
        h('div', { class: 'row', style: 'justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;' }, [
          h('div', { class: 'segmented', role: 'group', 'aria-label': 'Filter tasks' }, [
            ['all', 'All (' + clientTodos.length + ')'],
            ['open', 'Open'],
            ['progress', 'In Progress'],
            ['done', 'Done'],
            ['blocked', 'Blocked']
          ].map(function (opt) {
            return h('button', {
              type: 'button',
              'aria-pressed': String(todoFilterState === opt[0]),
              onClick: function () {
                todoFilterState = opt[0];
                renderClientPortal(host, client, onBack);
              }
            }, opt[1]);
          })),
          h('button', {
            class: 'btn primary small', type: 'button',
            onClick: function () {
              if (OC.ui && OC.ui.newTodoModal) {
                OC.ui.newTodoModal(function () { renderClientPortal(host, client, onBack); }, { defaultClient: client.id });
              } else if (OC.dashboard && OC.dashboard.newTodo) {
                OC.dashboard.newTodo(function () { renderClientPortal(host, client, onBack); });
              }
            }
          }, ['+ Add task for ' + client.name])
        ]),

        filteredList.length ? h('div', { class: 'grid-1', style: 'display:flex;flex-direction:column;gap:8px;' }, filteredList.map(function (t) {
          var assignees = (Array.isArray(t.assignees) && t.assignees.length) ? t.assignees : (t.assigned_to ? [t.assigned_to] : []);
          return h('div', { class: 'card', style: 'padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;' }, [
            h('div', { style: 'display:flex;align-items:center;gap:10px;flex:1;' }, [
              h('input', {
                type: 'checkbox',
                checked: t.state === 'done',
                onChange: function () {
                  OC.store.mutate({ actor: user.id, action: 'todo.state', target: t.title }, function () {
                    t.state = (t.state === 'done') ? 'open' : 'done';
                  });
                  renderClientPortal(host, client, onBack);
                }
              }),
              h('div', { style: 'display:flex;flex-direction:column;gap:2px;' }, [
                h('span', { style: 'font-weight:600;font-size:14px;color:var(--ink);' + (t.state === 'done' ? 'text-decoration:line-through;color:var(--text-secondary);' : '') }, t.title),
                h('div', { class: 'row', style: 'gap:6px;align-items:center;' }, [
                  h('span', { class: 'chip ' + (t.state === 'done' ? 'state-done' : 'state-open') }, t.state || 'open'),
                  t.priority ? h('span', { class: 'chip ' + (t.priority === 'urgent' ? 'signal' : 'custom') }, t.priority) : null,
                  t.due ? h('span', { class: 'muted', style: 'font-size:11px;' }, 'Due: ' + OC.ui.fmtDate(t.due)) : null
                ].filter(Boolean))
              ])
            ]),
            h('div', { class: 'row', style: 'gap:6px;align-items:center;' }, assignees.map(function (uId) {
              return OC.ui.person(uId);
            }))
          ]);
        })) : h('div', { class: 'card', style: 'padding:32px;text-align:center;' }, [
          h('p', { class: 'muted', style: 'margin:0;' }, 'No tasks found matching current filter for this client.')
        ])
      ]);

      bodyContent.appendChild(todosView);
    }

    /* TAB 3: INSTRUCTIONS */
    if (activePortalTab === 'instructions') {
      var insView = h('div', { style: 'display:flex;flex-direction:column;gap:14px;' }, [
        h('div', { class: 'row', style: 'justify-content:space-between;align-items:center;' }, [
          h('h3', { style: 'margin:0;font-size:15px;' }, 'Notice Board Instructions for ' + client.name),
          h('button', {
            class: 'btn primary small', type: 'button',
            onClick: function () {
              if (OC.board && OC.board.newInstruction) {
                OC.board.newInstruction(function () { renderClientPortal(host, client, onBack); });
              }
            }
          }, ['+ New instruction'])
        ]),
        clientInstructions.length ? h('div', { class: 'grid-1', style: 'display:flex;flex-direction:column;gap:10px;' }, clientInstructions.map(function (ins) {
          return h('div', { class: 'card', style: 'padding:14px 18px;' }, [
            h('div', { class: 'row', style: 'justify-content:space-between;align-items:center;margin-bottom:6px;' }, [
              h('h4', { style: 'margin:0;font-size:15px;color:var(--ink);' }, ins.title || 'Instruction'),
              h('span', { class: 'muted', style: 'font-size:11px;' }, OC.ui.fmtWhen(ins.created_at || ins.posted_at))
            ]),
            h('p', { style: 'font-size:13.5px;color:var(--text);margin:6px 0;' }, ins.body),
            h('div', { class: 'row', style: 'gap:6px;align-items:center;margin-top:8px;' }, [
              OC.ui.person(ins.author, 'strong'),
              ins.target_type ? h('span', { class: 'chip custom' }, 'Target: ' + ins.target_type) : null
            ].filter(Boolean))
          ]);
        })) : h('div', { class: 'card', style: 'padding:32px;text-align:center;' }, [
          h('p', { class: 'muted', style: 'margin:0;' }, 'No specific instructions logged for this client yet.')
        ])
      ]);

      bodyContent.appendChild(insView);
    }

    /* TAB 4: DETAILS & RICH WORKSPACE TEXT EDITOR */
    if (activePortalTab === 'details') {
      var editorText = h('textarea', {
        class: 'client-rich-textarea',
        placeholder: 'Write comprehensive client notes, scope of work, contracts, deliverables, or checklist specs...\n\nSupports full Markdown: # Headings, **Bold**, - Bullet points, - [ ] Checklists, and quotes!',
        'aria-label': 'Client Rich Notes'
      }, client.details || client.notes || '');

      var previewWrap = h('div', { class: 'client-rich-preview', style: 'display:none;' });
      var isPreviewMode = false;

      function updatePreview() {
        previewWrap.innerHTML = renderMarkdownPreview(editorText.value);
      }

      function insertFormatting(prefix, suffix, defaultText) {
        var start = editorText.selectionStart || 0;
        var end = editorText.selectionEnd || 0;
        var val = editorText.value;
        var selected = val.slice(start, end) || defaultText || '';
        var replacement = prefix + selected + (suffix || '');
        editorText.value = val.slice(0, start) + replacement + val.slice(end);
        editorText.focus();
        editorText.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
        updatePreview();
      }

      var toolbar = h('div', { class: 'client-editor-toolbar' }, [
        h('button', { class: 'client-editor-tool-btn', type: 'button', title: 'Bold', onClick: function () { insertFormatting('**', '**', 'bold text'); } }, 'B'),
        h('button', { class: 'client-editor-tool-btn', type: 'button', title: 'Italic', onClick: function () { insertFormatting('*', '*', 'italic text'); } }, 'I'),
        h('button', { class: 'client-editor-tool-btn', type: 'button', title: 'Heading 2', onClick: function () { insertFormatting('## ', '', 'Heading 2'); } }, 'H2'),
        h('button', { class: 'client-editor-tool-btn', type: 'button', title: 'Heading 3', onClick: function () { insertFormatting('### ', '', 'Heading 3'); } }, 'H3'),
        h('button', { class: 'client-editor-tool-btn', type: 'button', title: 'Bullet list', onClick: function () { insertFormatting('- ', '', 'List item'); } }, '• List'),
        h('button', { class: 'client-editor-tool-btn', type: 'button', title: 'Checklist item', onClick: function () { insertFormatting('- [ ] ', '', 'Task to complete'); } }, '☑ Check'),
        h('button', { class: 'client-editor-tool-btn', type: 'button', title: 'Quote block', onClick: function () { insertFormatting('> ', '', 'Important client note'); } }, '❝ Quote'),
        h('button', {
          class: 'client-editor-tool-btn push',
          type: 'button',
          style: 'background:var(--tint);color:var(--blueprint);',
          onClick: function () {
            isPreviewMode = !isPreviewMode;
            if (isPreviewMode) {
              updatePreview();
              editorText.style.display = 'none';
              previewWrap.style.display = 'block';
              this.textContent = '✏️ Edit Mode';
            } else {
              editorText.style.display = 'block';
              previewWrap.style.display = 'none';
              this.textContent = '👁️ Preview Formatted';
            }
          }
        }, '👁️ Preview Formatted'),
        h('button', {
          class: 'btn primary small',
          type: 'button',
          onClick: function () {
            var val = editorText.value.trim();
            OC.store.mutate({
              actor: user.id, action: 'client.details.update', target: client.name,
              detail: 'Updated documentation notes for ' + client.name
            }, function () {
              client.details = val;
              client.notes = val;
            });
            OC.ui.toast('Client details & notes saved successfully! 💾');
          }
        }, '💾 Save Details')
      ]);

      editorText.addEventListener('input', updatePreview);

      var detailsWrap = h('div', { class: 'client-rich-editor-wrap' }, [
        h('div', { class: 'row', style: 'justify-content:space-between;align-items:center;' }, [
          h('h3', { style: 'margin:0;font-size:15px;color:var(--ink);' }, '📝 Client Documentation, Scope & Workspace Notes'),
          h('span', { class: 'muted', style: 'font-size:12px;' }, 'Full Markdown & unlimited text formatting')
        ]),
        toolbar,
        editorText,
        previewWrap
      ]);

      bodyContent.appendChild(detailsWrap);
    }

    portalContainer.appendChild(header);
    portalContainer.appendChild(tabNav);
    portalContainer.appendChild(bodyContent);

    OC.ui.clear(host);
    host.appendChild(portalContainer);
  }

  function render(host) {
    var h = OC.ui.h;
    var user = me();
    var clients = OC.store.state.clients || [];
    var canCreate = !!(OC.can && OC.can.createClient ? OC.can.createClient(user) : (user && user.admin));

    var activeClient = activePortalClientId ? OC.store.client(activePortalClientId) : null;
    if (activeClient) {
      renderClientPortal(host, activeClient, function () {
        activePortalClientId = null;
        render(host);
      });
      return;
    } else {
      activePortalClientId = null;
    }

    var totalClients = clients.length;
    var activeClients = clients.filter(function (c) { return c.status === 'active'; }).length;
    var pausedClients = clients.filter(function (c) { return c.status === 'paused'; }).length;

    var filtered = clients.filter(function (c) {
      if (filterStatus !== 'all' && c.status !== filterStatus) return false;
      if (!searchQuery) return true;
      var q = searchQuery.toLowerCase();
      var full = [c.name, c.client_id, c.client_code, c.client_number, c.contact].filter(Boolean).join(' ').toLowerCase();
      return full.indexOf(q) > -1;
    });

    OC.ui.clear(host);
    OC.ui.append(host, [
      h('div', { class: 'page-head' }, [
        h('h1', {}, 'Clients Portal'),
        h('p', {}, 'Manage official client accounts, Client IDs, ticker codes, contact numbers, and assigned task workloads across all departments.')
      ]),

      /* Top summary stats */
      h('div', { class: 'stats-grid', style: 'display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:20px;' }, [
        h('div', { class: 'card stat-card' }, [
          h('span', { class: 'k muted', style: 'font-size:12px;' }, 'Total Clients'),
          h('div', { class: 'v tabular', style: 'font-size:22px;font-weight:700;' }, String(totalClients))
        ]),
        h('div', { class: 'card stat-card' }, [
          h('span', { class: 'k muted', style: 'font-size:12px;' }, 'Active Clients'),
          h('div', { class: 'v tabular', style: 'font-size:22px;font-weight:700;color:var(--accent);' }, String(activeClients))
        ]),
        h('div', { class: 'card stat-card' }, [
          h('span', { class: 'k muted', style: 'font-size:12px;' }, 'Paused Clients'),
          h('div', { class: 'v tabular', style: 'font-size:22px;font-weight:700;' }, String(pausedClients))
        ]),
        h('div', { class: 'card stat-card' }, [
          h('span', { class: 'k muted', style: 'font-size:12px;' }, 'Active Client Tasks'),
          h('div', { class: 'v tabular', style: 'font-size:22px;font-weight:700;' }, String(
            OC.store.state.todos.filter(function (t) {
              return !t.archived && t.state !== 'done' && (t.client || (Array.isArray(t.clients) && t.clients.length));
            }).length
          ))
        ])
      ]),

      /* Action row & Search filters */
      h('div', { class: 'row', style: 'margin-bottom:16px;gap:10px;flex-wrap:wrap;align-items:center;' }, [
        canCreate
          ? h('button', {
              class: 'btn primary', type: 'button',
              onClick: function () {
                OC.ui.newClientModal(function () { render(host); });
              }
            }, [OC.icon('plus'), 'New client'])
          : null,
        h('div', { style: 'flex:1;min-width:220px;' }, [
          h('input', {
            type: 'search',
            placeholder: 'Search by client name, ID, code, number...',
            value: searchQuery,
            style: 'width:100%;',
            onInput: function (e) {
              searchQuery = e.target.value;
              render(host);
            }
          })
        ]),
        h('div', { class: 'segmented', role: 'group', 'aria-label': 'Filter by status' }, [
          ['all', 'All (' + totalClients + ')'],
          ['active', 'Active (' + activeClients + ')'],
          ['paused', 'Paused (' + pausedClients + ')']
        ].map(function (opt) {
          return h('button', {
            type: 'button',
            'aria-pressed': String(filterStatus === opt[0]),
            onClick: function () {
              filterStatus = opt[0];
              render(host);
            }
          }, opt[1]);
        }))
      ]),

      /* Clients Grid (Fully Clickable Cards) */
      filtered.length
        ? h('div', { class: 'grid-2', style: 'margin:12px 0 24px;' }, filtered.map(function (c) {
            var clientTodos = OC.store.state.todos.filter(function (t) {
              return t.client === c.id || (Array.isArray(t.clients) && t.clients.indexOf(c.id) > -1);
            });
            var activeTaskCount = clientTodos.filter(function (t) { return !t.archived && t.state !== 'done'; }).length;
            var displayTitle = OC.ui.clientLabel ? OC.ui.clientLabel(c) : c.name;

            return h('div', {
              class: 'card client-item-card',
              title: 'Click to open ' + c.name + ' workspace portal & reports',
              onClick: function () {
                activePortalClientId = c.id;
                render(host);
              }
            }, [
              h('div', { class: 'row', style: 'align-items:center;' }, [
                h('h3', { style: 'margin:0;font-size:16px;color:var(--ink);' }, displayTitle),
                h('span', { class: 'chip ' + (c.status === 'active' ? 'dept' : 'custom') + ' push' }, c.status)
              ]),
              h('div', { class: 'row', style: 'margin:8px 0 6px;gap:6px;flex-wrap:wrap;' }, [
                c.client_id ? h('span', { class: 'chip custom', style: 'font-size:11px;' }, 'ID: ' + c.client_id) : null,
                c.client_code ? h('span', { class: 'chip custom', style: 'font-size:11px;' }, 'Code: ' + c.client_code) : null,
                (c.client_number || c.contact) ? h('span', { class: 'chip custom', style: 'font-size:11px;' }, '📞 ' + (c.client_number || c.contact)) : null,
                h('span', { class: 'chip count' }, activeTaskCount + ' open tasks')
              ].filter(Boolean)),
              h('p', { class: 'muted', style: 'font-size:13px;margin:6px 0 4px;' }, 'Client number: ' + (c.client_number || c.contact || 'N/A')),
              h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:6px;' }, [
                h('span', { style: 'font-size:12px;color:var(--blueprint);font-weight:600;' }, 'Open Client Portal & Analytics →')
              ])
            ]);
          }))
        : h('div', { class: 'card', style: 'margin:12px 0 24px;text-align:center;padding:32px;' }, [
            h('p', { class: 'muted', style: 'margin-bottom:14px;font-size:14px;' },
              searchQuery || filterStatus !== 'all'
                ? 'No clients found matching current search/filter.'
                : 'No clients registered yet. Create your first client to start organizing work.'
            ),
            canCreate
              ? h('button', {
                  class: 'btn primary', type: 'button',
                  onClick: function () {
                    OC.ui.newClientModal(function () { render(host); });
                  }
                }, [OC.icon('plus'), 'Add new client'])
              : null
          ])
    ]);
  }

  function openClientPortal(clientId) {
    activePortalClientId = clientId;
    var host = document.getElementById('page');
    if (host) render(host);
  }

  return {
    render: render,
    editClient: editClient,
    openClientPortal: openClientPortal
  };
})();
