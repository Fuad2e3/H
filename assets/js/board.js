/* =========================================================================
   board.js — the two-panel board (2.0)
   Left panel: todos (6.2). Right panel: instructions (6.3). Both are driven
   by one filter object (6.4), so a client or a department means the same
   thing on both sides. Every list is filtered through OC.can first, so a
   person is never shown an item they are not entitled to see.
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.board = (function () {
  'use strict';

  var h, filters = { client: '', department: '', person: '', tag: '', from: '', to: '', q: '' };
  var grouping = 'person';       /* person | client | department */
  var mode = 'panels';           /* panels | timeline */
  var showDone = false;
  var showArchived = false;
  var panel = 'todos';           /* small screens only */

  function me() { return OC.store.user(OC.store.session()); }

  function clientLabel() {
    var c = filters.client ? OC.store.client(filters.client) : null;
    return c ? c.name : 'Combined';
  }

  /* ---- filtering -------------------------------------------------------- */
  function matches(item, isTodo) {
    if (filters.client && item.client !== filters.client) return false;
    if (filters.department && item.department !== filters.department) return false;
    if (filters.tag && (item.tags || []).indexOf(filters.tag) === -1) return false;

    if (filters.person) {
      if (isTodo) {
        var hit = item.assignee_type === 'user' && item.assignee === filters.person;
        if (!hit && item.assignee_type === 'group') {
          var g = OC.store.group(item.assignee);
          hit = !!g && g.members.indexOf(filters.person) > -1;
        }
        if (!hit) return false;
      } else if (item.author !== filters.person) {
        return false;
      }
    }

    var when = (isTodo ? item.created_at : item.posted_at).slice(0, 10);
    if (filters.from && when < filters.from) return false;
    if (filters.to && when > filters.to) return false;

    if (filters.q) {
      var q = filters.q.toLowerCase();
      var hay = isTodo ? (item.title + ' ' + item.description) : item.body;
      if (hay.toLowerCase().indexOf(q) === -1) return false;
    }
    return true;
  }

  function visibleTodos() {
    var user = me();
    return OC.store.state.todos.filter(function (t) {
      if (!OC.can.seeTodo(user, t)) return false;
      if (t.archived && !showArchived) return false;
      if (t.state === 'done' && !showDone) return false;
      return matches(t, true);
    });
  }

  function visibleInstructions() {
    var user = me();
    return OC.store.state.instructions
      .filter(function (n) {
        if (!OC.can.seeInstruction(user, n)) return false;
        if (n.archived && !showArchived) return false;
        return matches(n, false);
      })
      .sort(function (a, b) { return b.posted_at.localeCompare(a.posted_at); });
  }

  /* ---- filter bar ------------------------------------------------------- */
  function optionsFor(list, blank) {
    return [{ value: '', label: blank }].concat(list.map(function (x) {
      return { value: x.id, label: x.name || x.label };
    }));
  }

  function filterBar(rerender) {
    var user = me();
    var people = OC.can.visibleUsers(user);
    var depts = user.admin ? OC.store.state.departments
      : OC.store.state.departments.filter(function (d) { return OC.can.inDept(user, d.id); });

    function set(key) {
      return function (e) { filters[key] = e.target.value; rerender(); };
    }

    var bar = h('div', { class: 'filters' }, [
      OC.ui.field('Search', h('input', { type: 'search', value: filters.q, placeholder: 'text in todos and instructions', onInput: set('q') })),
      OC.ui.field('Client', OC.ui.select(optionsFor(OC.store.state.clients, 'All clients'), filters.client, { onChange: set('client') })),
      OC.ui.field('Department', OC.ui.select(optionsFor(depts, 'All departments'), filters.department, { onChange: set('department') })),
      OC.ui.field('Person', OC.ui.select(optionsFor(people, 'Anyone'), filters.person, { onChange: set('person') })),
      OC.ui.field('Tag', OC.ui.select(optionsFor(OC.store.state.tags, 'Any tag'), filters.tag, { onChange: set('tag') })),
      OC.ui.field('From', h('input', { type: 'date', value: filters.from, onChange: set('from') })),
      OC.ui.field('To', h('input', { type: 'date', value: filters.to, onChange: set('to') })),
      h('div', { class: 'actions' }, [
        h('button', {
          class: 'btn small', type: 'button', onClick: function () {
            Object.keys(filters).forEach(function (k) { filters[k] = ''; });
            rerender();
          }
        }, 'Clear'),
        h('button', { class: 'btn small', type: 'button', onClick: saveFilter }, 'Pin filter')
      ])
    ]);
    return bar;
  }

  function saveFilter() {
    var active = Object.keys(filters).filter(function (k) { return filters[k]; });
    if (!active.length) { OC.ui.toast('Set a filter before pinning it.', true); return; }
    var input = h('input', { type: 'text', placeholder: 'for example: everything tagged Chaim' });
    OC.ui.modal({
      title: 'Pin this filter',
      content: OC.ui.field('Name', input, { required: true, hint: 'Pinned filters sit above the board for this account (6.4).' }),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Pin', primary: true, onClick: function (close) {
            if (!input.value.trim()) return 'Give the filter a name.';
            var snapshot = JSON.parse(JSON.stringify(filters));
            OC.store.mutate(null, function () {
              OC.store.state.saved_filters.push({
                id: OC.store.uid('sf'), name: input.value.trim(),
                owner: OC.store.session(), filters: snapshot
              });
            });
            OC.ui.toast('Filter pinned.');
            close();
          }
        }
      ]
    });
  }

  function savedBar(rerender) {
    var mine = OC.store.state.saved_filters.filter(function (f) { return f.owner === OC.store.session(); });
    if (!mine.length) return null;
    return h('div', { class: 'savedbar' }, [
      h('span', { class: 'eyebrow' }, 'Pinned'),
      mine.map(function (f) {
        return h('span', { class: 'chip client', onClick: function () { filters = JSON.parse(JSON.stringify(f.filters)); rerender(); } }, [
          f.name,
          h('button', {
            type: 'button',
            'aria-label': 'Remove pinned filter ' + f.name,
            onClick: function (e) {
              e.stopPropagation();
              OC.store.mutate(null, function () {
                OC.store.state.saved_filters = OC.store.state.saved_filters.filter(function (x) { return x.id !== f.id; });
              });
            }
          }, '×')
        ]);
      })
    ]);
  }

  /* ---- todo item -------------------------------------------------------- */
  function stateSelect(todo) {
    var user = me();
    if (!OC.can.changeState(user, todo)) {
      return OC.ui.stateChip(todo.state);
    }
    return OC.ui.select(
      Object.keys(OC.ui.STATE_LABEL).map(function (k) { return { value: k, label: OC.ui.STATE_LABEL[k] }; }),
      todo.state,
      {
        'aria-label': 'State for ' + todo.title,
        onChange: function (e) { changeState(todo, e.target.value, e.target); }
      }
    );
  }

  function nextDue(dueDate, recurrence) {
    var d = new Date(dueDate + 'T12:00:00');
    if (recurrence === 'daily') d.setDate(d.getDate() + 1);
    else if (recurrence === 'weekly') d.setDate(d.getDate() + 7);
    else if (recurrence === 'monthly') d.setMonth(d.getMonth() + 1);
    else if (recurrence === 'quarterly') d.setMonth(d.getMonth() + 3);
    return d.toISOString().slice(0, 10);
  }

  function changeState(todo, next, control) {
    var user = me();
    if (next === 'blocked') {
      var reason = h('input', { type: 'text', placeholder: 'what is blocking it' });
      OC.ui.modal({
        title: 'Blocked: one line reason',
        content: OC.ui.field('Reason', reason, { required: true, hint: 'Visible to whoever assigned the task (6.2).' }),
        actions: [
          { label: 'Cancel', onClick: function (close) { if (control) control.value = todo.state; close(); } },
          {
            label: 'Mark blocked', primary: true, onClick: function (close) {
              if (!reason.value.trim()) return 'A blocked todo needs a reason.';
              OC.store.mutate({ actor: user.id, action: 'todo.blocked', target: todo.title, detail: reason.value.trim() }, function () {
                todo.state = 'blocked';
                todo.blocked_reason = reason.value.trim();
              });
              OC.store.notify([todo.created_by], todo.title + ' was marked blocked by ' + user.name, todo.id);
              close();
            }
          }
        ]
      });
      return;
    }

    OC.store.mutate({ actor: user.id, action: 'todo.state', target: todo.title, detail: todo.state + ' → ' + next }, function () {
      todo.state = next;
      if (next !== 'blocked') todo.blocked_reason = null;

      /* a recurring todo regenerates as a fresh instance on completion (6.2) */
      if (next === 'done' && todo.recurrence && todo.recurrence !== 'none' && !todo.spawned) {
        todo.spawned = true;
        var copy = JSON.parse(JSON.stringify(todo));
        copy.id = OC.store.uid('t');
        copy.state = 'open';
        copy.spawned = false;
        copy.blocked_reason = null;
        copy.due = nextDue(todo.due, todo.recurrence);
        copy.created_at = new Date().toISOString();
        copy.comments = [];
        OC.store.state.todos.push(copy);
      }
    });

    if (next === 'done') OC.ui.toast('Marked done' + (todo.recurrence !== 'none' ? ', next instance created.' : '.'));
  }

  function escalationNote(todo) {
    var late = OC.ui.daysLate(todo.due);
    if (todo.state === 'done' || late < 1) return null;
    var reached = OC.can.escalationReached(todo, late);
    var chain = OC.can.escalationChain(todo);
    var steps = chain.slice(1, reached + 1).map(function (s) {
      return s.step.split(',')[0] + ' (' + s.users.map(OC.ui.personName).join(', ') + ')';
    });
    if (!steps.length) return null;
    return h('div', { class: 'escalation' }, [
      OC.icon('users'),
      h('span', {}, 'Escalated to ' + steps.join(' → ') + ' — ' + OC.ui.dueLabel(todo.due) + '.')
    ]);
  }

  function todoItem(todo) {
    var user = me();
    var late = OC.ui.daysLate(todo.due);
    var overdue = todo.state !== 'done' && late > 0;
    var cls = 'item is-' + todo.state + (overdue ? ' is-overdue' : '');

    var actions = [stateSelect(todo)];
    if (OC.can.reassign(user, todo)) {
      actions.push(h('button', { class: 'btn small', type: 'button', onClick: function () { reassignTodo(todo); } }, 'Reassign'));
    }
    if (OC.can.reassign(user, todo) && !todo.archived) {
      actions.push(h('button', { class: 'btn small', type: 'button', onClick: function () { archiveTodo(todo); } }, 'Archive'));
    }

    return h('article', { class: cls }, [
      h('div', { class: 'title' }, todo.title),
      todo.description ? h('div', { class: 'desc' }, todo.description) : null,
      h('div', { class: 'meta' }, [
        OC.ui.clientChip(todo.client),
        OC.ui.deptChip(todo.department),
        todo.assignee_type === 'group'
          ? h('span', { class: 'chip group' }, OC.ui.assigneeName(todo))
          : h('span', {}, OC.ui.assigneeName(todo)),
        h('span', { class: overdue ? 'chip overdue' : '' }, OC.ui.dueLabel(todo.due)),
        todo.recurrence !== 'none' ? h('span', { class: 'chip recurring' }, todo.recurrence) : null,
        todo.archived ? h('span', { class: 'chip custom' }, 'archived') : null,
        (todo.tags || []).map(OC.ui.tagChip)
      ]),
      todo.blocked_reason
        ? h('div', { class: 'blocked-note' }, [OC.icon('alert'), h('span', {}, 'Blocked: ' + todo.blocked_reason)])
        : null,
      escalationNote(todo),
      h('div', { class: 'actions' }, actions),
      OC.can.commentOnTodo(user, todo) ? OC.ui.commentThread('todo', todo) : null
    ]);
  }

  function archiveTodo(todo) {
    OC.ui.confirm('Archive "' + todo.title + '"? Nothing is deleted — it stays in the record (7.0).', function () {
      OC.store.mutate({ actor: OC.store.session(), action: 'todo.archive', target: todo.title }, function () {
        todo.archived = true;
      });
      OC.ui.toast('Archived.');
    });
  }

  function reassignTodo(todo) {
    var user = me();
    var people = OC.can.assignableUsers(user).map(function (u) { return { value: 'user:' + u.id, label: u.name }; });
    var groups = OC.can.assignableGroups(user).map(function (g) { return { value: 'group:' + g.id, label: g.name + ' (group)' }; });
    var control = OC.ui.select(people.concat(groups), todo.assignee_type + ':' + todo.assignee);
    OC.ui.modal({
      title: 'Reassign',
      content: OC.ui.field('Assign to', control, { required: true, hint: 'Only people you may assign to appear here (3.2).' }),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Reassign', primary: true, onClick: function (close) {
            var parts = control.value.split(':');
            var before = OC.ui.assigneeName(todo);
            OC.store.mutate({ actor: user.id, action: 'todo.reassign', target: todo.title, detail: before + ' → ' + control.selectedOptions[0].textContent }, function () {
              todo.assignee_type = parts[0];
              todo.assignee = parts[1];
            });
            var targets = parts[0] === 'user' ? [parts[1]] : (OC.store.group(parts[1]) || { members: [] }).members;
            OC.store.notify(targets, user.name + ' assigned you: ' + todo.title, todo.id);
            OC.ui.toast('Reassigned.');
            close();
          }
        }
      ]
    });
  }

  /* ---- create a todo ---------------------------------------------------- */
  function newTodo(preset, onCreated) {
    var user = me();
    preset = preset || {};
    var title = h('input', { type: 'text', value: preset.title || '' });
    var desc = h('textarea', {}, preset.description || '');
    var client = OC.ui.select(optionsFor(OC.store.state.clients, 'Select a client'), preset.client || '');
    var depts = user.admin ? OC.store.state.departments
      : OC.store.state.departments.filter(function (d) { return OC.can.inDept(user, d.id); });
    var department = OC.ui.select(optionsFor(depts, 'Select a department'), preset.department || '');

    var people = OC.can.assignableUsers(user).map(function (u) { return { value: 'user:' + u.id, label: u.name }; });
    var groups = OC.can.assignableGroups(user).map(function (g) { return { value: 'group:' + g.id, label: g.name + ' (group)' }; });
    var assignee = OC.ui.select(people.concat(groups), 'user:' + user.id);
    var due = h('input', { type: 'date', value: preset.due || OC.ui.today() });
    var priority = OC.ui.select([
      { value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }
    ], 'normal');
    var tags = OC.ui.tagPicker(preset.tags || []);
    var recurrence = OC.ui.select([
      { value: 'none', label: 'One time' }, { value: 'daily', label: 'Daily' },
      { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' },
      { value: 'quarterly', label: 'Quarterly' }
    ], 'none');

    var assignHint = people.length === 1 && people[0].value === 'user:' + user.id
      ? 'Your role can assign work to yourself only (3.2).'
      : 'Admin, department heads and team leads only (3.2).';

    OC.ui.modal({
      title: 'New todo',
      content: h('div', {}, [
        OC.ui.field('Title', title, { required: true }),
        OC.ui.field('Description', desc),
        OC.ui.field('Client', client, { required: true, hint: 'Every todo needs a client and a department before it can be posted (5.2).' }),
        OC.ui.field('Department', department, { required: true }),
        OC.ui.field('Assign to', assignee, { required: true, hint: assignHint }),
        OC.ui.field('Due date', due, { required: true }),
        OC.ui.field('Priority', priority),
        OC.ui.field('Tags', tags.node, { hint: 'Type and category tags are optional. Typing narrows the list; a new tag is available to everyone at once (6.4).' }),
        OC.ui.field('Recurrence', recurrence, { hint: 'A recurring todo regenerates on completion (6.2).' })
      ]),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Create todo', primary: true, onClick: function (close) {
            if (!title.value.trim()) return 'A todo needs a title.';
            if (!client.value) return 'Select a client. This is required by 5.2.';
            if (!department.value) return 'Select a department. This is required by 5.2.';
            var parts = assignee.value.split(':');
            if (parts[0] === 'user' && !OC.can.assignTo(user, parts[1])) return 'You cannot assign work to that person (3.2).';

            var todo = {
              id: OC.store.uid('t'),
              title: title.value.trim(), description: desc.value.trim(),
              client: client.value, department: department.value,
              assignee_type: parts[0], assignee: parts[1],
              state: 'open', priority: priority.value, due: due.value,
              recurrence: recurrence.value, created_by: user.id,
              created_at: new Date().toISOString(), tags: tags.resolve(), comments: []
            };
            if (priority.value === 'high' && todo.tags.indexOf('t-urgent') === -1) todo.tags.push('t-urgent');

            OC.store.mutate({ actor: user.id, action: 'todo.create', target: todo.title, detail: 'assigned to ' + OC.ui.assigneeName(todo) }, function () {
              OC.store.state.todos.push(todo);
            });
            var targets = parts[0] === 'user' ? [parts[1]] : (OC.store.group(parts[1]) || { members: [] }).members;
            OC.store.notify(targets.filter(function (id) { return id !== user.id; }), user.name + ' assigned you: ' + todo.title, todo.id);
            if (onCreated) onCreated(todo);
            OC.ui.toast('Todo created.');
            close();
          }
        }
      ]
    });
  }

  function copyYesterday() {
    var user = me();
    var yesterday = (function () { var d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
    var carry = OC.store.state.todos.filter(function (t) {
      return t.due === yesterday && t.state !== 'done' && !t.archived && OC.can.seeTodo(user, t) && OC.can.changeState(user, t);
    });
    if (!carry.length) { OC.ui.toast('Nothing unfinished from yesterday to carry over.', true); return; }
    OC.ui.confirm('Carry ' + carry.length + ' unfinished todo(s) from yesterday into today?', function () {
      OC.store.mutate({ actor: user.id, action: 'todo.carry', target: carry.length + ' todos', detail: 'copied from ' + yesterday }, function () {
        carry.forEach(function (t) { t.due = OC.ui.today(); });
      });
      OC.ui.toast(carry.length + ' todo(s) moved to today.');
    });
  }

  /* ---- grouping --------------------------------------------------------- */
  function groupTodos(todos) {
    var buckets = {};
    todos.forEach(function (t) {
      var key;
      if (grouping === 'client') key = (OC.store.client(t.client) || {}).name || 'No client';
      else if (grouping === 'department') key = (OC.store.department(t.department) || {}).name || 'No department';
      else key = OC.ui.assigneeName(t);
      (buckets[key] = buckets[key] || []).push(t);
    });
    return Object.keys(buckets).sort().map(function (k) { return { key: k, items: buckets[k] }; });
  }

  /* ---- instruction item -------------------------------------------------- */
  function instructionItem(note, rerender) {
    var user = me();
    var unread = note.read_by.indexOf(user.id) === -1;
    var readers = note.read_by.map(OC.ui.personName);

    var actions = [];
    if (unread) {
      actions.push(h('button', {
        class: 'btn small', type: 'button', onClick: function () {
          OC.store.mutate(null, function () { note.read_by.push(user.id); });
        }
      }, 'Mark as read'));
    }
    if (!note.linked_todo) {
      actions.push(h('button', {
        class: 'btn small', type: 'button', onClick: function () { convertToTodo(note); }
      }, 'Convert to todo'));
    }
    if (OC.can.archiveInstruction(user, note) && !note.archived) {
      actions.push(h('button', {
        class: 'btn small', type: 'button', onClick: function () {
          OC.ui.confirm('Archive this instruction? Instructions are never deleted (6.3).', function () {
            OC.store.mutate({ actor: user.id, action: 'instruction.archive', target: note.body.slice(0, 48) }, function () {
              note.archived = true;
            });
          });
        }
      }, 'Archive'));
    }

    return h('article', { class: 'note' + (unread && !note.archived ? ' unread' : '') + (note.archived ? ' archived' : '') }, [
      h('div', { class: 'byline' }, [
        h('strong', {}, OC.ui.personName(note.author)),
        h('span', {}, OC.ui.fmtWhen(note.posted_at)),
        note.archived ? h('span', { class: 'chip custom' }, 'archived') : null,
        note.linked_todo ? h('span', { class: 'chip group' }, 'todo created') : null
      ]),
      h('div', { class: 'body' }, note.body),
      h('div', { class: 'tags' }, [
        OC.ui.clientChip(note.client),
        OC.ui.deptChip(note.department),
        note.tags.map(OC.ui.tagChip)
      ]),
      h('div', { class: 'readers' }, readers.length
        ? 'Read by ' + readers.length + ': ' + readers.join(', ')
        : 'Nobody has read this yet'),
      actions.length ? h('div', { class: 'actions' }, actions) : null,
      OC.can.commentOnInstruction(user, note) ? OC.ui.commentThread('instruction', note) : null
    ]);
  }

  function convertToTodo(note) {
    newTodo({
      title: note.body.slice(0, 70) + (note.body.length > 70 ? '…' : ''),
      description: 'From an instruction posted by ' + OC.ui.personName(note.author) + ' on ' + OC.ui.fmtDate(note.posted_at) + '.',
      client: note.client, department: note.department
    }, function (todo) {
      /* only once the todo actually exists — cancelling must leave the
         instruction unconverted */
      OC.store.mutate({ actor: OC.store.session(), action: 'instruction.convert', target: todo.title },
        function () { note.linked_todo = todo.id; });
    });
  }

  /* ---- post an instruction ----------------------------------------------- */
  function newInstruction() {
    var user = me();
    var body = h('textarea', { placeholder: 'the instruction, as it was given' });
    var client = OC.ui.select(optionsFor(OC.store.state.clients, 'Select a client'), '');
    var department = OC.ui.select(optionsFor(OC.store.state.departments, 'Select a department'), '');
    var tags = OC.ui.tagPicker([]);

    OC.ui.modal({
      title: 'Post an instruction',
      content: h('div', {}, [
        OC.ui.field('Instruction', body, { required: true, hint: 'Anyone may post an instruction — it is not restricted the way assignment is (6.3).' }),
        OC.ui.field('Client', client, { required: true, hint: 'Client and department are both required (5.2).' }),
        OC.ui.field('Department', department, { required: true, hint: 'Any department, not only your own (3.2).' }),
        OC.ui.field('Tags', tags.node, { hint: 'Typing narrows the list. A new tag is created inline and available to everyone immediately (6.4).' })
      ]),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Post instruction', primary: true, onClick: function (close) {
            if (!body.value.trim()) return 'Write the instruction first.';
            if (!client.value) return 'Select a client. This is required by 5.2.';
            if (!department.value) return 'Select a department. This is required by 5.2.';

            var note = {
              id: OC.store.uid('n'), body: body.value.trim(), author: user.id,
              client: client.value, department: department.value, tags: tags.resolve(),
              posted_at: new Date().toISOString(), read_by: [user.id],
              archived: false, linked_todo: null, comments: []
            };

            OC.store.mutate({ actor: user.id, action: 'instruction.post', target: note.body.slice(0, 48), detail: 'tagged ' + (OC.store.client(note.client) || {}).name }, function () {
              OC.store.state.instructions.push(note);
            });

            var audience = OC.store.state.users.filter(function (u) {
              return u.id !== user.id && OC.can.seeInstruction(u, note);
            }).map(function (u) { return u.id; });
            OC.store.notify(audience, user.name + ' posted an instruction for ' + (OC.store.client(note.client) || {}).name, note.id);
            OC.ui.toast('Instruction posted to ' + audience.length + ' people.');
            close();
          }
        }
      ]
    });
  }

  /* ---- combined client timeline (6.4) ------------------------------------
     "Filtering by client shows every instruction and todo for that client
     across every department in one combined, chronological view." Todos and
     instructions are merged on the moment each was recorded, newest first,
     and grouped by day. */
  function timeline(rerender) {
    var user = me();
    var entries = [];

    visibleTodos().forEach(function (t) {
      entries.push({ at: t.created_at, kind: 'todo', item: t });
    });
    visibleInstructions().forEach(function (n) {
      entries.push({ at: n.posted_at, kind: 'instruction', item: n });
    });
    entries.sort(function (a, b) { return b.at.localeCompare(a.at); });

    if (!entries.length) {
      return h('div', { class: 'empty' }, [OC.icon('filter'), 'Nothing recorded for these filters.']);
    }

    var wrap = h('div', {});
    var day = null;
    var current = null;

    entries.forEach(function (entry) {
      var thisDay = entry.at.slice(0, 10);
      if (thisDay !== day) {
        day = thisDay;
        wrap.appendChild(h('p', { class: 'tl-day' }, OC.ui.fmtDate(thisDay) + ' · ' + OC.ui.fmtWhen(entry.at)));
        current = h('div', { class: 'timeline' });
        wrap.appendChild(current);
      }
      current.appendChild(h('div', { class: 'tl-entry' + (entry.kind === 'todo' ? ' is-todo' : '') }, [
        h('p', { class: 'tl-kind' }, entry.kind === 'todo' ? 'Todo' : 'Instruction'),
        entry.kind === 'todo' ? todoItem(entry.item) : instructionItem(entry.item, rerender)
      ]));
    });
    return wrap;
  }

  /* ---- render ----------------------------------------------------------- */
  function render(host, rerender) {
    h = OC.ui.h;
    var user = me();
    var todos = visibleTodos();
    var notes = visibleInstructions();
    var unreadCount = notes.filter(function (n) { return n.read_by.indexOf(user.id) === -1; }).length;

    var groupControl = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Group todos by', title: 'Group todos by' },
      [['person', 'Person'], ['client', 'Client'], ['department', 'Department']].map(function (opt) {
        return h('button', {
          type: 'button', 'aria-pressed': String(grouping === opt[0]),
          onClick: function () { grouping = opt[0]; rerender(); }
        }, opt[1]);
      }));

    var todoPanel = h('section', { class: 'panel panel--todos' }, [
      h('div', { class: 'panel-head' }, [
        h('h2', {}, 'Todos'),
        h('span', { class: 'chip count' }, todos.length + ' visible'),
        h('div', { class: 'tools' }, [
          groupControl,
          h('button', { class: 'btn small primary', type: 'button', onClick: function () { newTodo(); } },
            [OC.icon('plus'), 'New todo'])
        ])
      ]),
      h('div', { class: 'panel-body scroll' }, todos.length
        ? groupTodos(todos).map(function (bucket) {
            return h('div', { class: 'stack' }, [
              h('div', { class: 'group-head' }, [bucket.key, h('span', { class: 'n push' }, bucket.items.length)]),
              bucket.items
                .sort(function (a, b) { return (a.due || '').localeCompare(b.due || ''); })
                .map(todoItem)
            ]);
          })
        : h('div', { class: 'empty' }, [OC.icon('filter'), 'No todos match these filters.']))
    ]);

    var notePanel = h('section', { class: 'panel panel--instructions' }, [
      h('div', { class: 'panel-head' }, [
        h('h2', {}, 'Instructions'),
        h('span', { class: 'chip count' }, notes.length + ' visible'),
        unreadCount ? h('span', { class: 'chip overdue' }, unreadCount + ' unread') : null,
        h('div', { class: 'tools' }, [
          h('button', { class: 'btn small primary', type: 'button', onClick: newInstruction },
            [OC.icon('plus'), 'Post instruction'])
        ])
      ]),
      h('div', { class: 'panel-body scroll' }, notes.length
        ? notes.map(function (n) { return instructionItem(n, rerender); })
        : h('div', { class: 'empty' }, [OC.icon('filter'), 'No instructions match these filters.']))
    ]);

    OC.ui.clear(host);
    OC.ui.append(host, [
      h('div', { class: 'page-head' }, [
        h('h1', {}, 'Board'),
        h('p', {}, 'Todos on the left, instructions on the right, both filtered by the same tags. You are seeing this as ' +
          user.name + ' (' + OC.can.roleLabel(user) + '), so the lists are scoped by section 3.0.')
      ]),
      filterBar(rerender),
      savedBar(rerender),
      h('div', { class: 'boardbar' }, [
        h('div', { class: 'segmented', role: 'group', 'aria-label': 'Board view' },
          [['panels', 'Two panels'], ['timeline', 'Client timeline']].map(function (opt) {
            return h('button', {
              type: 'button', 'aria-pressed': String(mode === opt[0]),
              onClick: function () { mode = opt[0]; rerender(); }
            }, opt[1]);
          })),
        h('label', { class: 'checkline' }, [
          h('input', { type: 'checkbox', checked: showDone, onChange: function (e) { showDone = e.target.checked; rerender(); } }),
          'Show completed'
        ]),
        h('label', { class: 'checkline' }, [
          h('input', { type: 'checkbox', checked: showArchived, onChange: function (e) { showArchived = e.target.checked; rerender(); } }),
          'Show archived'
        ]),
        h('button', { class: 'btn small push', type: 'button', onClick: copyYesterday },
          [OC.icon('reset'), 'Copy yesterday'])
      ]),
      mode === 'panels' ? h('div', { class: 'panel-tabs' }, [
        h('button', { type: 'button', 'aria-pressed': String(panel === 'todos'), onClick: function () { panel = 'todos'; rerender(); } }, 'Todos'),
        h('button', { type: 'button', 'aria-pressed': String(panel === 'instructions'), onClick: function () { panel = 'instructions'; rerender(); } }, 'Instructions')
      ]) : null,
      mode === 'panels'
        ? h('div', { class: 'board', 'data-panel': panel }, [todoPanel, notePanel])
        : h('section', { class: 'panel panel--timeline' }, [
            h('div', { class: 'panel-head' }, [
              h('h2', {}, clientLabel() + ' timeline'),
              h('span', { class: 'chip count' }, (todos.length + notes.length) + ' entries'),
              h('span', { class: 'sub' }, 'todos and instructions, every department, newest first')
            ]),
            h('div', { class: 'panel-body' }, timeline(rerender))
          ])
    ]);
  }

  return {
    render: render, newTodo: newTodo, newInstruction: newInstruction,
    applyFilter: function (next) { filters = JSON.parse(JSON.stringify(next)); mode = 'panels'; },
    /* a getter, because applying a pinned filter rebinds the object */
    get filters() { return filters; }
  };
})();
