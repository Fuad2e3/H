/* =========================================================================
   permissions.js — section 3.0, enforced on the server
   The browser has its own copy of these rules, but that copy only decides
   what to draw. This one decides what the server will hand over or accept,
   which is the distinction section 8.1 insists on: "the app does not show it
   to you" and "the system will not give it to you" are different things.

   Authority is a level's position in its own department's ordered hierarchy,
   so a department can add levels without a rule changing (3.4).
   Originate Command · OM SRS 001
   ========================================================================= */

'use strict';

function levelIn(user, deptId) {
  const m = (user.departments || []).find(function (x) { return x.department === deptId; });
  return m ? m.level : null;
}

function rank(departments, deptId, level) {
  const dept = departments.find(function (d) { return d.id === deptId; });
  if (!dept || !level) return Infinity;
  const i = dept.levels.indexOf(level);
  return i === -1 ? Infinity : i;
}

function rankOf(user, deptId, departments) {
  return rank(departments, deptId, levelIn(user, deptId));
}

function isHead(user, deptId, departments) { return rankOf(user, deptId, departments) === 0; }
function isLead(user, deptId, departments) { return rankOf(user, deptId, departments) === 1; }
function inDept(user, deptId) { return levelIn(user, deptId) !== null; }
function headOfAny(user, departments) {
  return (user.departments || []).some(function (m) {
    return rank(departments, m.department, m.level) === 0;
  });
}
function inGroup(user, groupId, groups) {
  const g = groups.find(function (x) { return x.id === groupId; });
  return !!g && g.members.indexOf(user.id) > -1;
}

/* ---- visibility (3.1) ---------------------------------------------------- */
function seeTodo(user, todo, ctx) {
  if (user.admin) return true;
  if (todo.assignee_type === 'user' && todo.assignee === user.id) return true;
  if (todo.assignee_type === 'group' && inGroup(user, todo.assignee, ctx.groups)) return true;
  return inDept(user, todo.department);
}

function seeInstruction(user, note) {
  if (user.admin) return true;
  if (note.author === user.id) return true;
  return inDept(user, note.department);
}

/* ---- assignment (3.2) ---------------------------------------------------- */
function assignTo(user, targetId, ctx) {
  if (user.admin) return true;
  if (targetId === user.id) return true;            /* anyone may take work themselves */
  const target = ctx.users.find(function (u) { return u.id === targetId; });
  if (!target) return false;
  return (user.departments || []).some(function (m) {
    const mine = rank(ctx.departments, m.department, m.level);
    const theirs = rankOf(target, m.department, ctx.departments);
    if (theirs === Infinity) return false;
    if (mine === 0) return true;                    /* head: anyone below in the department */
    if (mine === 1) return theirs > 1;              /* lead: their own team */
    return false;
  });
}

/* authority over anyone other than yourself: taking work is not the same as
   moving other people's work (6.2) */
function assignsOthers(user, ctx) {
  if (user.admin) return true;
  return ctx.users.some(function (u) { return u.id !== user.id && assignTo(user, u.id, ctx); });
}

function assignToGroup(user, groupId, ctx) {
  if (user.admin || headOfAny(user, ctx.departments)) return true;
  return inGroup(user, groupId, ctx.groups);
}

/* ---- change (6.2, 6.3) --------------------------------------------------- */
function changeState(user, todo, ctx) {
  if (user.admin) return true;
  if (todo.assignee_type === 'user' && todo.assignee === user.id) return true;
  if (todo.assignee_type === 'group' && inGroup(user, todo.assignee, ctx.groups)) return true;
  return todo.assignee_type === 'user' && assignTo(user, todo.assignee, ctx);
}

function reassign(user, todo, ctx) {
  if (user.admin) return true;
  if (!assignsOthers(user, ctx)) return false;
  if (isHead(user, todo.department, ctx.departments)) return true;
  if (todo.assignee_type === 'user') {
    return todo.assignee === user.id || assignTo(user, todo.assignee, ctx);
  }
  return assignToGroup(user, todo.assignee, ctx);
}

function archiveInstruction(user, note, ctx) {
  return user.admin || note.author === user.id || isHead(user, note.department, ctx.departments);
}

/* ---- creation ------------------------------------------------------------ */
function createGroup(user, ctx) { return user.admin || headOfAny(user, ctx.departments); }
function invite(user, ctx) { return user.admin || headOfAny(user, ctx.departments); }
function manageDepartments(user) { return !!user.admin; }
function seeAudit(user) { return !!user.admin; }

function manageInvite(user, account) {
  if (!account || account.status !== 'invited') return false;
  return user.admin || (!!account.invite && account.invite.issued_by === user.id);
}

function visibleUsers(user, ctx) {
  if (user.admin) return ctx.users;
  const mine = (user.departments || []).map(function (m) { return m.department; });
  return ctx.users.filter(function (u) {
    if (u.id === user.id) return true;
    return (u.departments || []).some(function (m) { return mine.indexOf(m.department) > -1; });
  });
}

/* ---- escalation (9.4) ---------------------------------------------------- */
function daysLate(due, today) {
  if (!due) return 0;
  const d = Date.parse(due + 'T12:00:00Z');
  const now = Date.parse((today || new Date().toISOString().slice(0, 10)) + 'T12:00:00Z');
  return Math.round((now - d) / 86400000);
}

function escalationRecipients(todo, ctx, today) {
  const late = daysLate(todo.due, today);
  if (todo.state === 'done' || todo.archived || late < 1) return [];

  const assignees = todo.assignee_type === 'group'
    ? ((ctx.groups.find(function (g) { return g.id === todo.assignee; }) || {}).members || [])
    : [todo.assignee];

  const out = assignees.slice();
  const add = function (list) {
    list.forEach(function (u) { if (out.indexOf(u.id) === -1) out.push(u.id); });
  };
  if (late >= 1) add(ctx.users.filter(function (u) { return isLead(u, todo.department, ctx.departments); }));
  if (late >= 2) add(ctx.users.filter(function (u) { return isHead(u, todo.department, ctx.departments); }));
  if (late >= 3) add(ctx.users.filter(function (u) { return u.admin; }));
  return out;
}

module.exports = {
  levelIn, rank, rankOf, isHead, isLead, inDept, headOfAny, inGroup,
  seeTodo, seeInstruction, assignTo, assignsOthers, assignToGroup,
  changeState, reassign, archiveInstruction,
  createGroup, invite, manageDepartments, manageInvite, seeAudit, visibleUsers,
  daysLate, escalationRecipients
};
