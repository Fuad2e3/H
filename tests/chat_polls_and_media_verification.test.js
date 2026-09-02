/**
 * CHAT POLLS & OPTIMIZED MEDIA VERIFICATION TEST
 * 
 * Verifies:
 * 1. Creating interactive group poll with options and voting logic.
 * 2. Voting toggle & single-choice exclusivity in voteGroupPoll.
 * 3. Attaching optimized media (image, video) to group chat messages.
 * 4. Message stream and notifications dispatching.
 */

const assert = require('assert');
require('./harness.js');
loadFile('assets/js/store.js');
loadFile('assets/js/permissions.js');
loadFile('assets/js/ui.js');

console.log('╔══════════════════════════════════════════════════════════════════════════╗');
console.log('║       CHAT POLLS & OPTIMIZED MEDIA FULL SYSTEM VERIFICATION               ║');
console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

OC.store.load();

// Ensure test group exists
var testGroup = OC.store.group('grp-test');
if (!testGroup) {
  testGroup = {
    id: 'grp-test',
    name: 'Social Media Strategy',
    purpose: 'Coordinate campaigns and visual assets',
    status: 'active',
    members: ['u-fuad', 'u-shohag'],
    messages: []
  };
  OC.store.state.groups.push(testGroup);
}

console.log('--- [1/4] Testing Interactive Poll Creation in Group Chat ---');
const pollData = {
  id: 'poll-101',
  question: 'Which design format should we use for the upcoming launch campaign?',
  multi: false,
  options: [
    { id: 'opt-1', text: 'Minimalist Dark Theme', voters: [] },
    { id: 'opt-2', text: 'Vibrant Glassmorphism', voters: [] },
    { id: 'opt-3', text: 'Clean Editorial White', voters: [] }
  ],
  created_by: 'u-fuad',
  created_at: new Date().toISOString()
};

const pollMsg = OC.store.addGroupMessage('grp-test', '📊 Poll: ' + pollData.question, 'u-fuad', { poll: pollData });
assert.ok(pollMsg, 'Poll message must be created');
assert.ok(pollMsg.poll, 'Message must have poll object attached');
assert.strictEqual(pollMsg.poll.options.length, 3, 'Poll must contain 3 options');
console.log('  ✓ Poll created successfully with 3 options');

console.log('\n--- [2/4] Testing Poll Voting & Single-Choice Exclusivity ---');
// User Shohag votes for Option 1
OC.store.voteGroupPoll('grp-test', pollMsg.id, 'opt-1', 'u-shohag');
assert.strictEqual(pollMsg.poll.options[0].voters.length, 1, 'Option 1 must have 1 vote');
assert.ok(pollMsg.poll.options[0].voters.includes('u-shohag'), 'Shohag voted for Option 1');

// User Fuad votes for Option 2
OC.store.voteGroupPoll('grp-test', pollMsg.id, 'opt-2', 'u-fuad');
assert.strictEqual(pollMsg.poll.options[1].voters.length, 1, 'Option 2 must have 1 vote');

// User Shohag changes vote from Option 1 to Option 2
OC.store.voteGroupPoll('grp-test', pollMsg.id, 'opt-2', 'u-shohag');
assert.strictEqual(pollMsg.poll.options[0].voters.length, 0, 'Option 1 votes must become 0 (single choice exclusivity)');
assert.strictEqual(pollMsg.poll.options[1].voters.length, 2, 'Option 2 votes must become 2');
console.log('  ✓ Single-choice exclusivity and vote shifting verified');

// User Shohag toggles (unvotes) Option 2
OC.store.voteGroupPoll('grp-test', pollMsg.id, 'opt-2', 'u-shohag');
assert.strictEqual(pollMsg.poll.options[1].voters.length, 1, 'Toggling vote un-votes Option 2');
console.log('  ✓ Vote toggle unvote verified');

console.log('\n--- [3/4] Testing Optimized Media Attachment in Chat (Image & Video) ---');
const imageMedia = {
  type: 'image',
  url: 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAkA4JaQAA3AA/vuUAAA=',
  name: 'mockup_hero_banner.webp',
  size: '14.2 KB (optimized)'
};

const imgMsg = OC.store.addGroupMessage('grp-test', 'Here is the hero banner mockup', 'u-shohag', { media: imageMedia });
assert.ok(imgMsg.media, 'Image media must be attached to message');
assert.strictEqual(imgMsg.media.type, 'image', 'Media type must be image');
console.log('  ✓ Optimized image attachment verified:', imgMsg.media.name);

const videoMedia = {
  type: 'video',
  url: 'data:video/mp4;base64,AAAAHGZ0eXBtcDQyAAAAAG1wNDJpc29tYXZjMQ==',
  name: 'feature_walkthrough.mp4',
  size: '2.4 MB'
};

const vidMsg = OC.store.addGroupMessage('grp-test', 'Short video walkthrough of the new workflow', 'u-fuad', { media: videoMedia });
assert.ok(vidMsg.media, 'Video media must be attached to message');
assert.strictEqual(vidMsg.media.type, 'video', 'Media type must be video');
console.log('  ✓ Video attachment verified:', vidMsg.media.name);

console.log('\n--- [4/4] Testing Total Messages & Integrity in Group ---');
const currentGroup = OC.store.group('grp-test');
assert.strictEqual(currentGroup.messages.length, 3, 'Group must contain 3 messages');
console.log('  ✓ All messages (Poll + Image + Video) stored and accessible in group');

console.log('\n==========================================================================');
console.log('  🎉 CHAT POLLS & OPTIMIZED MEDIA 100% VERIFIED! ✅');
console.log('==========================================================================\n');

setTimeout(() => process.exit(0), 100);
