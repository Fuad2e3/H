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
    var msgInput = h('input', { type: 'text', placeholder: 'Write a message in ' + group.name + ' or type @ to mention...', 'aria-label': 'Group message' });
    var replyingBadgeWrap = h('div', { style: 'display:none;' });
    var activeReplyTarget = null;

    var mediaPreviewWrap = h('div', { style: 'display:none;' });
    var currentMediaAttachment = null;

    function setReplyContext(targetAuthor, targetMsg) {
      activeReplyTarget = (targetAuthor && targetMsg) ? {
        id: targetMsg.id,
        author_id: targetAuthor.id || targetMsg.author,
        author_name: targetAuthor.name || targetMsg.author,
        text: (targetMsg.text || (targetMsg.poll ? '📊 Poll: ' + targetMsg.poll.question : 'Media attachment')).slice(0, 75)
      } : null;

      OC.ui.clear(replyingBadgeWrap);
      if (activeReplyTarget) {
        replyingBadgeWrap.style.display = 'block';
        replyingBadgeWrap.appendChild(h('div', { class: 'reply-draft-banner' }, [
          h('div', { class: 'reply-draft-info' }, [
            h('span', { class: 'reply-draft-header' }, [
              h('span', {}, '↳ Replying to ' + activeReplyTarget.author_name)
            ]),
            h('span', { class: 'reply-draft-snippet' }, '"' + activeReplyTarget.text + '"')
          ]),
          h('button', {
            type: 'button',
            class: 'replying-cancel-btn',
            title: 'Cancel reply',
            onClick: function (e) {
              e.preventDefault();
              setReplyContext(null, null);
            }
          }, '✕')
        ]));
      } else {
        replyingBadgeWrap.style.display = 'none';
      }
      msgInput.focus();
    }

    function setMediaAttachment(media) {
      currentMediaAttachment = media;
      OC.ui.clear(mediaPreviewWrap);
      if (media) {
        mediaPreviewWrap.style.display = 'block';
        var thumb = media.type === 'image'
          ? h('img', { class: 'chat-media-preview-thumb', src: media.url, alt: media.name })
          : h('div', { class: 'chat-media-preview-thumb', style: 'display:flex;align-items:center;justify-content:center;background:#000;color:#fff;font-size:16px;' }, '🎬');

        mediaPreviewWrap.appendChild(h('div', { class: 'chat-media-preview-bar' }, [
          thumb,
          h('div', { class: 'chat-media-preview-info' }, [
            h('span', { class: 'chat-media-preview-name' }, media.name),
            h('span', { class: 'chat-media-preview-size' }, (media.type === 'image' ? '🖼️ Optimized Image · ' : '🎬 Video · ') + media.size)
          ]),
          h('button', {
            type: 'button',
            class: 'replying-cancel-btn',
            title: 'Remove attachment',
            onClick: function (e) {
              e.preventDefault();
              setMediaAttachment(null);
            }
          }, '✕')
        ]));
      } else {
        mediaPreviewWrap.style.display = 'none';
      }
    }

    function optimizeAndAttachImage(file) {
      if (file.size > 15 * 1024 * 1024) {
        OC.ui.toast('Image must be under 15MB.', true);
        return;
      }
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement('canvas');
          var maxDim = 1200;
          var w = img.width;
          var h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);
          var compressed = canvas.toDataURL('image/webp', 0.82);
          if (!compressed || compressed.indexOf('data:image/webp') !== 0) {
            compressed = canvas.toDataURL('image/jpeg', 0.82);
          }
          var approxKb = Math.round(((compressed.length * 0.75) / 1024) * 10) / 10;
          setMediaAttachment({
            type: 'image',
            url: compressed,
            name: file.name,
            size: approxKb + ' KB'
          });
          OC.ui.toast('Image optimized & attached 🖼️');
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    function optimizeAndAttachVideo(file) {
      if (file.size > 25 * 1024 * 1024) {
        OC.ui.toast('Video must be under 25MB.', true);
        return;
      }
      var reader = new FileReader();
      reader.onload = function (e) {
        var approxMb = Math.round((file.size / (1024 * 1024)) * 10) / 10;
        setMediaAttachment({
          type: 'video',
          url: e.target.result,
          name: file.name,
          size: approxMb + ' MB'
        });
        OC.ui.toast('Video attached 🎬');
      };
      reader.readAsDataURL(file);
    }

    var mediaFileInput = h('input', {
      type: 'file',
      accept: 'image/*, video/mp4, video/webm, video/ogg',
      style: 'display:none;',
      onChange: function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        if (file.type.indexOf('image/') === 0) {
          optimizeAndAttachImage(file);
        } else if (file.type.indexOf('video/') === 0) {
          optimizeAndAttachVideo(file);
        } else {
          OC.ui.toast('Supported formats: Images and Videos (MP4/WebM).', true);
        }
        mediaFileInput.value = '';
      }
    });

    function openCreatePollModal() {
      var currentGroup = OC.store.group(groupId) || group;
      if (!OC.can.canPostGroupMessage(user, currentGroup)) {
        OC.ui.toast('Access restricted: Only assigned group members can create polls.', true);
        return;
      }

      var questionInput = h('input', { type: 'text', placeholder: 'Ask a question or topic...', required: true });
      var multiCheckbox = h('input', { type: 'checkbox' });
      var optionsContainer = h('div', { class: 'group-msg-poll-options', style: 'margin:8px 0;' });
      var optionInputs = [];

      function addOptionRow(val) {
        if (optionInputs.length >= 8) {
          OC.ui.toast('Maximum 8 poll options allowed.', true);
          return;
        }
        var optInput = h('input', { type: 'text', placeholder: 'Option ' + (optionInputs.length + 1), value: val || '' });
        var row = h('div', { class: 'poll-option-input-row' }, [
          optInput,
          optionInputs.length >= 2 ? h('button', {
            type: 'button',
            class: 'btn-inline danger',
            title: 'Remove option',
            onClick: function () {
              var idx = optionInputs.indexOf(optInput);
              if (idx > -1) {
                optionInputs.splice(idx, 1);
                row.remove();
              }
            }
          }, '✕') : null
        ]);
        optionInputs.push(optInput);
        optionsContainer.appendChild(row);
      }

      addOptionRow('');
      addOptionRow('');

      var addOptBtn = h('button', {
        type: 'button',
        class: 'btn small',
        style: 'align-self:flex-start;',
        onClick: function () { addOptionRow(''); }
      }, '+ Add option');

      var modalContent = h('div', { class: 'form-body' }, [
        OC.ui.field('Poll Question', questionInput, { required: true }),
        h('div', { style: 'margin-top:10px;' }, [
          h('label', { style: 'font-size:12px;font-weight:600;' }, 'Options (at least 2):'),
          optionsContainer,
          addOptBtn
        ]),
        h('div', { class: 'field checkbox', style: 'margin-top:12px;display:flex;align-items:center;gap:8px;' }, [
          multiCheckbox,
          h('span', { style: 'font-size:12.5px;' }, 'Allow members to select multiple options')
        ])
      ]);

      OC.ui.modal({
        title: '📊 Create Group Poll',
        content: modalContent,
        actions: [
          { label: 'Cancel', onClick: function (close) { close(); } },
          {
            label: 'Create Poll',
            primary: true,
            onClick: function (close) {
              var qVal = questionInput.value.trim();
              if (!qVal) return 'Poll question is required.';
              var opts = optionInputs.map(function (inp) { return inp.value.trim(); }).filter(Boolean);
              if (opts.length < 2) return 'Please provide at least 2 non-empty options.';

              var pollData = {
                id: 'poll-' + Date.now(),
                question: qVal,
                multi: multiCheckbox.checked,
                options: opts.map(function (optText, i) {
                  return { id: 'opt-' + (i + 1), text: optText, voters: [] };
                }),
                created_by: user.id,
                created_at: new Date().toISOString()
              };

              OC.store.mutate({
                actor: user.id, action: 'group.poll.create', target: currentGroup.name, detail: qVal.slice(0, 35)
              }, function () {
                OC.store.addGroupMessage(currentGroup.id, '📊 Poll: ' + qVal, user.id, { poll: pollData });
              });

              // Notify group members
              var targets = (currentGroup.members || []).filter(function (id) { return id !== user.id; });
              if (targets.length) {
                OC.store.notify(targets, user.name + ' started a new poll in ' + currentGroup.name + ': "' + qVal.slice(0, 35) + '"', currentGroup.id);
              }

              OC.ui.toast('Poll created successfully! 📊');
              renderMessages();
              if (onDone) onDone();
              close();
            }
          }
        ]
      });
    }

    var groupMemberUsers = (group.members || []).map(OC.store.user).filter(Boolean);
    var mentionHelper = OC.ui.attachMentionAutocomplete
      ? OC.ui.attachMentionAutocomplete(msgInput, groupMemberUsers.length ? groupMemberUsers : null, function (u) {})
      : null;

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
          h('p', { style: 'margin-top:6px;' }, 'No discussions yet. Send the first message or create a poll below!')
        ]));
      } else {
        currentGroup.messages.forEach(function (m) {
          var canEdit = OC.can.canEditGroupMessage(user, m, currentGroup);
          var canDel = OC.can.canDeleteGroupMessage(user, m, currentGroup);
          var msgAuthorUser = OC.store.user(m.author);

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
              actor: user.id, action: 'group.message.react', target: currentGroup.name, detail: emoji
            }, function () {
              OC.store.reactGroupMessage(currentGroup.id, m.id, emoji, user.id);
            });

            if (!had && m.author !== user.id) {
              OC.store.notify([m.author], user.name + ' reacted ' + emoji + ' to your message in ' + currentGroup.name, currentGroup.id);
            }

            renderMessages();
            if (onDone) onDone();
          }

          rxKeys.forEach(function (emoji) {
            var users = m.reactions[emoji] || [];
            if (!users.length) return;
            var active = users.indexOf(user.id) > -1;
            var names = users.map(OC.ui.personName).join(', ');
            var btn = h('button', {
              class: 'reaction-btn' + (active ? ' active' : ''),
              type: 'button',
              title: names,
              onClick: function (e) {
                e.preventDefault();
                toggleMsgReact(emoji);
              }
            }, [
              h('span', { class: 'emoji' }, emoji),
              h('span', { class: 'count' }, String(users.length))
            ]);
            msgReactionsWrap.appendChild(btn);
          });

          var pickerBtn = h('button', {
            class: 'btn small add-react-btn',
            type: 'button',
            title: 'Add reaction',
            onClick: function (e) {
              e.preventDefault();
              e.stopPropagation();
              if (pickerPop) { pickerPop.remove(); pickerPop = null; return; }

              pickerPop = h('div', { class: 'reaction-picker-popover', style: 'top:-38px;' }, EMOJIS.map(function (em) {
                return h('button', {
                  type: 'button',
                  class: 'emoji-opt',
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

          // Render attached media if present
          var mediaNode = null;
          if (m.media) {
            if (m.media.type === 'image') {
              mediaNode = h('div', {
                class: 'group-msg-media-img',
                title: 'Click to view full image',
                onClick: function (e) {
                  e.preventDefault();
                  OC.ui.modal({
                    title: '🖼️ ' + (m.media.name || 'Image Preview'),
                    content: h('div', { style: 'text-align:center;' }, [
                      h('img', { src: m.media.url, alt: m.media.name, style: 'max-width:100%;max-height:75vh;border-radius:6px;' })
                    ]),
                    actions: [{ label: 'Close', onClick: function (close) { close(); } }]
                  });
                }
              }, [
                h('img', { src: m.media.url, alt: m.media.name || 'Image' })
              ]);
            } else if (m.media.type === 'video') {
              mediaNode = h('div', { class: 'group-msg-media-video' }, [
                h('video', { src: m.media.url, controls: true, preload: 'metadata' })
              ]);
            }
          }

          // Render interactive poll if present
          var pollNode = null;
          if (m.poll && Array.isArray(m.poll.options)) {
            var totalPollVotes = 0;
            m.poll.options.forEach(function (opt) {
              totalPollVotes += (opt.voters || []).length;
            });

            var optionNodes = m.poll.options.map(function (opt) {
              var voters = opt.voters || [];
              var voteCount = voters.length;
              var hasVoted = voters.indexOf(user.id) > -1;
              var pct = totalPollVotes > 0 ? Math.round((voteCount / totalPollVotes) * 100) : 0;

              var voterNames = voters.map(OC.ui.personName).join(', ');

              return h('div', {
                class: 'group-msg-poll-opt' + (hasVoted ? ' voted' : ''),
                title: voterNames ? 'Voted by: ' + voterNames : 'No votes yet',
                onClick: function (e) {
                  e.preventDefault();
                  if (!OC.can.canPostGroupMessage(user, currentGroup)) {
                    OC.ui.toast('Access restricted: Only assigned group members can vote.', true);
                    return;
                  }
                  OC.store.mutate({
                    actor: user.id, action: 'group.poll.vote', target: currentGroup.name, detail: opt.text
                  }, function () {
                    OC.store.voteGroupPoll(currentGroup.id, m.id, opt.id, user.id);
                  });
                  renderMessages();
                  if (onDone) onDone();
                }
              }, [
                h('div', { class: 'group-msg-poll-opt-bar', style: 'width:' + pct + '%;' }),
                h('div', { class: 'group-msg-poll-opt-content' }, [
                  h('span', { class: 'group-msg-poll-opt-text' }, opt.text),
                  h('span', { class: 'group-msg-poll-opt-stats' }, voteCount + ' vote' + (voteCount === 1 ? '' : 's') + ' (' + pct + '%)' + (voterNames ? ' · ' + voterNames : ''))
                ]),
                h('button', {
                  type: 'button',
                  class: 'btn small ' + (hasVoted ? 'primary' : 'outline') + ' group-msg-poll-opt-btn'
                }, hasVoted ? '✓ Voted' : 'Vote')
              ]);
            });

            pollNode = h('div', { class: 'group-msg-poll' }, [
              h('div', { class: 'group-msg-poll-head' }, [
                h('span', { class: 'group-msg-poll-title' }, [
                  h('span', {}, '📊'),
                  h('span', {}, m.poll.question)
                ]),
                h('span', { class: 'chip count' }, totalPollVotes + ' vote' + (totalPollVotes === 1 ? '' : 's') + (m.poll.multi ? ' · Multi-choice' : ''))
              ]),
              h('div', { class: 'group-msg-poll-options' }, optionNodes)
            ]);
          }

          var replyQuoteNode = null;
          if (m.reply_to) {
            var replyAuthor = m.reply_to.author_name || (OC.store.user(m.reply_to.author_id) ? OC.store.user(m.reply_to.author_id).name : m.reply_to.author_id);
            replyQuoteNode = h('div', {
              class: 'msg-reply-quote',
              title: 'Replying to ' + replyAuthor,
              onClick: function () {
                var origEl = document.getElementById('gmsg-' + m.reply_to.id);
                if (origEl) {
                  origEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  origEl.style.transition = 'box-shadow 0.3s ease';
                  origEl.style.boxShadow = '0 0 0 2px #2563eb';
                  setTimeout(function () { origEl.style.boxShadow = ''; }, 1400);
                }
              }
            }, [
              h('span', { class: 'msg-reply-quote-author' }, [
                h('span', {}, '↳'),
                h('span', {}, replyAuthor || 'Someone')
              ]),
              h('span', { class: 'msg-reply-quote-snippet' }, m.reply_to.text || m.reply_to.body || 'Original message')
            ]);
          }

          var msgItem = h('div', { class: 'group-msg-item', id: 'gmsg-' + m.id }, [
            h('div', { class: 'group-msg-head' }, [
              OC.ui.person(m.author, 'strong'),
              h('span', {}, OC.ui.fmtWhen(m.created_at)),
              m.edited_at ? h('span', { class: 'comment-edited-tag' }, '(edited)') : null,
              h('div', { class: 'comment-tools push' }, [
                h('button', {
                  class: 'btn-inline',
                  type: 'button',
                  title: 'Reply to this message',
                  onClick: function (e) {
                    e.preventDefault();
                    setReplyContext(msgAuthorUser || { id: m.author, name: m.author }, m);
                  }
                }, 'Reply'),
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
              ].filter(Boolean))
            ]),
            replyQuoteNode,
            h('div', { class: 'group-msg-text' }, OC.ui.formatMentions ? OC.ui.formatMentions(m.text) : m.text),
            mediaNode,
            pollNode,
            msgReactionsWrap
          ]);

          msgsList.appendChild(msgItem);
        });
      }

      function submitGroupMessage() {
        if (!OC.can.canPostGroupMessage(user, currentGroup)) {
          OC.ui.toast('Access restricted: Only assigned group members can post messages.', true);
          return;
        }
        var val = msgInput.value.trim();
        if (!val && !currentMediaAttachment) return;
        
        var messageText = val || (currentMediaAttachment.type === 'image' ? '🖼️ Photo attached' : '🎬 Video attached');
        var extra = {};
        if (currentMediaAttachment) {
          extra.media = currentMediaAttachment;
        }
        if (activeReplyTarget) {
          extra.reply_to = activeReplyTarget;
        }

        OC.store.mutate({
          actor: user.id, action: 'group.message', target: currentGroup.name, detail: messageText.slice(0, 35)
        }, function () {
          OC.store.addGroupMessage(currentGroup.id, messageText, user.id, extra);
        });

        // Targeted notification: Send to group members & replied author & mentioned users
        var targets = (currentGroup.members || []).filter(function (id) { return id !== user.id; });
        if (activeReplyTarget && activeReplyTarget.author_id && activeReplyTarget.author_id !== user.id) {
          if (targets.indexOf(activeReplyTarget.author_id) === -1) targets.push(activeReplyTarget.author_id);
        }
        if (OC.ui.extractMentionedUserIds) {
          var mentioned = OC.ui.extractMentionedUserIds(val).filter(function (id) { return id !== user.id; });
          mentioned.forEach(function (mid) {
            if (targets.indexOf(mid) === -1) targets.push(mid);
          });
        }

        if (targets.length) {
          OC.store.notify(targets, user.name + ' in ' + currentGroup.name + ': "' + messageText.slice(0, 35) + (messageText.length > 35 ? '…' : '') + '"', currentGroup.id);
        }

        msgInput.value = '';
        setReplyContext(null, null);
        setMediaAttachment(null);
        renderMessages();
        if (onDone) onDone();
        msgsList.scrollTop = msgsList.scrollHeight;
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(function () { msgsList.scrollTop = msgsList.scrollHeight; });
        }
      }

      msgInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          submitGroupMessage();
        }
      });

      var form = h('div', { class: 'comment-form group-chat-input-bar' }, [
        replyingBadgeWrap,
        mediaPreviewWrap,
        mediaFileInput,
        h('div', { class: 'comment-form-row' }, [
          msgInput,
          h('button', {
            class: 'mention-btn-trigger',
            type: 'button',
            title: 'Mention team member (@)',
            onClick: function () {
              if (mentionHelper) mentionHelper.openMentionMenu();
            }
          }, '@'),
          h('button', {
            class: 'mention-btn-trigger',
            type: 'button',
            title: 'Attach optimized Image / Video',
            onClick: function () {
              mediaFileInput.click();
            }
          }, '📷 Media'),
          h('button', {
            class: 'mention-btn-trigger',
            type: 'button',
            title: 'Create an interactive Poll',
            onClick: function () {
              openCreatePollModal();
            }
          }, '📊 Poll'),
          h('button', {
            class: 'btn small primary', type: 'button', onClick: submitGroupMessage
          }, 'Send')
        ])
      ]);

      chatHost.appendChild(headerBox);
      chatHost.appendChild(msgsList);
      chatHost.appendChild(form);
    }

    renderMessages();

    OC.ui.modal({
      title: '💬 ' + group.name + ' — Workspace & Chat',
      className: 'modal-chat',
      bodyClass: 'chat-modal-body',
      content: chatHost,
      actions: []
    });

    var msgsEl = chatHost.querySelector('.group-chat-messages');
    if (msgsEl) {
      msgsEl.scrollTop = msgsEl.scrollHeight;
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function () { msgsEl.scrollTop = msgsEl.scrollHeight; });
      }
    }
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
        canCreate
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
