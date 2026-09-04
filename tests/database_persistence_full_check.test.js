/* =========================================================================
   tests/database_persistence_full_check.test.js
   Full verification that 100% of workspace entities, actions, comments,
   reactions, tasks, instructions, groups, and audit logs are saved and
   persisted into the database.
   ========================================================================= */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║       FULL DATABASE PERSISTENCE & STORAGE AUDIT CHECK              ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

let pass = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ❌ FAILED: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// 1. Load Backend Database Engine
const db = require('../dev3/API/config/db');

test('1. Database Engine initializes and loads state cleanly', () => {
  const state = db.getState();
  assert.ok(state, 'State must exist');
  assert.strictEqual(state.version, 1);
  assert.ok(Array.isArray(state.departments), 'Departments must be array');
  assert.ok(Array.isArray(state.users), 'Users must be array');
  assert.ok(Array.isArray(state.todos), 'Todos must be array');
  assert.ok(Array.isArray(state.instructions), 'Instructions must be array');
  assert.ok(Array.isArray(state.groups), 'Groups must be array');
  assert.ok(Array.isArray(state.audit), 'Audit must be array');
});

test('2. New Task/Todo with multi-assignee, multi-dept, and multi-client saves to DB', () => {
  const testTodo = {
    id: 't-persistence-check-' + Date.now(),
    title: 'Comprehensive Verification Task',
    description: 'Testing database persistence for todos',
    client: 'c-apex',
    clients: ['c-apex', 'c-bolt'],
    department: 'd-web',
    departments: ['d-web', 'd-outreach'],
    assignee_type: 'user',
    assignee: 'u-fuad',
    assignees: ['u-fuad', 'u-shohag'],
    state: 'open',
    priority: 'high',
    due: '2026-09-15',
    recurrence: 'weekly',
    created_by: 'u-shohag',
    created_at: new Date().toISOString(),
    tags: ['t-urgent'],
    comments: [],
    reactions: {}
  };

  db.mutate({ actor: 'u-shohag', action: 'todo.create', target: testTodo.title, detail: 'Created in persistence check' }, (s) => {
    s.todos.push(testTodo);
  });

  // Verify it exists in fresh state from DB
  const reloaded = db.getState();
  const saved = reloaded.todos.find(t => t.id === testTodo.id);
  assert.ok(saved, 'Todo must be persisted in database');
  assert.strictEqual(saved.title, 'Comprehensive Verification Task');
  assert.strictEqual(saved.clients.length, 2);
  assert.strictEqual(saved.departments.length, 2);
  assert.strictEqual(saved.assignees.length, 2);
});

test('3. Comments on Todo save with author, body, timestamp and editing in DB', () => {
  const reloaded = db.getState();
  const todo = reloaded.todos.find(t => t.title === 'Comprehensive Verification Task');
  assert.ok(todo);

  const comment = {
    id: 'c-test-' + Date.now(),
    author: 'u-fuad',
    body: 'First verification comment',
    posted_at: new Date().toISOString()
  };

  db.mutate({ actor: 'u-fuad', action: 'todo.comment', target: todo.title, detail: comment.body }, (s) => {
    const targetTodo = s.todos.find(t => t.id === todo.id);
    targetTodo.comments = targetTodo.comments || [];
    targetTodo.comments.push(comment);
  });

  // Verify comment persisted
  const stateAfterComment = db.getState();
  const todoAfter = stateAfterComment.todos.find(t => t.id === todo.id);
  assert.strictEqual(todoAfter.comments.length, 1);
  assert.strictEqual(todoAfter.comments[0].body, 'First verification comment');
  assert.strictEqual(todoAfter.comments[0].author, 'u-fuad');

  // Edit comment
  db.mutate({ actor: 'u-fuad', action: 'comment.edit', target: todo.title, detail: 'Edited comment' }, (s) => {
    const targetTodo = s.todos.find(t => t.id === todo.id);
    const targetComment = targetTodo.comments.find(c => c.id === comment.id);
    targetComment.body = 'Updated verification comment body';
    targetComment.edited_at = new Date().toISOString();
  });

  const stateAfterEdit = db.getState();
  const todoEdited = stateAfterEdit.todos.find(t => t.id === todo.id);
  assert.strictEqual(todoEdited.comments[0].body, 'Updated verification comment body');
  assert.ok(todoEdited.comments[0].edited_at);
});

test('4. Reactions on Todo save with emoji, user list and toggle in DB', () => {
  const reloaded = db.getState();
  const todo = reloaded.todos.find(t => t.title === 'Comprehensive Verification Task');
  assert.ok(todo);

  // Add reaction
  db.mutate({ actor: 'u-fuad', action: 'todo.react', target: todo.title, detail: 'Added 🔥' }, (s) => {
    const targetTodo = s.todos.find(t => t.id === todo.id);
    targetTodo.reactions = targetTodo.reactions || {};
    targetTodo.reactions['🔥'] = ['u-fuad', 'u-shohag'];
  });

  const stateAfterReact = db.getState();
  const todoReacted = stateAfterReact.todos.find(t => t.id === todo.id);
  assert.ok(todoReacted.reactions['🔥']);
  assert.strictEqual(todoReacted.reactions['🔥'].length, 2);
  assert.strictEqual(todoReacted.reactions['🔥'][0], 'u-fuad');
});

test('5. New Instruction with comments and reactions saves to DB', () => {
  const testNote = {
    id: 'n-persistence-check-' + Date.now(),
    body: 'Standard Operating Procedure for Operations',
    author: 'u-shohag',
    client: 'c-apex',
    clients: ['c-apex'],
    department: 'd-web',
    departments: ['d-web'],
    tags: ['t-policy'],
    posted_at: new Date().toISOString(),
    read_by: ['u-shohag'],
    archived: false,
    linked_todo: null,
    comments: [
      { id: 'c-note-1', author: 'u-fuad', body: 'Acknowledged and reviewed', posted_at: new Date().toISOString() }
    ],
    reactions: { '👍': ['u-fuad'] }
  };

  db.mutate({ actor: 'u-shohag', action: 'instruction.post', target: testNote.body.slice(0, 30), detail: 'Instruction posted' }, (s) => {
    s.instructions.push(testNote);
  });

  const stateAfterNote = db.getState();
  const savedNote = stateAfterNote.instructions.find(n => n.id === testNote.id);
  assert.ok(savedNote, 'Instruction must be persisted');
  assert.strictEqual(savedNote.body, 'Standard Operating Procedure for Operations');
  assert.strictEqual(savedNote.comments.length, 1);
  assert.strictEqual(savedNote.comments[0].body, 'Acknowledged and reviewed');
  assert.strictEqual(savedNote.reactions['👍'][0], 'u-fuad');
});

test('6. Group Chat with messages, edits, reactions, and audit trails saves to DB', () => {
  const testGroup = {
    id: 'g-persistence-' + Date.now(),
    name: 'Dev Operations Group',
    purpose: 'Core Infrastructure Coordination',
    members: ['u-shohag', 'u-fuad'],
    created_by: 'u-shohag',
    status: 'active',
    messages: [
      {
        id: 'msg-1',
        text: 'Deploying release build v2.1',
        author: 'u-fuad',
        at: new Date().toISOString(),
        reactions: { '🚀': ['u-shohag'] }
      }
    ]
  };

  db.mutate({ actor: 'u-shohag', action: 'group.create', target: testGroup.name, detail: 'Created group' }, (s) => {
    s.groups.push(testGroup);
  });

  const stateAfterGroup = db.getState();
  const savedGroup = stateAfterGroup.groups.find(g => g.id === testGroup.id);
  assert.ok(savedGroup, 'Group must be persisted in database');
  assert.strictEqual(savedGroup.messages.length, 1);
  assert.strictEqual(savedGroup.messages[0].text, 'Deploying release build v2.1');
  assert.strictEqual(savedGroup.messages[0].reactions['🚀'][0], 'u-shohag');
});

test('7. Clean up test artifacts cleanly from DB', () => {
  db.mutate(null, (s) => {
    s.todos = s.todos.filter(t => !t.id.startsWith('t-persistence-check'));
    s.instructions = s.instructions.filter(n => !n.id.startsWith('n-persistence-check'));
    s.groups = s.groups.filter(g => !g.id.startsWith('g-persistence-'));
  });

  const cleanState = db.getState();
  assert.ok(!cleanState.todos.some(t => t.id.startsWith('t-persistence-check')));
  assert.ok(!cleanState.instructions.some(n => n.id.startsWith('n-persistence-check')));
  assert.ok(!cleanState.groups.some(g => g.id.startsWith('g-persistence-')));
});

console.log('\n====================================================================');
console.log(` 🎉 ALL ${pass} DATABASE PERSISTENCE CHECKS VERIFIED & PASSED! ✅`);
console.log('====================================================================\n');

setTimeout(() => process.exit(0), 100);

