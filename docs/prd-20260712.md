# Feature: Task Dependencies

## Overview
Allow users to create dependency links between tasks. A task can block another task from being completed until the blocker is completed first.

## User Story 1: Set Blocker
As a user, I want to mark Task A as "blocked by" Task B so the app prevents me from completing A before B.

## User Story 2: Visual Feedback
As a user, I want to see which tasks are blocked and why, so I know what needs to be done first.

## Acceptance Criteria
- [ ] Blocked tasks show a lock icon
- [ ] Clicking a blocked task shows the blocking task name
- [ ] Completing a blocking task unlocks all blocked tasks
- [ ] Circular dependencies are prevented at creation time
