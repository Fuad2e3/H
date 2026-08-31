# Implementation Plan - Fix Default Assignee and Dashboard Visibility

The user reported two issues:
1. The "New todo" modal defaults the assignee to the current user.
2. Assigned todos are not showing up on the dashboard of the assignee immediately if they are due in the future.

## Proposed Changes

### [Board Component]

#### [MODIFY] [board.js](file:///C:/Users/fuadk/Documents/GitHub/Originate-Command/assets/js/board.js)
- Remove the logic that defaults `initialAssignees` to `['user:' + user.id]`.
- Set `initialAssignees` to `[]` by default.

### [Dashboard Component]

#### [MODIFY] [dashboard.js](file:///C:/Users/fuadk/Documents/GitHub/Originate-Command/assets/js/dashboard.js)
- Update `myTodos` to show all open todos by default instead of filtering out future tasks.
- Keep the "Show Upcoming" toggle if the user still wants to filter, or simplify it to just show everything. (I will simplify it to show everything as it's more intuitive for a personal dashboard).

## Verification Plan

### Automated Tests
- N/A (Manual verification on UI preferred for these behavioral changes).

### Manual Verification
1. Open the "New todo" modal and verify the "Assign to" field is empty.
2. Create a todo assigned to another user with a future due date (e.g., tomorrow).
3. Log in as that user (or check their state) and verify the todo appears on their "My todos" list on the dashboard without needing to click "Show Upcoming".
