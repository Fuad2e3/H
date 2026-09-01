/* =========================================================================
   permissions.js — the permission engine
   Implements section 3.0 of the specification. Authority is computed from a
   level's position in its own department's ordered hierarchy list (3.4), not
   from hardcoded role names, so a department can add levels without changing
   this file. Rank 0 is the top of a department; higher numbers are further
   down. Authority never crosses into another department (3.0) — only group
   membership (4.2) cuts across.

   In the specified build these same rules are enforced again in Firestore
   Security Rules (8.1). Here they gate the interface only, which is why the
   spec is explicit that a UI check is not a security boundary.
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.can = (function () {
  'use strict';

  var S = function () { return OC.store; };

  /* ---- position in a department ---------------------------------------- */
  function levelIn(user, deptId) {
    if (!user) return null;
    for (var i = 0; i < user.departments.length; i++) {
      if (user.departments[i].department === deptId) return user.departments[i].level;
    }
    return null;
  }

  function rank(deptId, level) {
    var dept = S().department(deptId);
    if (!dept || !level) return Infinity;
    var i = dept.levels.indexOf(level);
    return i === -1 ? Infinity : i;
  }

  function rankOf(user, deptId) { return rank(deptId, levelIn(user, deptId)); }

  function isHead(user, deptId) { return rankOf(user, deptId) === 0; }
  function isLead(user, deptId) { return rankOf(user, deptId) === 1; }
  function inDept(user, deptId) { return levelIn(user, deptId) !== null; }

  function headOfAny(user) {
    return !!user && user.departments.some(function (m) { return rank(m.department, m.level) === 0; });
  }

  function departmentsOf(user) {
    return user ? user.departments.map(function (m) { return m.department; }) : [];
  }

  function inGroup(user, groupId) {
    var g = S().group(groupId);
    return !!g && g.members.indexOf(user.id) > -1;
  }

  /* ---- descriptive role, for display ----------------------------------- */
  function roleLabel(user) {
    if (!user) return 'Unknown';
    if (user.admin) return 'System Admin';
    if (!user.departments || !user.departments.length) {
      if (user.invite && user.invite.level) {
        var lvl = user.invite.level;
        if (lvl === 'head') return 'Department Head';
        if (lvl === 'lead') return 'Lead';
        if (lvl === 'admin') return 'System Admin';
        return 'Member';
      }
      return 'Member';
    }
    var best = null;
    user.departments.forEach(function (m) {
      var r = rank(m.department, m.level);
      if (!best || r < best.r) best = { r: r, level: m.level };
    });
    if (best.r === 0) return 'Department Head';
    return 'Member';
  }

  /* ---- visibility ------------------------------------------------------ */
  function seeTodo(user, todo) {
    if (!user || !todo) return false;
    if (user.admin) return true;
    if (todo.created_by === user.id) return true;
    if (todo.assignee === user.id || (todo.assignee_type === 'user' && todo.assignee === user.id) || (Array.isArray(todo.assignees) && todo.assignees.indexOf(user.id) > -1)) return true;
    if (inGroup(user, todo.assignee) || (todo.assignee_type === 'group' && inGroup(user, todo.assignee))) return true;
    if (Array.isArray(todo.assignees) && todo.assignees.some(function (aid) {
      if (aid === user.id) return true;
      if (typeof aid === 'string') {
        if (aid.indexOf('user:') === 0 && aid.slice(5) === user.id) return true;
        if (aid.indexOf('group:') === 0 && inGroup(user, aid.slice(6))) return true;
      }
      return inGroup(user, aid);
    })) return true;
    if (todo.department && inDept(user, todo.department)) return true;
    if (Array.isArray(todo.departments) && todo.departments.some(function (d) { return inDept(user, d); })) return true;
    return false;
  }

  function seeInstruction(user, note) {
    if (!user || !note) return false;
    if (user.admin) return true;
    if (note.author === user.id) return true;
    if (note.department && inDept(user, note.department)) return true;
    if (Array.isArray(note.departments) && note.departments.some(function (d) { return inDept(user, d); })) return true;
    return false;
  }

  /* ---- assignment (3.2) ------------------------------------------------- */
  function assignTo(user, targetId) {
    if (!user) return false;
    if (user.admin) return true;
    var target = S().user(targetId);
    if (!target) return false;
    if (targetId === user.id) return true;           /* anyone may take work themselves */
    return user.departments.some(function (m) {
      var mine = rank(m.department, m.level);
      var theirs = rankOf(target, m.department);
      if (theirs === Infinity) return false;          /* not in this department */
      if (mine === 0) return true;                    /* head: anyone in department */
      return false;                                   /* members cannot assign to others */
    });
  }

  function assignableUsers(user) {
    return S().state.users.filter(function (u) { return assignTo(user, u.id); });
  }

  function inGroup(user, groupId) {
    if (!user || !groupId) return false;
    var g = S().group(groupId);
    if (!g) return false;
    return Array.isArray(g.members) && g.members.indexOf(user.id) > -1;
  }

  function assignToGroup(user, groupId) {
    if (!user) return false;
    if (user.admin || headOfAny(user)) return true;
    return inGroup(user, groupId);
  }

  function assignableGroups(user) {
    return (S().state.groups || []).filter(function (g) {
      return g.status === 'active' && assignToGroup(user, g.id);
    });
  }

  /* ---- creation and change --------------------------------------------- */
  function createGroup(user) { return !!user && (user.admin || headOfAny(user)); }
  function postInstruction(user) { return !!user; }            /* 6.3, open to everyone */
  function createTodo(user) { return !!user; }                 /* but assignment is gated above */

  function changeState(user, todo) {
    if (!user || !todo) return false;
    if (user.admin) return true;
    if (todo.created_by === user.id) return true;
    if (isHead(user, todo.department)) return true;
    if (Array.isArray(todo.departments) && todo.departments.some(function (d) { return isHead(user, d); })) return true;
    if (todo.assignee_type === 'user' && (todo.assignee === user.id || (Array.isArray(todo.assignees) && todo.assignees.indexOf(user.id) > -1))) return true;
    if (todo.assignee_type === 'group' && inGroup(user, todo.assignee)) return true;
    if (Array.isArray(todo.assignees) && todo.assignees.some(function (aid) {
      if (aid === user.id) return true;
      if (typeof aid === 'string') {
        if (aid.indexOf('user:') === 0 && aid.slice(5) === user.id) return true;
        if (aid.indexOf('group:') === 0 && inGroup(user, aid.slice(6))) return true;
      }
      return inGroup(user, aid);
    })) return true;
    return todo.assignee_type === 'user' && assignTo(user, todo.assignee);
  }

  /* whether this account has authority over anyone at all besides itself.
     assignTo() lets anyone take work themselves, which must not be mistaken
     for the authority to move work between people (6.2). */
  function assignsOthers(user) {
    if (!user) return false;
    if (user.admin) return true;
    return S().state.users.some(function (t) { return t.id !== user.id && assignTo(user, t.id); });
  }

  function reassign(user, todo) {
    if (!user || !todo) return false;
    if (user.admin) return true;
    if (!assignsOthers(user)) return false;              /* members and seniors: never */
    if (isHead(user, todo.department)) return true;
    if (Array.isArray(todo.departments) && todo.departments.some(function (d) { return isHead(user, d); })) return true;
    if (todo.assignee_type === 'user') {
      return todo.assignee === user.id || assignTo(user, todo.assignee);
    }
    return assignToGroup(user, todo.assignee);
  }

  function archiveInstruction(user, note) {
    if (!user || !note) return false;
    if (user.admin) return true;
    if (note.author === user.id) return true;
    if (isHead(user, note.department)) return true;
    if (Array.isArray(note.departments) && note.departments.some(function (d) { return isHead(user, d); })) return true;
    return false;
  }

  function canEditInstruction(user, note) {
    return archiveInstruction(user, note);
  }

  function canDeleteInstruction(user, note) {
    return archiveInstruction(user, note);
  }

  function canEditComment(user, comment, item) {
    if (!user || !comment) return false;
    return user.admin || comment.author === user.id;
  }

  function canDeleteComment(user, comment, item) {
    if (!user || !comment) return false;
    if (user.admin || comment.author === user.id) return true;
    if (item) {
      if (item.department && isHead(user, item.department)) return true;
      if (Array.isArray(item.departments) && item.departments.some(function (d) { return isHead(user, d); })) return true;
    }
    return false;
  }

  function manageDepartment(user, deptId) {
    return !!user && (user.admin || isHead(user, deptId));
  }

  /* Groups: Visible and accessible STRICTLY to assigned members and System Admin */
  function seeGroup(user, group) {
    if (!user || !group) return false;
    if (user.admin) return true;
    return Array.isArray(group.members) && group.members.indexOf(user.id) > -1;
  }

  function canPostGroupMessage(user, group) {
    if (!user || !group) return false;
    return user.admin || (group.members && group.members.indexOf(user.id) > -1);
  }

  function canReactGroupMessage(user, group) {
    return seeGroup(user, group);
  }

  function canEditGroup(user, group) {
    if (!user || !group) return false;
    return user.admin || group.created_by === user.id || headOfAny(user);
  }

  function canDeleteGroup(user, group) {
    if (!user || !group) return false;
    return user.admin || group.created_by === user.id;
  }

  function canEditGroupMessage(user, msg, group) {
    if (!user || !msg) return false;
    return user.admin || msg.author === user.id;
  }

  function canDeleteGroupMessage(user, msg, group) {
    if (!user || !msg) return false;
    return user.admin || msg.author === user.id || (group && group.created_by === user.id);
  }

  function invite(user) { return !!user && (user.admin || headOfAny(user)); }
  function createClient(user) { return !!user && (user.admin || headOfAny(user)); }

  /* an unclaimed invite may be withdrawn by whoever sent it, or by the
     system admin (6.1) */
  function manageInvite(user, account) {
    if (!user || !account || account.status !== 'invited') return false;
    return user.admin || (!!account.invite && account.invite.issued_by === user.id);
  }

  /* departments are data, not schema: the system admin may add one at any
     time and set the ordered hierarchy it uses (3.4, 4.1) */
  function manageDepartments(user) { return !!user && user.admin; }

  /* System Admin may edit any account; other persons can only see and edit their own account */
  function canEditAccount(actor, targetAccount) {
    if (!actor || !targetAccount) return false;
    if (actor.admin) return true;
    return actor.id === targetAccount.id;
  }

  function canDeleteAccount(actor, targetAccount) {
    if (!actor || !targetAccount) return false;
    if (actor.id === targetAccount.id) return false; // Cannot delete self
    return Boolean(actor.admin);
  }

  /* System Admin, Department Head, todo creator, or assignee may edit a todo */
  function canEditTodo(user, todo) {
    if (!user || !todo) return false;
    if (user.admin) return true;
    if (todo.created_by === user.id) return true;
    if (isHead(user, todo.department)) return true;
    if (Array.isArray(todo.departments) && todo.departments.some(function (d) { return isHead(user, d); })) return true;
    if (todo.assignee === user.id || (todo.assignee_type === 'user' && todo.assignee === user.id) || (Array.isArray(todo.assignees) && todo.assignees.indexOf(user.id) > -1)) return true;
    if (inGroup(user, todo.assignee) || (todo.assignee_type === 'group' && inGroup(user, todo.assignee))) return true;
    if (Array.isArray(todo.assignees) && todo.assignees.some(function (aid) {
      if (aid === user.id) return true;
      if (typeof aid === 'string') {
        if (aid.indexOf('user:') === 0 && aid.slice(5) === user.id) return true;
        if (aid.indexOf('group:') === 0 && inGroup(user, aid.slice(6))) return true;
      }
      return inGroup(user, aid);
    })) return true;
    return false;
  }

  /* Comments are visible strictly to authorized viewers of the item and System Admin */
  function canSeeComments(user, item) {
    if (!user || !item) return false;
    if (user.admin) return true;
    if (item.due !== undefined || item.state !== undefined) {
      return seeTodo(user, item);
    }
    return seeInstruction(user, item);
  }

  function commentOnTodo(user, todo) { return canSeeComments(user, todo); }
  function commentOnInstruction(user, note) { return canSeeComments(user, note); }
  function seeAudit(user) { return !!user && user.admin; }

  /* people whose work this account may review in reports */
  function visibleUsers(user) {
    if (!user) return [];
    if (user.admin) return S().state.users.slice();
    var mine = departmentsOf(user);
    return S().state.users.filter(function (u) {
      if (u.id === user.id) return true;
      return u.departments.some(function (m) { return mine.indexOf(m.department) > -1; });
    });
  }

  /* ---- escalation chain (9.4) ------------------------------------------- */
  function escalationChain(todo) {
    var chain = [];
    var assignees = [];
    if (Array.isArray(todo.assignees) && todo.assignees.length) {
      todo.assignees.forEach(function (aid) {
        if (typeof aid === 'string' && aid.indexOf('user:') === 0) {
          assignees.push(aid.slice(5));
        } else if (typeof aid === 'string' && aid.indexOf('group:') === 0) {
          var g = S().group(aid.slice(6));
          if (g && g.members) assignees = assignees.concat(g.members);
        } else {
          var g = S().group(aid);
          if (g && g.members) assignees = assignees.concat(g.members);
          else assignees.push(aid);
        }
      });
    } else if (todo.assignee_type === 'user') {
      assignees = [todo.assignee];
    } else {
      var g = S().group(todo.assignee);
      assignees = g ? g.members.slice() : [];
    }
    chain.push({ step: 'Assignee', users: assignees });

    var deptList = (Array.isArray(todo.departments) && todo.departments.length) ? todo.departments : (todo.department ? [todo.department] : []);
    var heads = S().state.users.filter(function (u) {
      return deptList.some(function (d) { return isHead(u, d); });
    }).map(function (u) { return u.id; });
    var leadership = S().state.users.filter(function (u) { return u.admin; }).map(function (u) { return u.id; });

    if (heads.length) chain.push({ step: 'Department head, day one', users: heads });
    chain.push({ step: 'System Admin, day two', users: leadership });
    return chain;
  }

  /* how far an overdue todo has climbed, by whole days late */
  function escalationReached(todo, daysLate) {
    if (daysLate < 1) return 0;
    return Math.min(daysLate, 2);
  }

  return {
    levelIn: levelIn, rank: rank, rankOf: rankOf,
    isHead: isHead, isLead: isLead, inDept: inDept, inGroup: inGroup,
    headOfAny: headOfAny, departmentsOf: departmentsOf, roleLabel: roleLabel,
    seeTodo: seeTodo, seeInstruction: seeInstruction, seeGroup: seeGroup,
    assignTo: assignTo, assignableUsers: assignableUsers,
    assignToGroup: assignToGroup, assignableGroups: assignableGroups,
    createGroup: createGroup, canEditGroup: canEditGroup, canDeleteGroup: canDeleteGroup,
    canPostGroupMessage: canPostGroupMessage, canEditGroupMessage: canEditGroupMessage, canDeleteGroupMessage: canDeleteGroupMessage,
    canReactGroupMessage: canReactGroupMessage,
    postInstruction: postInstruction, createTodo: createTodo,
    createClient: createClient, canEditTodo: canEditTodo,
    canEditInstruction: canEditInstruction, canDeleteInstruction: canDeleteInstruction,
    canEditComment: canEditComment, canDeleteComment: canDeleteComment,
    changeState: changeState, reassign: reassign, assignsOthers: assignsOthers, archiveInstruction: archiveInstruction,
    manageDepartment: manageDepartment, manageDepartments: manageDepartments,
    invite: invite, manageInvite: manageInvite, editAccount: canEditAccount, deleteAccount: canDeleteAccount, seeAudit: seeAudit,
    canSeeComments: canSeeComments, commentOnTodo: commentOnTodo, commentOnInstruction: commentOnInstruction,
    visibleUsers: visibleUsers,
    escalationChain: escalationChain, escalationReached: escalationReached
  };
})();
