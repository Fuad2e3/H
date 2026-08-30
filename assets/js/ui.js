/* =========================================================================
   ui.js — shared interface helpers
   Element construction, date formatting, the chips used to render tags and
   states, the modal dialog, and toasts. No view logic lives here; every
   view file builds its markup out of these.
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.ui = (function () {
  'use strict';

  /* ---- element construction -------------------------------------------- */
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    append(el, children);
    return el;
  }

  function append(el, children) {
    if (children === null || children === undefined || children === false) return;
    if (Array.isArray(children)) { children.forEach(function (c) { append(el, c); }); return; }
    el.appendChild(children.nodeType ? children : document.createTextNode(String(children)));
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  /* ---- dates ------------------------------------------------------------ */
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function today() { return new Date().toISOString().slice(0, 10); }

  function fmtDate(isoDate) {
    if (!isoDate) return '—';
    var p = isoDate.slice(0, 10).split('-');
    return Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1];
  }

  function daysLate(dueDate) {
    if (!dueDate) return 0;
    var due = new Date(dueDate + 'T12:00:00');
    var now = new Date(); now.setHours(12, 0, 0, 0);
    return Math.round((now - due) / 86400000);
  }

  function dueLabel(dueDate) {
    var late = daysLate(dueDate);
    if (late === 0) return 'due today';
    if (late === 1) return '1 day overdue';
    if (late > 1) return late + ' days overdue';
    if (late === -1) return 'due tomorrow';
    return 'due ' + fmtDate(dueDate);
  }

  function fmtWhen(isoStamp) {
    var then = new Date(isoStamp), now = new Date();
    var mins = Math.round((now - then) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    if (mins < 60 * 24) return Math.round(mins / 60) + 'h ago';
    var days = Math.round(mins / 1440);
    if (days < 7) return days + 'd ago';
    return fmtDate(isoStamp);
  }

  /* ---- chips ------------------------------------------------------------ */
  function clientChip(id) {
    var c = OC.store.client(id);
    return h('span', { class: 'chip client', title: 'Client' }, c ? c.name : 'No client');
  }

  function deptChip(id) {
    var d = OC.store.department(id);
    return h('span', { class: 'chip dept', title: 'Department' }, d ? d.name : 'No department');
  }

  function tagChip(id) {
    var t = OC.store.tag(id);
    if (!t) return null;
    return h('span', { class: 'chip custom', title: t.kind }, t.label);
  }

  var STATE_LABEL = { open: 'Open', progress: 'In progress', done: 'Done', blocked: 'Blocked' };
  var STATE_CLASS = { open: 'state-open', progress: 'state-progress', done: 'state-done', blocked: 'state-blocked' };

  function stateChip(state) {
    return h('span', { class: 'chip state ' + STATE_CLASS[state] }, [
      h('span', { class: 'dot' }), STATE_LABEL[state]
    ]);
  }

  /* ---- person mark --------------------------------------------------------
     Initials in a small square rather than a circle: this is a drafting
     aesthetic, and a square reads as a stamp on a document. The tint is
     derived from the account id, so a person keeps the same colour
     everywhere without any colour being stored on the record. */
  var MARK_TINTS = ['blueprint', 'brass', 'success', 'signal', 'slate'];

  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function mark(userId, extraClass) {
    var user = OC.store.user(userId);
    var name = user ? user.name : 'Unknown';
    var hash = 0;
    for (var i = 0; i < String(userId).length; i++) hash = (hash * 31 + String(userId).charCodeAt(i)) | 0;
    var tint = MARK_TINTS[Math.abs(hash) % MARK_TINTS.length];
    return h('span', {
      class: 'mark-tint tint-' + tint + (extraClass ? ' ' + extraClass : ''),
      title: name, 'aria-hidden': 'true'
    }, initials(name));
  }

  /* a person, shown as mark plus name */
  function person(userId, extraClass) {
    return h('span', { class: 'person' + (extraClass ? ' ' + extraClass : '') }, [
      mark(userId), h('span', {}, personName(userId))
    ]);
  }

  function personName(id) {
    var u = OC.store.user(id);
    return u ? u.name : 'Unknown';
  }

  function assigneeName(item) {
    if (item.assignee_type === 'group') {
      var g = OC.store.group(item.assignee);
      return g ? g.name : 'Unknown group';
    }
    return personName(item.assignee);
  }

  /* ---- form pieces ------------------------------------------------------ */
  function field(labelText, control, opts) {
    opts = opts || {};
    var label = h('label', { class: 'field' }, [
      h('span', { class: 'label' }, [labelText, opts.required ? h('span', { class: 'req' }, ' *') : null]),
      control,
      opts.hint ? h('span', { class: 'hint' }, opts.hint) : null
    ]);
    return label;
  }

  function select(options, value, attrs) {
    var el = h('select', attrs || {});
    options.forEach(function (o) {
      el.appendChild(h('option', { value: o.value, selected: o.value === value }, o.label));
    });
    if (value !== undefined && value !== null) el.value = value;
    return el;
  }

  /* ---- tag field (6.4) ---------------------------------------------------
     "Every tag field is both a searchable dropdown and a tick list; typing
     narrows the list live rather than requiring an exact match." So: a filter
     box over a scrolling tick list, plus inline creation of a new tag, which
     becomes available to everyone immediately. */
  function tagPicker(selected) {
    var chosen = (selected || []).slice();
    var search = h('input', { type: 'search', placeholder: 'narrow the list', 'aria-label': 'Filter tags' });
    var list = h('div', { class: 'ticklist', role: 'group', 'aria-label': 'Tags' });
    var newTag = h('input', { type: 'text', placeholder: 'or create a new tag' });

    function paint() {
      var q = search.value.trim().toLowerCase();
      clear(list);
      var tags = OC.store.state.tags.filter(function (t) {
        return !q || t.label.toLowerCase().indexOf(q) > -1 || t.kind.indexOf(q) > -1;
      });
      if (!tags.length) {
        list.appendChild(h('p', { class: 'ticklist-empty' }, 'No tag matches. Create one below.'));
        return;
      }
      tags.forEach(function (t) {
        var box = h('input', {
          type: 'checkbox', value: t.id, checked: chosen.indexOf(t.id) > -1,
          onChange: function (e) {
            var at = chosen.indexOf(t.id);
            if (e.target.checked && at === -1) chosen.push(t.id);
            if (!e.target.checked && at > -1) chosen.splice(at, 1);
          }
        });
        list.appendChild(h('label', { class: 'checkline' }, [
          box, t.label, h('span', { class: 'chip custom' }, t.kind)
        ]));
      });
    }
    search.addEventListener('input', paint);
    paint();

    return {
      node: h('div', { class: 'tagfield' }, [search, list, newTag]),
      /* returns the chosen tags, creating the typed one first if there is one */
      resolve: function () {
        var out = chosen.slice();
        var label = newTag.value.trim();
        if (label) {
          var existing = OC.store.state.tags.filter(function (t) {
            return t.label.toLowerCase() === label.toLowerCase();
          })[0];
          if (existing) {
            if (out.indexOf(existing.id) === -1) out.push(existing.id);
          } else {
            var made = { id: OC.store.uid('t'), label: label, kind: 'custom' };
            OC.store.state.tags.push(made);
            out.push(made.id);
          }
        }
        return out;
      }
    };
  }

  /* ---- reactions bar (react to todos & instructions) --------------------- */
  var EMOJIS = ['👍', '❤️', '🔥', '👏', '🎉', '🚀', '👀', '✅'];

  function reactionsBar(kind, item, onChange) {
    var user = OC.store.user(OC.store.session());
    if (!user || !item) return null;
    var reactions = item.reactions || {};
    var reactionKeys = Object.keys(reactions).filter(function (k) {
      return Array.isArray(reactions[k]) && reactions[k].length > 0;
    });

    var wrap = h('div', { class: 'reactions-bar' });
    var pickerPop = null;

    function toggleReact(emoji) {
      var list = (item.reactions && item.reactions[emoji]) || [];
      var had = list.indexOf(user.id) > -1;
      OC.store.mutate({
        actor: user.id, action: kind + '.react',
        target: item.title || (item.body ? item.body.slice(0, 40) : item.id),
        detail: emoji + ' (' + (had ? 'removed' : 'added') + ') by ' + user.name
      }, function () {
        OC.store.react(kind, item.id, emoji, user.id);
      });
      if (onChange) onChange();
      else OC.store.emit();
    }

    reactionKeys.forEach(function (emoji) {
      var uids = reactions[emoji] || [];
      var isReacted = uids.indexOf(user.id) > -1;
      var names = uids.map(function (uid) {
        var u = OC.store.user(uid);
        return u ? u.name : uid;
      }).join(', ');

      var pill = h('button', {
        type: 'button',
        class: 'reaction-pill' + (isReacted ? ' active' : ''),
        title: (names ? names + ' reacted with ' : 'Reacted with ') + emoji,
        onClick: function (e) {
          e.preventDefault();
          e.stopPropagation();
          toggleReact(emoji);
        }
      }, [
        h('span', { class: 'emoji' }, emoji),
        h('span', { class: 'count' }, String(uids.length))
      ]);
      wrap.appendChild(pill);
    });

    var pickerBtn = h('button', {
      type: 'button',
      class: 'reaction-picker-btn',
      title: 'Add reaction',
      onClick: function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (pickerPop) {
          pickerPop.remove();
          pickerPop = null;
          return;
        }
        pickerPop = h('div', { class: 'reaction-picker-pop' }, EMOJIS.map(function (em) {
          return h('button', {
            type: 'button',
            class: 'reaction-emoji-btn',
            title: 'React ' + em,
            onClick: function (ev) {
              ev.preventDefault();
              ev.stopPropagation();
              toggleReact(em);
              if (pickerPop) { pickerPop.remove(); pickerPop = null; }
            }
          }, em);
        }));
        wrap.appendChild(pickerPop);

        var closeDoc = function (ev) {
          if (pickerPop && !pickerPop.contains(ev.target) && ev.target !== pickerBtn) {
            pickerPop.remove();
            pickerPop = null;
            document.removeEventListener('click', closeDoc);
          }
        };
        setTimeout(function () { document.addEventListener('click', closeDoc); }, 0);
      }
    }, [
      h('span', { class: 'icon-smile' }, '😀'),
      h('span', { class: 'btn-label' }, '+ React')
    ]);

    wrap.appendChild(pickerBtn);
    return wrap;
  }

  /* ---- comment thread (5.0, Comment) ------------------------------------- */
  function commentThread(kind, item, onChange) {
    var user = OC.store.user(OC.store.session());
    if (!OC.can.canSeeComments(user, item)) return null;

    var label = 'Comment on ' + (item.title || String(item.body).slice(0, 40));
    var body = h('input', { type: 'text', placeholder: 'add a comment...', 'aria-label': label });
    var count = (item.comments || []).length;
    var deptObj = OC.store.department(item.department);
    var deptName = deptObj ? deptObj.name : 'Department';

    var wrap = h('details', { class: 'thread' }, [
      h('summary', {}, [
        h('span', {}, count ? count + (count === 1 ? ' comment' : ' comments') : 'Comment'),
        h('span', { class: 'dept-visibility-tag' }, deptName + ' & Admin only')
      ]),
      h('div', { class: 'thread-body' }, [
        h('div', { class: 'dept-visibility-notice' }, [
          OC.icon('lock'),
          h('span', {}, 'Visible to ' + deptName + ' team members & System Admin only.')
        ]),
        (item.comments || []).map(function (c) {
          return h('div', { class: 'comment' }, [
            h('div', { class: 'comment-by' }, [
              person(c.author, 'strong'),
              h('span', {}, fmtWhen(c.posted_at))
            ]),
            h('div', { class: 'comment-body-text' }, c.body)
          ]);
        }),
        h('div', { class: 'comment-form' }, [
          body,
          h('button', {
            class: 'btn small primary', type: 'button', onClick: function () {
              if (!body.value.trim()) return;
              var text = body.value.trim();
              OC.store.mutate({
                actor: user ? user.id : OC.store.session(), action: kind + '.comment',
                target: item.title || (item.body ? item.body.slice(0, 40) : item.id), detail: text
              }, function () {
                OC.store.comment(kind, item.id, text, user ? user.id : OC.store.session());
              });
              body.value = '';
              if (onChange) onChange();
              else OC.store.emit();
            }
          }, 'Post')
        ])
      ])
    ]);
    return wrap;
  }

  /* ---- modal ------------------------------------------------------------ */
  function modal(opts) {
    var dlg = h('dialog', { class: 'modal' });
    var backdrop = null;
    var escapeHandler = null;
    var errorBox = h('div', { class: 'error', style: 'display:none;' });
    var errorText = h('span', {});
    errorBox.appendChild(OC.icon('alert'));
    errorBox.appendChild(errorText);

    function close() {
      if (escapeHandler) { document.removeEventListener('keydown', escapeHandler); escapeHandler = null; }
      if (backdrop) { backdrop.remove(); backdrop = null; }
      if (dlg.open && typeof dlg.close === 'function') dlg.close();
      dlg.remove();
    }

    var primaryButton = null;
    var actions = (opts.actions || []).map(function (a) {
      var button = h('button', {
        class: 'btn' + (a.primary ? ' primary' : ''),
        type: 'button',
        onClick: function () {
          var problem = a.onClick ? a.onClick(close) : null;
          if (problem) {
            errorText.textContent = problem;
            errorBox.style.display = 'flex';
          }
        }
      }, a.label);
      if (a.primary) primaryButton = button;
      return button;
    });

    dlg.appendChild(h('div', { class: 'modal-head' }, [
      h('h2', {}, opts.title),
      h('button', { class: 'iconbtn push', type: 'button', 'aria-label': 'Close', onClick: close }, 'Close')
    ]));
    dlg.appendChild(h('div', { class: 'modal-body' }, [errorBox, opts.content]));
    if (actions.length) dlg.appendChild(h('div', { class: 'modal-foot' }, actions));

    /* Enter anywhere but a textarea runs the primary action. Without this a
       filled-in form plus the Enter key does nothing at all, which reads as a
       broken button. */
    dlg.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || !primaryButton) return;
      var tag = e.target.tagName;
      if (tag === 'TEXTAREA' || tag === 'BUTTON') return;
      e.preventDefault();
      primaryButton.click();
    });

    /* clicking the backdrop dismisses, as people expect */
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });

    document.body.appendChild(dlg);
    dlg.addEventListener('close', function () { dlg.remove(); if (backdrop) backdrop.remove(); });

    /* <dialog> is not everywhere. Without this fallback every modal button is
       dead on an older browser rather than merely unstyled. */
    if (typeof dlg.showModal === 'function') {
      dlg.showModal();
    } else {
      backdrop = h('div', { class: 'modal-backdrop', onClick: close });
      document.body.appendChild(backdrop);
      dlg.setAttribute('open', '');
      dlg.classList.add('fallback');
      escapeHandler = function (e) { if (e.key === 'Escape') close(); };
      document.addEventListener('keydown', escapeHandler);
    }

    var first = dlg.querySelector('input,textarea,select');
    if (first) first.focus();
    return { close: close, root: dlg };
  }

  function confirm(message, onYes) {
    modal({
      title: 'Confirm',
      content: h('p', {}, message),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        { label: 'Confirm', primary: true, onClick: function (close) { onYes(); close(); } }
      ]
    });
  }

  /* ---- custom client creation modal & picker --------------------------- */
  function newClientModal(onCreated) {
    var user = OC.store.user(OC.store.session());
    var name = h('input', { type: 'text', placeholder: 'e.g. Acme Corp, Apex Solutions' });
    var contact = h('input', { type: 'text', placeholder: 'e.g. John Doe / Lead Contact' });

    modal({
      title: 'Add new client',
      content: h('div', {}, [
        field('Client / Company name', name, { required: true, hint: 'Official client or account name for task assignment.' }),
        field('Primary contact', contact, { hint: 'Person responsible on the client side (optional).' })
      ]),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Add client', primary: true, onClick: function (close) {
            var cName = name.value.trim();
            if (!cName) return 'Please enter a client name.';
            var exists = OC.store.state.clients.some(function (c) {
              return c.name.toLowerCase() === cName.toLowerCase();
            });
            if (exists) return 'A client with this name already exists.';

            var newClient = {
              id: OC.store.uid('c'),
              name: cName,
              contact: contact.value.trim() || cName,
              status: 'active'
            };

            OC.store.mutate({
              actor: user ? user.id : 'u-shohag',
              action: 'client.create',
              target: newClient.name,
              detail: 'Added client ' + newClient.name
            }, function () {
              OC.store.state.clients.push(newClient);
            });

            toast('Client "' + newClient.name + '" added.');
            if (onCreated) onCreated(newClient);
            close();
          }
        }
      ]
    });
  }

  function clientPicker(selectedValue, onChange) {
    var selectEl = h('select', {});
    var user = OC.store.user(OC.store.session());
    var canAdd = !!(OC.can && OC.can.createClient ? OC.can.createClient(user) : (user && user.admin));

    function refresh(preselectId) {
      clear(selectEl);
      selectEl.appendChild(h('option', { value: '' }, 'Select a client'));
      OC.store.state.clients.forEach(function (c) {
        var opt = h('option', { value: c.id }, c.name);
        if (c.id === preselectId) opt.selected = true;
        selectEl.appendChild(opt);
      });
      if (canAdd) {
        selectEl.appendChild(h('option', { value: '__new__' }, '+ Add new client...'));
      }
      if (preselectId !== undefined) selectEl.value = preselectId;
    }

    refresh(selectedValue || '');

    selectEl.addEventListener('change', function () {
      if (selectEl.value === '__new__') {
        selectEl.value = selectedValue || '';
        newClientModal(function (newClient) {
          selectedValue = newClient.id;
          refresh(newClient.id);
          if (onChange) onChange(newClient.id);
        });
        return;
      }
      selectedValue = selectEl.value;
      if (onChange) onChange(selectEl.value);
    });

    var addBtn = canAdd ? h('button', {
      class: 'btn small',
      type: 'button',
      title: 'Add new client (Admin and Department Head only)',
      onClick: function () {
        newClientModal(function (newClient) {
          selectedValue = newClient.id;
          refresh(newClient.id);
          if (onChange) onChange(newClient.id);
        });
      }
    }, [OC.icon ? OC.icon('plus') : '+', ' New Client']) : null;

    var row = h('div', { class: 'client-picker-row' }, [
      selectEl,
      addBtn
    ].filter(Boolean));

    return {
      node: row,
      select: selectEl,
      getValue: function () { return selectEl.value; },
      setValue: function (v) { selectedValue = v; refresh(v); },
      refresh: refresh
    };
  }

  /* ---- toasts ----------------------------------------------------------- */
  function toast(message, warn) {
    var host = document.querySelector('.toasts');
    if (!host) {
      host = h('div', { class: 'toasts' });
      document.body.appendChild(host);
    }
    var t = h('div', { class: 'toast' + (warn ? ' warn' : '') },
      [OC.icon(warn ? 'alert' : 'check'), h('span', {}, message)]);
    host.appendChild(t);
    setTimeout(function () { t.remove(); }, 4200);
  }

  return {
    h: h, clear: clear, append: append,
    today: today, fmtDate: fmtDate, fmtWhen: fmtWhen, daysLate: daysLate, dueLabel: dueLabel,
    clientChip: clientChip, deptChip: deptChip, tagChip: tagChip, stateChip: stateChip,
    personName: personName, assigneeName: assigneeName,
    initials: initials, mark: mark, person: person,
    STATE_LABEL: STATE_LABEL,
    field: field, select: select, clientPicker: clientPicker, newClientModal: newClientModal,
    tagPicker: tagPicker, reactionsBar: reactionsBar, commentThread: commentThread,
    modal: modal, confirm: confirm, toast: toast
  };
})();
