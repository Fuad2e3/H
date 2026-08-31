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
    if (Array.isArray(children)) {
      var frag = (typeof document !== 'undefined' && document.createDocumentFragment) ? document.createDocumentFragment() : null;
      for (var i = 0; i < children.length; i++) {
        var c = children[i];
        if (c === null || c === undefined || c === false) continue;
        if (Array.isArray(c)) {
          append(frag || el, c);
        } else {
          var node = c.nodeType ? c : document.createTextNode(String(c));
          if (frag) frag.appendChild(node);
          else el.appendChild(node);
        }
      }
      if (frag) el.appendChild(frag);
      return;
    }
    el.appendChild(children.nodeType ? children : document.createTextNode(String(children)));
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  function debounce(fn, wait) {
    var timer;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, wait || 150);
    };
  }

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
  function clientLabel(c) {
    if (!c) return 'No client';
    if (typeof c === 'string') {
      var obj = OC.store.client(c);
      if (obj) c = obj;
      else return c;
    }
    var parts = [];
    if (c.client_id) parts.push(c.client_id);
    if (c.client_code) parts.push(c.client_code);
    if (c.name) parts.push(c.name);
    return parts.length ? parts.join(' - ') : (c.name || 'No client');
  }

  function clientChip(id) {
    var c = OC.store.client(id);
    return h('span', { class: 'chip client', title: 'Client' }, c ? clientLabel(c) : 'No client');
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
    var cleanId = (typeof userId === 'string' && userId.indexOf('user:') === 0) ? userId.slice(5) : userId;
    var user = OC.store.user(cleanId);
    var name = user ? user.name : 'Unknown';
    var hash = 0;
    for (var i = 0; i < String(cleanId).length; i++) hash = (hash * 31 + String(cleanId).charCodeAt(i)) | 0;
    var tint = MARK_TINTS[Math.abs(hash) % MARK_TINTS.length];

    if (user && user.avatar) {
      var img = h('img', {
        src: user.avatar,
        alt: name,
        class: 'mark-avatar-img'
      });
      var markEl = h('span', {
        class: 'mark-tint mark-avatar' + (extraClass ? ' ' + extraClass : ''),
        title: name, 'aria-hidden': 'true'
      }, [img]);
      img.onerror = function () {
        markEl.className = 'mark-tint tint-' + tint + (extraClass ? ' ' + extraClass : '');
        markEl.textContent = initials(name);
      };
      return markEl;
    }

    return h('span', {
      class: 'mark-tint tint-' + tint + (extraClass ? ' ' + extraClass : ''),
      title: name, 'aria-hidden': 'true'
    }, initials(name));
  }

  /* a person, shown as mark plus name */
  function person(userId, extraClass) {
    var cleanId = (typeof userId === 'string' && userId.indexOf('user:') === 0) ? userId.slice(5) : userId;
    return h('span', { class: 'person' + (extraClass ? ' ' + extraClass : '') }, [
      mark(cleanId), h('span', {}, personName(cleanId))
    ]);
  }

  function personName(id) {
    if (!id) return 'Unknown';
    var cleanId = (typeof id === 'string' && id.indexOf('user:') === 0) ? id.slice(5) : id;
    var u = OC.store.user(cleanId);
    return u ? u.name : 'Unknown';
  }

  function assigneeName(item) {
    if (!item) return 'Unassigned';
    if (Array.isArray(item.assignees) && item.assignees.length > 0) {
      return item.assignees.map(function (id) {
        if (typeof id === 'string') {
          if (id.indexOf('user:') === 0) {
            var rawU = OC.store.user(id.slice(5));
            return rawU ? rawU.name : id.slice(5);
          }
          if (id.indexOf('group:') === 0) {
            var rawG = OC.store.group(id.slice(6));
            return rawG ? rawG.name : id.slice(6);
          }
        }
        var u = OC.store.user(id);
        if (u) return u.name;
        var g = OC.store.group(id);
        return g ? g.name : id;
      }).join(', ');
    }
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

      // Targeted notification: Send ONLY to concerned owner/assignee, NOT everyone
      if (!had) {
        var targets = [];
        if (kind === 'todo') {
          if (item.created_by) targets.push(item.created_by);
          if (Array.isArray(item.assignees)) {
            item.assignees.forEach(function (aid) {
              if (aid.indexOf('user:') === 0) targets.push(aid.slice(5));
              else if (aid.indexOf('group:') === 0) {
                var g = OC.store.group(aid.slice(6));
                if (g && g.members) targets = targets.concat(g.members);
              } else {
                targets.push(aid);
              }
            });
          }
          if (item.assignee_type === 'user' && item.assignee) targets.push(item.assignee);
          else if (item.assignee_type === 'group' && item.assignee) {
            var g = OC.store.group(item.assignee);
            if (g && g.members) targets = targets.concat(g.members);
          }
        } else if (kind === 'instruction') {
          if (item.author) targets.push(item.author);
        }
        targets = targets.filter(function (uid, idx, arr) {
          return uid && uid !== user.id && arr.indexOf(uid) === idx;
        });
        if (targets.length) {
          var itemTitle = kind === 'todo' ? item.title : (item.body ? item.body.slice(0, 35) + '…' : 'instruction');
          OC.store.notify(targets, user.name + ' reacted ' + emoji + ' on ' + (kind === 'todo' ? 'task: "' + itemTitle + '"' : 'instruction: "' + itemTitle + '"'), item.id);
        }
      }

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
    var deptNames = (Array.isArray(item.departments) && item.departments.length)
      ? item.departments.map(function (did) { return (OC.store.department(did) || {}).name || did; }).join(', ')
      : ((OC.store.department(item.department) || {}).name || 'Department');

    var wrap = h('details', { class: 'thread' }, [
      h('summary', {}, [
        h('span', {}, count ? count + (count === 1 ? ' comment' : ' comments') : 'Comment'),
        h('span', { class: 'dept-visibility-tag' }, deptNames + ' & Admin only')
      ]),
      h('div', { class: 'thread-body' }, [
        h('div', { class: 'dept-visibility-notice' }, [
          OC.icon('lock'),
          h('span', {}, 'Visible to ' + deptNames + ' team members & System Admin only.')
        ]),
        (item.comments || []).map(function (c) {
          var canEdit = OC.can && OC.can.canEditComment ? OC.can.canEditComment(user, c, item) : (user && (user.admin || c.author === user.id));
          var canDel = OC.can && OC.can.canDeleteComment ? OC.can.canDeleteComment(user, c, item) : (user && (user.admin || c.author === user.id));

          return h('div', { class: 'comment' }, [
            h('div', { class: 'comment-by' }, [
              person(c.author, 'strong'),
              h('span', {}, fmtWhen(c.posted_at)),
              c.edited_at ? h('span', { class: 'comment-edited-tag', style: 'font-size:9.5px;opacity:0.7;' }, '(edited)') : null,
              (canEdit || canDel) ? h('div', { class: 'comment-tools push' }, [
                canEdit ? h('button', {
                  class: 'btn-inline',
                  type: 'button',
                  title: 'Edit comment',
                  onClick: function (e) {
                    e.preventDefault();
                    var editInput = h('textarea', {}, c.body);
                    modal({
                      title: 'Edit comment',
                      content: field('Comment', editInput, { required: true }),
                      actions: [
                        { label: 'Cancel', onClick: function (close) { close(); } },
                        {
                          label: 'Save', primary: true, onClick: function (close) {
                            var newText = editInput.value.trim();
                            if (!newText) return 'Comment cannot be empty.';
                            OC.store.mutate({
                              actor: user.id, action: kind + '.comment.edit',
                              target: item.title || (item.body ? item.body.slice(0, 40) : item.id),
                              detail: 'Edited comment'
                            }, function () {
                              OC.store.editComment(kind, item.id, c.id, newText);
                            });
                            toast('Comment updated.');
                            if (onChange) onChange();
                            else OC.store.emit();
                            close();
                          }
                        }
                      ]
                    });
                  }
                }, 'Edit') : null,
                canDel ? h('button', {
                  class: 'btn-inline danger',
                  type: 'button',
                  title: 'Delete comment',
                  onClick: function (e) {
                    e.preventDefault();
                    confirm('Delete this comment? This cannot be undone.', function () {
                      OC.store.mutate({
                        actor: user.id, action: kind + '.comment.delete',
                        target: item.title || (item.body ? item.body.slice(0, 40) : item.id),
                        detail: 'Deleted comment'
                      }, function () {
                        OC.store.deleteComment(kind, item.id, c.id);
                      });
                      toast('Comment deleted.');
                      if (onChange) onChange();
                      else OC.store.emit();
                    });
                  }
                }, 'Delete') : null
              ].filter(Boolean)) : null
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

              // Targeted notification: Send ONLY to concerned owner, assignee, and thread participants
              var targets = [];
              if (kind === 'todo') {
                if (item.created_by) targets.push(item.created_by);
                if (Array.isArray(item.assignees)) {
                  item.assignees.forEach(function (aid) {
                    if (aid.indexOf('user:') === 0) targets.push(aid.slice(5));
                    else if (aid.indexOf('group:') === 0) {
                      var g = OC.store.group(aid.slice(6));
                      if (g && g.members) targets = targets.concat(g.members);
                    } else {
                      targets.push(aid);
                    }
                  });
                }
                if (item.assignee_type === 'user' && item.assignee) targets.push(item.assignee);
                else if (item.assignee_type === 'group' && item.assignee) {
                  var g = OC.store.group(item.assignee);
                  if (g && g.members) targets = targets.concat(g.members);
                }
              } else if (kind === 'instruction') {
                if (item.author) targets.push(item.author);
              }
              (item.comments || []).forEach(function (c) {
                if (c.author) targets.push(c.author);
              });

              var curUid = user ? user.id : OC.store.session();
              var curName = user ? user.name : 'Someone';
              targets = targets.filter(function (uid, idx, arr) {
                return uid && uid !== curUid && arr.indexOf(uid) === idx;
              });

              if (targets.length) {
                var itemTitle = kind === 'todo' ? item.title : (item.body ? item.body.slice(0, 35) + '…' : 'instruction');
                OC.store.notify(targets, curName + ' commented on ' + (kind === 'todo' ? 'task: "' + itemTitle + '"' : 'instruction: "' + itemTitle + '"'), item.id);
              }

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
    var clientId = h('input', { type: 'text', placeholder: 'e.g. 0583, CL-101' });
    var clientCode = h('input', { type: 'text', placeholder: 'e.g. TFR, ACME' });
    var name = h('input', { type: 'text', placeholder: 'e.g. Acme Corp, Apex Solutions' });
    var contact = h('input', { type: 'text', placeholder: 'e.g. John Doe / Lead Contact' });

    modal({
      title: 'Add new client',
      content: h('div', {}, [
        field('Client ID', clientId, { hint: 'Unique client identifier or account number (optional).' }),
        field('Client code', clientCode, { hint: 'Short ticker or abbreviation code (optional).' }),
        field('Client / Company name', name, { required: true, hint: 'Official client or account name for task assignment.' }),
        field('Primary contact', contact, { hint: 'Person responsible on the client side (optional).' })
      ]),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Add client', primary: true, onClick: function (close) {
            var cName = name.value.trim();
            if (!cName) return 'Please enter a client name.';
            var cIdVal = clientId.value.trim();
            var cCodeVal = clientCode.value.trim();
            var exists = OC.store.state.clients.some(function (c) {
              return c.name.toLowerCase() === cName.toLowerCase();
            });
            if (exists) return 'A client with this name already exists.';

            var newClient = {
              id: OC.store.uid('c'),
              client_id: cIdVal,
              client_code: cCodeVal,
              name: cName,
              contact: contact.value.trim() || cName,
              status: 'active'
            };

            OC.store.mutate({
              actor: user ? user.id : 'u-shohag',
              action: 'client.create',
              target: newClient.name,
              detail: 'Added client ' + clientLabel(newClient)
            }, function () {
              OC.store.state.clients.push(newClient);
            });

            toast('Client "' + clientLabel(newClient) + '" added.');
            if (onCreated) onCreated(newClient);
            close();
          }
        }
      ]
    });
  }

  function clientPicker(selectedValues, onChange) {
    var user = OC.store.user(OC.store.session());
    var canAdd = !!(OC.can && OC.can.createClient ? OC.can.createClient(user) : (user && user.admin));

    var chosen = [];
    (Array.isArray(selectedValues) ? selectedValues : [selectedValues]).forEach(function (val) {
      if (val && chosen.indexOf(val) === -1) chosen.push(val);
    });

    var root = h('div', { class: 'multi-picker client-multi-picker' });
    var topRow = h('div', { class: 'multi-picker-head' });
    var chipsWrap = h('div', { class: 'multi-picker-chips' });
    var searchInput = h('input', { type: 'search', placeholder: 'Search clients...', 'aria-label': 'Filter clients', style: 'flex:1;' });
    var listWrap = h('div', { class: 'multi-picker-list', role: 'group', 'aria-label': 'Clients' });

    var addBtn = canAdd ? h('button', {
      class: 'btn small',
      type: 'button',
      title: 'Add new client',
      onClick: function () {
        newClientModal(function (newClient) {
          if (chosen.indexOf(newClient.id) === -1) chosen.push(newClient.id);
          render();
          if (onChange) onChange(getClients());
        });
      }
    }, [OC.icon ? OC.icon('plus') : '+', ' New Client']) : null;

    topRow.appendChild(searchInput);
    if (addBtn) topRow.appendChild(addBtn);

    function renderChips() {
      clear(chipsWrap);
      if (!chosen.length) {
        chipsWrap.appendChild(h('span', { class: 'muted', style: 'font-size:12px;font-style:italic;' }, 'No client selected (select from list below)'));
        return;
      }
      chosen.forEach(function (cid) {
        var c = OC.store.client(cid);
        var label = c ? clientLabel(c) : cid;

        var removeBtn = h('button', {
          type: 'button',
          class: 'chip-remove',
          title: 'Remove ' + label,
          onClick: function (e) {
            e.preventDefault();
            e.stopPropagation();
            var at = chosen.indexOf(cid);
            if (at > -1) chosen.splice(at, 1);
            render();
            if (onChange) onChange(getClients());
          }
        }, '✕');

        var chip = h('span', { class: 'multi-picker-chip client-chip' }, [
          h('span', {}, label),
          removeBtn
        ]);
        chipsWrap.appendChild(chip);
      });
    }

    function renderList() {
      clear(listWrap);
      var q = searchInput.value.trim().toLowerCase();
      var clients = (OC.store.state.clients || []).filter(function (c) {
        if (!q) return true;
        var full = [c.client_id, c.client_code, c.name, c.contact].filter(Boolean).join(' ').toLowerCase();
        return full.indexOf(q) > -1;
      });

      if (!clients.length) {
        listWrap.appendChild(h('p', { class: 'ticklist-empty' }, 'No clients found' + (q ? ' matching "' + q + '"' : '') + '. Click "+ New Client" above.'));
        return;
      }

      clients.forEach(function (c) {
        var isChecked = chosen.indexOf(c.id) > -1;
        var display = clientLabel(c);
        var chk = h('input', {
          type: 'checkbox',
          value: c.id,
          checked: isChecked,
          onChange: function (e) {
            var at = chosen.indexOf(c.id);
            if (e.target.checked && at === -1) chosen.push(c.id);
            if (!e.target.checked && at > -1) chosen.splice(at, 1);
            render();
            if (onChange) onChange(getClients());
          }
        });

        var line = h('label', { class: 'multi-picker-item-line' }, [
          chk,
          h('span', { style: 'font-weight:500;' }, display),
          c.contact && c.contact !== c.name ? h('span', { class: 'muted', style: 'margin-left:auto;font-size:11px;' }, c.contact) : null
        ].filter(Boolean));
        listWrap.appendChild(line);
      });
    }

    function render() {
      renderChips();
      renderList();
    }

    searchInput.addEventListener('input', renderList);

    root.appendChild(chipsWrap);
    root.appendChild(topRow);
    root.appendChild(listWrap);

    render();

    function getClients() { return chosen.slice(); }
    function getValue() { return chosen.length ? chosen[0] : ''; }

    return {
      node: root,
      getValue: getValue,
      getClients: getClients,
      setValue: function (v) {
        chosen = (Array.isArray(v) ? v : [v]).filter(Boolean);
        render();
      },
      refresh: function () { render(); }
    };
  }

  /* ---- department multi-select picker ------------------------------------- */
  function deptPicker(selectedValues, currentUser, onChange) {
    currentUser = currentUser || OC.store.user(OC.store.session());
    var allDepts = OC.store.state.departments || [];
    var allowedDepts = (currentUser && currentUser.admin) ? allDepts
      : allDepts.filter(function (d) { return OC.can && OC.can.inDept ? OC.can.inDept(currentUser, d.id) : true; });

    var chosen = [];
    (Array.isArray(selectedValues) ? selectedValues : [selectedValues]).forEach(function (val) {
      if (val && chosen.indexOf(val) === -1) chosen.push(val);
    });

    var root = h('div', { class: 'multi-picker dept-multi-picker' });
    var chipsWrap = h('div', { class: 'multi-picker-chips' });
    var searchInput = h('input', { type: 'search', placeholder: 'Search departments...', 'aria-label': 'Filter departments' });
    var listWrap = h('div', { class: 'multi-picker-list', role: 'group', 'aria-label': 'Departments' });

    function renderChips() {
      clear(chipsWrap);
      if (!chosen.length) {
        chipsWrap.appendChild(h('span', { class: 'muted', style: 'font-size:12px;font-style:italic;' }, 'No department selected (select below)'));
        return;
      }
      chosen.forEach(function (did) {
        var d = OC.store.department(did);
        var label = d ? d.name : did;

        var removeBtn = h('button', {
          type: 'button',
          class: 'chip-remove',
          title: 'Remove ' + label,
          onClick: function (e) {
            e.preventDefault();
            e.stopPropagation();
            var at = chosen.indexOf(did);
            if (at > -1) chosen.splice(at, 1);
            render();
            if (onChange) onChange(getDepartments());
          }
        }, '✕');

        var chip = h('span', { class: 'multi-picker-chip dept-chip' }, [
          h('span', {}, label),
          removeBtn
        ]);
        chipsWrap.appendChild(chip);
      });
    }

    function renderList() {
      clear(listWrap);
      var q = searchInput.value.trim().toLowerCase();
      var depts = allowedDepts.filter(function (d) {
        return !q || d.name.toLowerCase().indexOf(q) > -1 || d.id.toLowerCase().indexOf(q) > -1;
      });

      if (!depts.length) {
        listWrap.appendChild(h('p', { class: 'ticklist-empty' }, 'No departments found matching "' + q + '"'));
        return;
      }

      depts.forEach(function (d) {
        var isChecked = chosen.indexOf(d.id) > -1;
        var chk = h('input', {
          type: 'checkbox',
          value: d.id,
          checked: isChecked,
          onChange: function (e) {
            var at = chosen.indexOf(d.id);
            if (e.target.checked && at === -1) chosen.push(d.id);
            if (!e.target.checked && at > -1) chosen.splice(at, 1);
            render();
            if (onChange) onChange(getDepartments());
          }
        });

        var line = h('label', { class: 'multi-picker-item-line' }, [
          chk,
          h('span', { style: 'font-weight:500;' }, d.name),
          h('span', { class: 'chip custom', style: 'margin-left:auto;font-size:10.5px;' }, d.id)
        ]);
        listWrap.appendChild(line);
      });
    }

    function render() {
      renderChips();
      renderList();
    }

    searchInput.addEventListener('input', renderList);

    root.appendChild(chipsWrap);
    root.appendChild(searchInput);
    root.appendChild(listWrap);

    render();

    function getDepartments() { return chosen.slice(); }
    function getValue() { return chosen.length ? chosen[0] : ''; }

    return {
      node: root,
      getValue: getValue,
      getDepartments: getDepartments,
      setValue: function (v) {
        chosen = (Array.isArray(v) ? v : [v]).filter(Boolean);
        render();
      },
      refresh: function () { render(); }
    };
  }

  /* ---- assignee picker (multi-select persons & groups) -------------------- */
  function assigneePicker(selectedValues, currentUser, onChange) {
    currentUser = currentUser || OC.store.user(OC.store.session());
    var assignablePeople = OC.can ? OC.can.assignableUsers(currentUser) : (OC.store.state.users || []);
    var assignableGroups = OC.can ? OC.can.assignableGroups(currentUser) : (OC.store.state.groups || []);

    var chosen = [];
    (Array.isArray(selectedValues) ? selectedValues : [selectedValues]).forEach(function (val) {
      if (!val) return;
      var str = String(val);
      if (str.indexOf(':') === -1) {
        var isGroup = assignableGroups.some(function (g) { return g.id === str; });
        str = (isGroup ? 'group:' : 'user:') + str;
      }
      if (chosen.indexOf(str) === -1) chosen.push(str);
    });

    var root = h('div', { class: 'assignee-picker' });
    var chipsWrap = h('div', { class: 'assignee-selected-chips' });
    var searchInput = h('input', { type: 'search', placeholder: 'Search team members or groups...', 'aria-label': 'Filter assignees' });
    var listWrap = h('div', { class: 'assignee-list', role: 'group', 'aria-label': 'Assignees' });

    function renderChips() {
      clear(chipsWrap);
      if (!chosen.length) {
        chipsWrap.appendChild(h('span', { class: 'muted', style: 'font-size:12px;font-style:italic;' }, 'No person selected (click below to select)'));
        return;
      }
      chosen.forEach(function (itemVal) {
        var parts = itemVal.split(':');
        var type = parts[0];
        var id = parts[1];
        var label = '';
        var markEl = null;

        if (type === 'group') {
          var g = OC.store.group(id);
          label = g ? g.name + ' (group)' : id;
          markEl = h('span', { class: 'chip group' }, 'Group');
        } else {
          var u = OC.store.user(id);
          label = u ? u.name : id;
          markEl = mark(id);
        }

        var removeBtn = h('button', {
          type: 'button',
          class: 'chip-remove',
          title: 'Remove ' + label,
          onClick: function (e) {
            e.preventDefault();
            e.stopPropagation();
            var at = chosen.indexOf(itemVal);
            if (at > -1) chosen.splice(at, 1);
            render();
            if (onChange) onChange(getAssignees());
          }
        }, '✕');

        var chip = h('span', { class: 'assignee-chip' }, [
          markEl,
          h('span', {}, label),
          removeBtn
        ]);
        chipsWrap.appendChild(chip);
      });
    }

    function renderList() {
      clear(listWrap);
      var q = searchInput.value.trim().toLowerCase();

      var filteredPeople = assignablePeople.filter(function (u) {
        return !q || u.name.toLowerCase().indexOf(q) > -1 || (u.email && u.email.toLowerCase().indexOf(q) > -1);
      });

      var filteredGroups = assignableGroups.filter(function (g) {
        return !q || g.name.toLowerCase().indexOf(q) > -1 || (g.purpose && g.purpose.toLowerCase().indexOf(q) > -1);
      });

      if (!filteredPeople.length && !filteredGroups.length) {
        listWrap.appendChild(h('p', { class: 'ticklist-empty' }, 'No team members or groups found matching "' + q + '"'));
        return;
      }

      if (filteredPeople.length) {
        listWrap.appendChild(h('div', { style: 'font-size:11px;text-transform:uppercase;color:var(--ink-muted);margin:3px 0;font-weight:700;' }, 'Team Members'));
        filteredPeople.forEach(function (u) {
          var val = 'user:' + u.id;
          var isChecked = chosen.indexOf(val) > -1;
          var chk = h('input', {
            type: 'checkbox',
            value: val,
            checked: isChecked,
            onChange: function (e) {
              var at = chosen.indexOf(val);
              if (e.target.checked && at === -1) chosen.push(val);
              if (!e.target.checked && at > -1) chosen.splice(at, 1);
              render();
              if (onChange) onChange(getAssignees());
            }
          });

          var line = h('label', { class: 'assignee-item-line' }, [
            chk,
            mark(u.id),
            h('span', { style: 'font-weight:500;' }, u.name),
            u.title ? h('span', { class: 'chip custom', style: 'margin-left:auto;font-size:10.5px;' }, u.title) : null
          ].filter(Boolean));
          listWrap.appendChild(line);
        });
      }

      if (filteredGroups.length) {
        listWrap.appendChild(h('div', { style: 'font-size:11px;text-transform:uppercase;color:var(--ink-muted);margin:8px 0 3px 0;font-weight:700;' }, 'Cross-Dept Groups'));
        filteredGroups.forEach(function (g) {
          var val = 'group:' + g.id;
          var isChecked = chosen.indexOf(val) > -1;
          var chk = h('input', {
            type: 'checkbox',
            value: val,
            checked: isChecked,
            onChange: function (e) {
              var at = chosen.indexOf(val);
              if (e.target.checked && at === -1) chosen.push(val);
              if (!e.target.checked && at > -1) chosen.splice(at, 1);
              render();
              if (onChange) onChange(getAssignees());
            }
          });

          var line = h('label', { class: 'assignee-item-line' }, [
            chk,
            h('span', { class: 'chip group' }, 'Group'),
            h('span', { style: 'font-weight:500;' }, g.name),
            h('span', { class: 'chip count', style: 'margin-left:auto;' }, (g.members || []).length + ' members')
          ]);
          listWrap.appendChild(line);
        });
      }
    }

    function render() {
      renderChips();
      renderList();
    }

    searchInput.addEventListener('input', renderList);

    root.appendChild(chipsWrap);
    root.appendChild(searchInput);
    root.appendChild(listWrap);

    render();

    function getAssignees() {
      return chosen.map(function (v) { return v.split(':')[1]; });
    }

    function getAssigneeTypes() {
      return chosen.map(function (v) { return v.split(':')[0]; });
    }

    function getPrimaryAssignee() {
      return chosen.length ? chosen[0].split(':')[1] : (currentUser ? currentUser.id : null);
    }

    function getPrimaryType() {
      return chosen.length ? chosen[0].split(':')[0] : 'user';
    }

    return {
      node: root,
      getAssignees: getAssignees,
      getAssigneeTypes: getAssigneeTypes,
      getPrimaryAssignee: getPrimaryAssignee,
      getPrimaryType: getPrimaryType,
      getChosenValues: function () { return chosen.slice(); },
      setChosenValues: function (arr) { chosen = (arr || []).slice(); render(); }
    };
  }

  /* ---- photo uploader component ----------------------------------------- */
  function photoUploader(currentAvatar, defaultName, onChange) {
    var avatarVal = currentAvatar || '';
    var preview = h('div', { class: 'photo-uploader-preview' });
    var urlInput;

    function renderPreview() {
      clear(preview);
      if (avatarVal) {
        var img = h('img', { src: avatarVal, alt: defaultName || 'Avatar' });
        img.onerror = function () {
          clear(preview);
          preview.textContent = initials(defaultName || 'User');
        };
        preview.appendChild(img);
      } else {
        preview.textContent = initials(defaultName || 'User');
      }
    }
    renderPreview();

    var fileInput = h('input', {
      type: 'file',
      accept: 'image/png, image/jpeg, image/webp, image/gif',
      style: 'display:none;',
      onChange: function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          toast('Image must be under 5MB.', true);
          return;
        }
        var reader = new FileReader();
        reader.onload = function (evt) {
          var img = new Image();
          img.onload = function () {
            var maxDim = 256;
            var w = img.width;
            var hDim = img.height;
            if (w > maxDim || hDim > maxDim) {
              if (w > hDim) {
                hDim = Math.round((hDim * maxDim) / w);
                w = maxDim;
              } else {
                w = Math.round((w * maxDim) / hDim);
                hDim = maxDim;
              }
            }
            var canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = hDim;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, hDim);
            avatarVal = canvas.toDataURL('image/jpeg', 0.88);
            if (urlInput) urlInput.value = '';
            renderPreview();
            if (onChange) onChange(avatarVal);
          };
          img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
      }
    });

    var chooseBtn = h('button', {
      class: 'btn small primary',
      type: 'button',
      onClick: function () { fileInput.click(); }
    }, [OC.icon('plus'), 'Upload photo']);

    var removeBtn = h('button', {
      class: 'btn small',
      type: 'button',
      onClick: function () {
        avatarVal = '';
        if (urlInput) urlInput.value = '';
        if (fileInput) fileInput.value = '';
        renderPreview();
        if (onChange) onChange('');
      }
    }, 'Remove photo');

    urlInput = h('input', {
      type: 'url',
      placeholder: 'Or paste image/Gravatar URL...',
      value: (avatarVal && avatarVal.indexOf('data:') !== 0) ? avatarVal : '',
      style: 'font-size:12px;width:100%;margin-top:4px;',
      onInput: function (e) {
        var v = e.target.value.trim();
        avatarVal = v;
        renderPreview();
        if (onChange) onChange(avatarVal);
      },
      onChange: function (e) {
        var v = e.target.value.trim();
        avatarVal = v;
        renderPreview();
        if (onChange) onChange(avatarVal);
      }
    });

    var node = h('div', { class: 'photo-uploader' }, [
      preview,
      fileInput,
      h('div', { class: 'photo-uploader-controls' }, [
        h('div', { class: 'photo-uploader-actions' }, [chooseBtn, removeBtn]),
        urlInput,
        h('span', { class: 'muted', style: 'font-size:11px;' }, 'JPG, PNG, WebP or direct image link. Auto-optimized.')
      ])
    ]);

    return {
      node: node,
      getValue: function () { return avatarVal; },
      setValue: function (val) {
        avatarVal = val || '';
        if (urlInput) urlInput.value = (avatarVal && avatarVal.indexOf('data:') !== 0) ? avatarVal : '';
        renderPreview();
      }
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
    clientChip: clientChip, clientLabel: clientLabel, deptChip: deptChip, tagChip: tagChip, stateChip: stateChip,
    personName: personName, assigneeName: assigneeName,
    initials: initials, mark: mark, person: person, photoUploader: photoUploader,
    STATE_LABEL: STATE_LABEL,
    field: field, select: select, clientPicker: clientPicker, newClientModal: newClientModal,
    assigneePicker: assigneePicker, deptPicker: deptPicker,
    tagPicker: tagPicker, reactionsBar: reactionsBar, commentThread: commentThread,
    modal: modal, confirm: confirm, toast: toast, debounce: debounce
  };
})();
