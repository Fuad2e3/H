/* =========================================================================
   groups.js — cross-department groups (4.2, 6.5)
   A group is separate from the department tree: its own member list, its own
   assignable identity, group discussions, chat messages with edit/delete,
   reactions, and member management.
   Creation is gated on the working default recorded in section 13: system
   admin plus department heads.
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.groups = (function () {
  'use strict';

  var searchQuery = '';
  var filterStatus = 'all'; /* all | active | archived | mine */

  var EMOJIS = ['👍', '❤️', '🔥', '👏', '🎉', '🚀', '👀', '✅'];

  function me() { return OC.store.user(OC.store.session()); }

  function newGroup(onDone) {
    var h = OC.ui.h;
    var user = me();
    var name = h('input', { type: 'text', placeholder: 'for example: Chaim Site Relaunch' });
    var purpose = h('textarea', { placeholder: 'what this group exists to do, and until when' });
    var boxes = OC.store.state.users.map(function (u) {
      var box = h('input', { type: 'checkbox', value: u.id, checked: u.id === user.id });
      return {
        id: u.id, box: box,
        node: h('label', { class: 'checkline' }, [
          box, u.name,
          h('span', { class: 'chip role' }, OC.can.roleLabel(u))
        ])
      };
    });

    OC.ui.modal({
      title: 'New group',
      content: h('div', {}, [
        OC.ui.field('Name', name, { required: true }),
        OC.ui.field('Purpose', purpose, { required: true }),
        OC.ui.field('Members', h('div', { style: 'max-height:180px;overflow-y:auto;padding-right:4px;' }, boxes.map(function (b) { return b.node; })), {
          hint: 'Anyone, from any department. That is the point of a group (4.2).'
        })
      ]),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Create group', primary: true, onClick: function (close) {
            if (!name.value.trim()) return 'Give the group a name.';
            if (!purpose.value.trim()) return 'Say what the group is for.';
            var members = boxes.filter(function (b) { return b.box.checked; }).map(function (b) { return b.id; });
            if (members.length < 2) return 'A group needs at least two people.';

            var group = {
              id: OC.store.uid('g'), name: name.value.trim(), purpose: purpose.value.trim(),
              members: members, created_by: user.id, status: 'active',
              messages: [], created_at: new Date().toISOString()
            };
            OC.store.mutate({ actor: user.id, action: 'group.create', target: group.name, detail: members.length + ' members' }, function () {
              OC.store.state.groups.push(group);
            });
            OC.store.notify(members.filter(function (id) { return id !== user.id; }),
              user.name + ' added you to the group ' + group.name, group.id);
            OC.ui.toast('Group created.');
            if (onDone) onDone();
            close();
          }
        }
      ]
    });
  }

  function editGroup(group, onDone) {
    var h = OC.ui.h;
    var user = me();
    var name = h('input', { type: 'text', value: group.name });
    var purpose = h('textarea', {}, group.purpose || '');
    var statusSelect = OC.ui.select([
      { value: 'active', label: 'Active' },
      { value: 'archived', label: 'Archived' }
    ], group.status || 'active');

    var boxes = OC.store.state.users.map(function (u) {
      var isMember = (group.members || []).indexOf(u.id) > -1;
      var box = h('input', { type: 'checkbox', value: u.id, checked: isMember });
      return {
        id: u.id, box: box,
        node: h('label', { class: 'checkline' }, [
          box, u.name,
          h('span', { class: 'chip role' }, OC.can.roleLabel(u))
        ])
      };
    });

    var actions = [
      { label: 'Cancel', onClick: function (close) { close(); } },
      {
        label: 'Save changes', primary: true, onClick: function (close) {
          var newName = name.value.trim();
          var newPurpose = purpose.value.trim();
          if (!newName) return 'Give the group a name.';
          if (!newPurpose) return 'Say what the group is for.';
          var members = boxes.filter(function (b) { return b.box.checked; }).map(function (b) { return b.id; });
          if (members.length < 2) return 'A group needs at least two people.';

          var oldMembers = (group.members || []).slice();
          var newlyAdded = members.filter(function (id) { return oldMembers.indexOf(id) === -1; });

          OC.store.mutate({
            actor: user.id, action: 'group.edit', target: newName,
            detail: 'Updated group details'
          }, function () {
            group.name = newName;
            group.purpose = newPurpose;
            group.status = statusSelect.value;
            group.members = members;
          });

          if (newlyAdded.length) {
            OC.store.notify(newlyAdded.filter(function (id) { return id !== user.id; }),
              user.name + ' added you to group ' + group.name, group.id);
          }

          OC.ui.toast('Group updated.');
          if (onDone) onDone();
          close();
        }
      }
    ];

    if (OC.can.canDeleteGroup(user, group)) {
      actions.unshift({
        label: 'Delete group',
        onClick: function (close) {
          OC.ui.confirm('Permanently delete group "' + group.name + '"? This will remove all group messages and cannot be undone.', function () {
            OC.store.mutate({
              actor: user.id, action: 'group.delete', target: group.name,
              detail: 'Deleted group'
            }, function () {
              OC.store.deleteGroup(group.id);
            });
            OC.ui.toast('Group deleted.');
            if (onDone) onDone();
            close();
          });
        }
      });
    }

    OC.ui.modal({
      title: 'Edit group: ' + group.name,
      content: h('div', {}, [
        OC.ui.field('Name', name, { required: true }),
        OC.ui.field('Purpose', purpose, { required: true }),
        OC.ui.field('Status', statusSelect, { required: true }),
        OC.ui.field('Members', h('div', { style: 'max-height:180px;overflow-y:auto;padding-right:4px;' }, boxes.map(function (b) { return b.node; })), {
          hint: 'Select or deselect members for this cross-department group.'
        })
      ]),
      actions: actions
    });
  }

  function archive(group, onDone) {
    OC.ui.confirm('Archive "' + group.name + '"? Groups are archived, never deleted, so their history stays for reporting (6.5).', function () {
      OC.store.mutate({ actor: OC.store.session(), action: 'group.archive', target: group.name }, function () {
        group.status = 'archived';
      });
      OC.ui.toast('Group archived.');
      if (onDone) onDone();
    });
  }

  function deleteGroupDirect(group, onDone) {
    OC.ui.confirm('Permanently delete group "' + group.name + '" and all its discussions? This cannot be undone.', function () {
      OC.store.mutate({ actor: OC.store.session(), action: 'group.delete', target: group.name }, function () {
        OC.store.deleteGroup(group.id);
      });
      OC.ui.toast('Group permanently deleted.');
      if (onDone) onDone();
    });
  }

  /* ---- group chat / discussions workspace -------------------------------- */
  function openGroupChat(group, onDone) {
    var h = OC.ui.h;
    var user = me();
    var groupId = group.id;

    if (!OC.can.seeGroup(user, group)) {
      OC.ui.toast('Access restricted: Only assigned group members can view this group.', true);
      return;
    }

    var chatHost = h('div', { class: 'group-chat-container' });
    var msgInput = h('input', { type: 'text', placeholder: 'Write a message in ' + group.name + '...', 'aria-label': 'Group message' });

    function renderMessages() {
      OC.ui.clear(chatHost);

      var currentGroup = OC.store.group(groupId) || group;
      currentGroup.messages = currentGroup.messages || [];

      var memberChips = (currentGroup.members || []).map(function (id) {
        var u = OC.store.user(id);
        return h('span', { class: 'chip custom person' }, [
          OC.ui.mark(id),
          u ? u.name : id
        ]);
      });

      var headerBox = h('div', { class: 'group-chat-header' }, [
        h('div', { class: 'row', style: 'justify-content:space-between;align-items:center;' }, [
          h('span', { style: 'font-weight:700;font-size:14px;color:var(--ink);' }, currentGroup.name),
          h('div', { class: 'row', style: 'gap:6px;align-items:center;' }, [
            h('span', { class: 'chip ' + (currentGroup.status === 'active' ? 'group' : 'custom') }, currentGroup.status),
            h('span', { class: 'chip count' }, (currentGroup.members || []).length + ' members')
          ])
        ]),
        h('p', { class: 'muted', style: 'font-size:12.5px;margin:0;' }, currentGroup.purpose),
        h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;margin-top:4px;' }, memberChips)
      ]);

      var msgsList = h('div', { class: 'group-chat-messages' });

      if (!currentGroup.messages.length) {
        msgsList.appendChild(h('div', { class: 'empty', style: 'padding:24px;text-align:center;' }, [
          OC.icon('board'),
          h('p', { style: 'margin-top:6px;' }, 'No discussions yet. Send the first message below!')
        ]));
      } else {
        currentGroup.messages.forEach(function (m) {
          var canEdit = OC.can.canEditGroupMessage(user, m, currentGroup);
          var canDel = OC.can.canDeleteGroupMessage(user, m, currentGroup);

          // Build reaction bar for this message
          var msgReactionsWrap = h('div', { class: 'reactions-bar', style: 'margin-top:4px;' });
          var rxKeys = Object.keys(m.reactions || {});
          var pickerPop = null;

          function toggleMsgReact(emoji) {
            if (!OC.can.canReactGroupMessage(user, currentGroup)) {
              OC.ui.toast('Access restricted: Only assigned group members can react.', true);
              return;
            }
            var list = (m.reactions && m.reactions[emoji]) || [];
            var had = list.indexOf(user.id) > -1;
            OC.store.mutate({
              actor: user.id, action: 'group.react', target: currentGroup.name,
              detail: emoji + ' on message by ' + OC.ui.personName(m.author)
            }, function () {
              OC.store.reactGroupMessage(currentGroup.id, m.id, emoji, user.id);
            });

            // Notify message author if reacting (not self)
            if (!had && m.author && m.author !== user.id) {
              OC.store.notify([m.author], user.name + ' reacted ' + emoji + ' in ' + currentGroup.name, currentGroup.id);
            }

            renderMessages();
            if (onDone) onDone();
          }

          rxKeys.forEach(function (emoji) {
            var uids = m.reactions[emoji] || [];
            if (!uids.length) return;
            var isReacted = uids.indexOf(user.id) > -1;
            var names = uids.map(function (uid) { var u = OC.store.user(uid); return u ? u.name : uid; }).join(', ');
            var pill = h('button', {
              type: 'button',
              class: 'reaction-pill' + (isReacted ? ' active' : ''),
              title: (names ? names + ' reacted with ' : 'Reacted with ') + emoji,
              onClick: function (e) {
                e.preventDefault();
                e.stopPropagation();
                toggleMsgReact(emoji);
              }
            }, [
              h('span', { class: 'emoji' }, emoji),
              h('span', { class: 'count' }, String(uids.length))
            ]);
            msgReactionsWrap.appendChild(pill);
          });

          var pickerBtn = h('button', {
            type: 'button',
            class: 'reaction-picker-btn',
            title: 'Add reaction',
            onClick: function (e) {
              e.preventDefault();
              e.stopPropagation();
              if (pickerPop) { pickerPop.remove(); pickerPop = null; return; }
              pickerPop = h('div', { class: 'reaction-picker-pop' }, EMOJIS.map(function (em) {
                return h('button', {
                  type: 'button', class: 'reaction-emoji-btn', title: 'React ' + em,
                  onClick: function (ev) {
                    ev.preventDefault(); ev.stopPropagation();
                    toggleMsgReact(em);
                    if (pickerPop) { pickerPop.remove(); pickerPop = null; }
                  }
                }, em);
              }));
              msgReactionsWrap.appendChild(pickerPop);
              var closeDoc = function (ev) {
                if (pickerPop && !pickerPop.contains(ev.target) && ev.target !== pickerBtn) {
                  pickerPop.remove(); pickerPop = null;
                  document.removeEventListener('click', closeDoc);
                }
              };
              setTimeout(function () { document.addEventListener('click', closeDoc); }, 0);
            }
          }, [
            h('span', { class: 'icon-smile' }, '😀'),
            h('span', { class: 'btn-label' }, '+ React')
          ]);
          msgReactionsWrap.appendChild(pickerBtn);

          var msgItem = h('div', { class: 'group-msg-item' }, [
            h('div', { class: 'group-msg-head' }, [
              OC.ui.person(m.author, 'strong'),
              h('span', {}, OC.ui.fmtWhen(m.created_at)),
              m.edited_at ? h('span', { class: 'comment-edited-tag' }, '(edited)') : null,
              (canEdit || canDel) ? h('div', { class: 'comment-tools push' }, [
                canEdit ? h('button', {
                  class: 'btn-inline', type: 'button', title: 'Edit message',
                  onClick: function (e) {
                    e.preventDefault();
                    var editInput = h('textarea', {}, m.text);
                    OC.ui.modal({
                      title: 'Edit group message',
                      content: OC.ui.field('Message', editInput, { required: true }),
                      actions: [
                        { label: 'Cancel', onClick: function (close) { close(); } },
                        {
                          label: 'Save', primary: true, onClick: function (close) {
                            var val = editInput.value.trim();
                            if (!val) return 'Message cannot be empty.';
                            OC.store.mutate({
                              actor: user.id, action: 'group.message.edit', target: currentGroup.name, detail: val.slice(0, 35)
                            }, function () {
                              OC.store.editGroupMessage(currentGroup.id, m.id, val);
                            });
                            OC.ui.toast('Message updated.');
                            renderMessages();
                            if (onDone) onDone();
                            close();
                          }
                        }
                      ]
                    });
                  }
                }, 'Edit') : null,
                canDel ? h('button', {
                  class: 'btn-inline danger', type: 'button', title: 'Delete message',
                  onClick: function (e) {
                    e.preventDefault();
                    OC.ui.confirm('Delete this message from the group?', function () {
                      OC.store.mutate({
                        actor: user.id, action: 'group.message.delete', target: currentGroup.name, detail: 'Deleted message'
                      }, function () {
                        OC.store.deleteGroupMessage(currentGroup.id, m.id);
                      });
                      OC.ui.toast('Message deleted.');
                      renderMessages();
                      if (onDone) onDone();
                    });
                  }
                }, 'Delete') : null
              ].filter(Boolean)) : null
            ]),
            h('div', { class: 'group-msg-text' }, m.text),
            msgReactionsWrap
          ]);

          msgsList.appendChild(msgItem);
        });
      }

      var form = h('div', { class: 'comment-form', style: 'margin-top:10px;' }, [
        msgInput,
        h('button', {
          class: 'btn small primary', type: 'button', onClick: function () {
            if (!OC.can.canPostGroupMessage(user, currentGroup)) {
              OC.ui.toast('Access restricted: Only assigned group members can post messages.', true);
              return;
            }
            var val = msgInput.value.trim();
            if (!val) return;
            OC.store.mutate({
              actor: user.id, action: 'group.message', target: currentGroup.name, detail: val.slice(0, 35)
            }, function () {
              OC.store.addGroupMessage(currentGroup.id, val, user.id);
            });

            // Targeted notification: Send ONLY to other members of this group
            var otherMembers = (currentGroup.members || []).filter(function (id) { return id !== user.id; });
            if (otherMembers.length) {
              OC.store.notify(otherMembers, user.name + ' posted in ' + currentGroup.name + ': "' + val.slice(0, 35) + (val.length > 35 ? '…' : '') + '"', currentGroup.id);
            }

            msgInput.value = '';
            renderMessages();
            if (onDone) onDone();
            setTimeout(function () { msgsList.scrollTop = msgsList.scrollHeight; }, 50);
          }
        }, 'Send')
      ]);

      chatHost.appendChild(headerBox);
      chatHost.appendChild(msgsList);
      chatHost.appendChild(form);
    }

    renderMessages();

    OC.ui.modal({
      title: '💬 ' + group.name + ' — Workspace & Chat',
      content: chatHost,
      actions: [
        { label: 'Close', onClick: function (close) { close(); } }
      ]
    });
  }

  /* ---- render ----------------------------------------------------------- */
  function render(host, rerender, hideHead) {
    var h = OC.ui.h;
    var user = me();
    var canCreate = OC.can.createGroup(user);
    var allGroups = (OC.store.state.groups || []).filter(function (g) {
      return OC.can.seeGroup(user, g);
    });

    // Filter groups
    var visible = allGroups.filter(function (g) {
      if (filterStatus === 'active' && g.status !== 'active') return false;
      if (filterStatus === 'archived' && g.status !== 'archived') return false;
      if (filterStatus === 'mine' && (g.members || []).indexOf(user.id) === -1) return false;
      if (searchQuery) {
        var q = searchQuery.toLowerCase();
        var matchName = (g.name || '').toLowerCase().indexOf(q) > -1;
        var matchPurpose = (g.purpose || '').toLowerCase().indexOf(q) > -1;
        var matchMember = (g.members || []).some(function (mid) {
          var u = OC.store.user(mid);
          return u && u.name.toLowerCase().indexOf(q) > -1;
        });
        if (!matchName && !matchPurpose && !matchMember) return false;
      }
      return true;
    });

    var activeCount = allGroups.filter(function (g) { return g.status === 'active'; }).length;
    var myCount = allGroups.filter(function (g) { return (g.members || []).indexOf(user.id) > -1; }).length;

    var elements = [];
    if (!hideHead) {
      elements.push(
        h('div', { class: 'page-head' }, [
          h('h1', {}, 'Groups & Cross-Department Teams'),
          h('p', {}, 'Groups cut across the department tree for work that needs people from more than one department. ' +
            'Includes team discussions, message editing/deletion, and emoji reactions.')
        ]),
        h('div', { class: 'grid-3', style: 'margin-bottom:var(--s4);' }, [
          h('div', { class: 'stat' }, [
            h('span', { class: 'k' }, 'Total Groups'),
            h('span', { class: 'v' }, String(allGroups.length))
          ]),
          h('div', { class: 'stat' }, [
            h('span', { class: 'k' }, 'Active Groups'),
            h('span', { class: 'v' }, String(activeCount))
          ]),
          h('div', { class: 'stat' }, [
            h('span', { class: 'k' }, 'My Groups'),
            h('span', { class: 'v' }, String(myCount))
          ])
        ])
      );
    }

    elements.push(
      h('div', { class: 'row', style: 'justify-content:space-between;align-items:center;margin-bottom:var(--s4);flex-wrap:wrap;gap:10px;' }, [
        h('div', { class: 'row', style: 'gap:10px;align-items:center;flex:1;min-width:260px;' }, [
          h('input', {
            type: 'search', placeholder: 'Search groups by name, purpose, or member...',
            value: searchQuery,
            style: 'max-width:320px;',
            onInput: OC.ui.debounce(function (e) { searchQuery = e.target.value; render(host, rerender, hideHead); }, 120)
          }),
          h('div', { class: 'segmented', role: 'group', 'aria-label': 'Filter groups' }, [
            ['all', 'All (' + allGroups.length + ')'],
            ['mine', 'My Groups (' + myCount + ')'],
            ['active', 'Active (' + activeCount + ')'],
            ['archived', 'Archived (' + (allGroups.length - activeCount) + ')']
          ].map(function (opt) {
            return h('button', {
              type: 'button',
              'aria-pressed': String(filterStatus === opt[0]),
              onClick: function () { filterStatus = opt[0]; render(host, rerender, hideHead); }
            }, opt[1]);
          }))
        ]),
        (canCreate && !hideHead)
          ? h('button', { class: 'btn primary', type: 'button', onClick: function () { newGroup(function () { render(host, rerender, hideHead); }); } },
              [OC.icon('plus'), 'New group'])
          : null
      ]),

      h('div', { class: 'grid-2' }, visible.length ? visible.map(function (g) {
        var isMember = (g.members || []).indexOf(user.id) > -1;
        var canEdit = OC.can.canEditGroup(user, g);
        var canDel = OC.can.canDeleteGroup(user, g);
        var msgCount = (g.messages || []).length;

        return h('div', {
          class: 'card',
          style: 'display:flex;flex-direction:column;gap:8px;cursor:default;'
        }, [
          h('div', { class: 'row', style: 'align-items:center;justify-content:space-between;' }, [
            h('h3', { style: 'font-size:16px;font-weight:700;color:var(--ink);' }, g.name),
            h('div', { class: 'row', style: 'gap:6px;align-items:center;' }, [
              h('span', { class: 'chip ' + (g.status === 'active' ? 'group' : 'custom') }, g.status),
              isMember ? h('span', { class: 'chip client' }, 'Joined') : null
            ])
          ]),

          h('p', { class: 'muted', style: 'font-size:13.5px;margin:2px 0 6px;line-height:1.45;' }, g.purpose),

          h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;align-items:center;' }, (g.members || []).map(function (id) {
            var u = OC.store.user(id);
            return h('span', { class: 'chip custom person', title: OC.can.roleLabel(u) }, [
              OC.ui.mark(id),
              u ? u.name : id
            ]);
          })),

          h('div', { class: 'row muted mono', style: 'font-size:11px;margin-top:6px;align-items:center;justify-content:space-between;' }, [
            h('span', {}, 'Created by ' + OC.ui.personName(g.created_by) + ' · ' + OC.ui.fmtDate(g.created_at)),
            h('span', { class: 'group-card-badge' }, [
              '💬 ' + msgCount + (msgCount === 1 ? ' message' : ' messages')
            ])
          ]),

          h('div', { class: 'actions', style: 'margin-top:8px;padding-top:8px;border-top:1px dashed var(--rule);gap:8px;' }, [
            h('button', {
              class: 'btn small primary', type: 'button',
              title: 'Open Group Chat & Discussions',
              onClick: function () { openGroupChat(g, function () { render(host, rerender, hideHead); }); }
            }, ['💬 Chat (' + msgCount + ')']),

            canEdit ? h('button', {
              class: 'btn small', type: 'button',
              title: 'Edit Group info and members',
              onClick: function () { editGroup(g, function () { render(host, rerender, hideHead); }); }
            }, 'Edit') : null,

            (g.status === 'active' && canEdit) ? h('button', {
              class: 'btn small', type: 'button',
              title: 'Archive Group',
              onClick: function () { archive(g, function () { render(host, rerender, hideHead); }); }
            }, 'Archive') : null,

            canDel ? h('button', {
              class: 'btn small danger', type: 'button',
              title: 'Permanently delete group',
              onClick: function () { deleteGroupDirect(g, function () { render(host, rerender, hideHead); }); }
            }, 'Delete') : null
          ].filter(Boolean))
        ]);
      }) : [
        h('div', { class: 'empty', style: 'grid-column:1/-1;padding:40px;text-align:center;' }, [
          OC.icon('board'),
          h('h3', { style: 'margin-top:10px;' }, 'No groups match your filter.'),
          h('p', { class: 'muted', style: 'font-size:13px;margin-top:4px;' }, 'Try adjusting your search keywords or filter status.')
        ])
      ])
    );

    OC.ui.clear(host);
    OC.ui.append(host, elements);
  }

  return {
    render: render,
    newGroup: newGroup,
    editGroup: editGroup,
    openGroupChat: openGroupChat
  };
})();
