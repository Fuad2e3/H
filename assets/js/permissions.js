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
    if (!user.departments.length) return 'No department';
    var best = null;
    user.departments.forEach(function (m) {
      var r = rank(m.department, m.level);
      if (!best || r < best.r) best = { r: r, level: m.level };
    });
    if (best.r === 0) return 'Department Head';
    if (best.r === 1) return 'Team Lead';
    return best.level.charAt(0).toUpperCase() + best.level.slice(1);
  }

  /* ---- visibility ------------------------------------------------------ */
  function seeTodo(user, todo) {
    if (!user || !todo) return false;
    if (user.admin) return true;
    if (todo.assignee_type === 'user' && todo.assignee === user.id) return true;
    if (todo.assignee_type === 'group' && inGroup(user, todo.assignee)) return true;
    return inDept(user, todo.department);
  }

  function seeInstruction(user, note) {
    if (!user || !note) return false;
    if (user.admin) return true;
    if (note.author === user.id) return true;
    return inDept(user, note.department);
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
      if (mine === 0) return true;                    /* head: anyone below, in department */
      if (mine === 1) return theirs > 1;              /* lead: the team under them */
      return false;                                   /* everyone else: nobody */
    });
  }

  function assignableUsers(user) {
    return S().state.users.filter(function (u) { return assignTo(user, u.id); });
  }

  function assignToGroup(user, groupId) {
    if (!user) return false;
    if (user.admin || headOfAny(user)) return true;
    return inGroup(user, groupId);
  }

  function assignableGroups(user) {
    return S().state.groups.filter(function (g) {
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
    if (todo.assignee_type === 'user' && todo.assignee === user.id) return true;
    if (todo.assignee_type === 'group' && inGroup(user, todo.assignee)) return true;
    return todo.assignee_type === 'user' && assignTo(user, todo.assignee);
  }

  function reassign(user, todo) {
    if (!user || !todo) return false;
    if (user.admin) return true;
    if (todo.assignee_type === 'user' && assignTo(user, todo.assignee)) return true;
    return isHead(user, todo.department);
  }

  function archiveInstruction(user, note) {
    if (!user || !note) return false;
    return user.admin || note.author === user.id || isHead(user, note.department);
  }

  function manageDepartment(user, deptId) {
    return !!user && (user.admin || isHead(user, deptId));
  }

  function invite(user) { return !!user && (user.admin || headOfAny(user)); }
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
    if (todo.assignee_type === 'user') {
      assignees = [todo.assignee];
    } else {
      var g = S().group(todo.assignee);
      assignees = g ? g.members.slice() : [];
    }
    chain.push({ step: 'Assignee', users: assignees });

    var dept = todo.department;
    var leads = S().state.users.filter(function (u) { return isLead(u, dept); }).map(function (u) { return u.id; });
    var heads = S().state.users.filter(function (u) { return isHead(u, dept); }).map(function (u) { return u.id; });
    var leadership = S().state.users.filter(function (u) { return u.admin; }).map(function (u) { return u.id; });

    if (leads.length) chain.push({ step: 'Team lead, day one', users: leads });
    if (heads.length) chain.push({ step: 'Department head, day two', users: heads });
    chain.push({ step: 'Leadership, day three', users: leadership });
    return chain;
  }

  /* how far an overdue todo has climbed, by whole days late */
  function escalationReached(todo, daysLate) {
    if (daysLate < 1) return 0;
    return Math.min(daysLate, 3);
  }

  return {
    levelIn: levelIn, rank: rank, rankOf: rankOf,
    isHead: isHead, isLead: isLead, inDept: inDept, inGroup: inGroup,
    headOfAny: headOfAny, departmentsOf: departmentsOf, roleLabel: roleLabel,
    seeTodo: seeTodo, seeInstruction: seeInstruction,
    assignTo: assignTo, assignableUsers: assignableUsers,
    assignToGroup: assignToGroup, assignableGroups: assignableGroups,
    createGroup: createGroup, postInstruction: postInstruction, createTodo: createTodo,
    changeState: changeState, reassign: reassign, archiveInstruction: archiveInstruction,
    manageDepartment: manageDepartment, invite: invite, seeAudit: seeAudit,
    visibleUsers: visibleUsers,
    escalationChain: escalationChain, escalationReached: escalationReached
  };
})();
