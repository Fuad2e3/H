/* =========================================================================
   clients.js — client directory & workload management (5.2)
   Dedicated client directory view: manage official client accounts, Client IDs,
   client ticker codes, workloads, status, and direct task links.
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.clients = (function () {
  'use strict';

  var searchQuery = '';
  var filterStatus = 'all'; /* all | active | paused */

  function me() { return OC.store.user(OC.store.session()); }

  function editClient(client, onDone) {
    var h = OC.ui.h;
    var user = me();
    var clientId = h('input', { type: 'text', value: client.client_id || '' });
    var clientCode = h('input', { type: 'text', value: client.client_code || '' });
    var name = h('input', { type: 'text', value: client.name || '' });
    var contact = h('input', { type: 'text', value: client.contact || client.name });
    var status = OC.ui.select([
      { value: 'active', label: 'Active' },
      { value: 'paused', label: 'Paused' }
    ], client.status || 'active');

    var currentLabel = OC.ui.clientLabel ? OC.ui.clientLabel(client) : client.name;

    OC.ui.modal({
      title: 'Edit client: ' + currentLabel,
      content: h('div', {}, [
        OC.ui.field('Client ID', clientId, { hint: 'Unique client identifier or account number (optional).' }),
        OC.ui.field('Client code', clientCode, { hint: 'Short ticker or abbreviation code (optional).' }),
        OC.ui.field('Client / Company name', name, { required: true }),
        OC.ui.field('Primary contact', contact, { hint: 'Contact person name.' }),
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
              client.client_id = clientId.value.trim();
              client.client_code = clientCode.value.trim();
              client.name = name.value.trim();
              client.contact = contact.value.trim() || client.name;
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

  function render(host) {
    var h = OC.ui.h;
    var user = me();
    var clients = OC.store.state.clients || [];
    var canCreate = !!(OC.can && OC.can.createClient ? OC.can.createClient(user) : (user && user.admin));

    var totalClients = clients.length;
    var activeClients = clients.filter(function (c) { return c.status === 'active'; }).length;
    var pausedClients = clients.filter(function (c) { return c.status === 'paused'; }).length;

    var filtered = clients.filter(function (c) {
      if (filterStatus !== 'all' && c.status !== filterStatus) return false;
      if (!searchQuery) return true;
      var q = searchQuery.toLowerCase();
      var full = [c.client_id, c.client_code, c.name, c.contact].filter(Boolean).join(' ').toLowerCase();
      return full.indexOf(q) > -1;
    });

    OC.ui.clear(host);
    OC.ui.append(host, [
      h('div', { class: 'page-head' }, [
        h('h1', {}, 'Clients'),
        h('p', {}, 'Manage official client accounts, Client IDs, ticker codes, primary contacts, and assigned task workloads across all departments.')
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
            OC.store.state.todos.filter(function (t) { return !t.archived && t.state !== 'done'; }).length
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
            placeholder: 'Search by client ID, code, name, contact...',
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

      /* Clients Grid */
      filtered.length
        ? h('div', { class: 'grid-2', style: 'margin:12px 0 24px;' }, filtered.map(function (c) {
            var clientTodos = OC.store.state.todos.filter(function (t) {
              return t.client === c.id || (Array.isArray(t.clients) && t.clients.indexOf(c.id) > -1);
            });
            var activeTaskCount = clientTodos.filter(function (t) { return !t.archived && t.state !== 'done'; }).length;
            var displayTitle = OC.ui.clientLabel ? OC.ui.clientLabel(c) : c.name;

            return h('div', { class: 'card' }, [
              h('div', { class: 'row', style: 'align-items:center;' }, [
                h('h3', { style: 'margin:0;font-size:16px;' }, displayTitle),
                h('span', { class: 'chip ' + (c.status === 'active' ? 'dept' : 'custom') + ' push' }, c.status)
              ]),
              h('div', { class: 'row', style: 'margin:8px 0 6px;gap:6px;flex-wrap:wrap;' }, [
                c.client_id ? h('span', { class: 'chip custom', style: 'font-size:11px;' }, 'ID: ' + c.client_id) : null,
                c.client_code ? h('span', { class: 'chip custom', style: 'font-size:11px;' }, 'Code: ' + c.client_code) : null,
                h('span', { class: 'chip count' }, activeTaskCount + ' open tasks')
              ].filter(Boolean)),
              h('p', { class: 'muted', style: 'font-size:13px;margin:6px 0 12px;' }, 'Primary contact: ' + (c.contact || c.name)),
              h('div', { class: 'row', style: 'gap:8px;' }, [
                canCreate
                  ? h('button', {
                      class: 'btn small', type: 'button',
                      onClick: function () { editClient(c, function () { render(host); }); }
                    }, 'Edit client')
                  : null,
                h('button', {
                  class: 'btn small', type: 'button',
                  onClick: function () {
                    if (OC.board && OC.board.applyFilter) {
                      OC.board.applyFilter({ client: c.id, department: '', person: '', tag: '', from: '', to: '', q: '' });
                    }
                    if (OC.app && OC.app.go) {
                      OC.app.go('board');
                    } else {
                      location.hash = '#board';
                    }
                  }
                }, 'View tasks')
              ].filter(Boolean))
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

  return {
    render: render,
    editClient: editClient
  };
})();
