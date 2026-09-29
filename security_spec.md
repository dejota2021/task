# Security Specification & Threat Model (TDD)

## 1. Data Invariants

- **Board Isolation**: A task or activity feed item cannot exist without a parent Board document. Access to tasks and activities is authorized if the user has credentials/access to the board.
- **Identity Integrity**: Tasks can only be claimed, completed, or created by authenticated users.
- **Status Bounds**: The `column` field of a task is strictly constrained to `['pending', 'progress', 'done']`.
- **Priority Bounds**: The `priority` field of a task is strictly constrained to `['baja', 'media', 'alta']`.
- **System Timestamps**: Key fields `createdAt` and `completedAt` must match the server-generated `request.time`. They cannot be spoofed by client timestamps.
- **Immutability**: Once a board or task is created, fields like `createdAt` cannot be altered. Activities are entirely immutable (no updates, no deletes).

---

## 2. The "Dirty Dozen" Malicious Payloads

The following payloads attempt to break the rules of Identity, Integrity, and State, and must be strictly blocked (`PERMISSION_DENIED`) by our Firestore Rules:

### T1: Anonymous/Unauthenticated Board Creation
* **Target**: `/boards/maliciousBoard` (Write)
* **Auth**: `request.auth == null`
* **Payload**: `{ "title": "Free Board", "code": "HACKED", "createdAt": "2026-09-28T12:00:00Z" }`
* **Expected Result**: `PERMISSION_DENIED`

### T2: Board Join Code Hijack (Altering Code after Creation)
* **Target**: `/boards/existingBoardId` (Update)
* **Auth**: Signed in
* **Payload**: `{ "code": "NEWCOD" }` (Attempting to hijack code field)
* **Expected Result**: `PERMISSION_DENIED` (Code is immutable)

### T3: Task Created with Spoofed Server Timestamp
* **Target**: `/boards/board123/tasks/task1` (Create)
* **Auth**: Signed in
* **Payload**: `{ "title": "Spoofed Time", "column": "pending", "priority": "baja", "points": 10, "createdAt": "2000-01-01T00:00:00Z" }`
* **Expected Result**: `PERMISSION_DENIED` (Must be `request.time`)

### T4: Task Created with Shadow Fields ("Ghost Fields" attack)
* **Target**: `/boards/board123/tasks/task1` (Create)
* **Auth**: Signed in
* **Payload**: `{ "title": "Hack", "column": "pending", "priority": "baja", "points": 10, "createdAt": "request.time", "isVerified": true, "superAdmin": true }`
* **Expected Result**: `PERMISSION_DENIED` (Strict schema key check violates `hasOnly`)

### T5: Invalid Task Status Transition
* **Target**: `/boards/board123/tasks/task1` (Create)
* **Auth**: Signed in
* **Payload**: `{ "title": "Hack Status", "column": "completed_invalid", "priority": "baja", "points": 10, "createdAt": "request.time" }`
* **Expected Result**: `PERMISSION_DENIED` (Status must be `pending`, `progress`, or `done`)

### T6: Invalid Task Priority Level
* **Target**: `/boards/board123/tasks/task1` (Create)
* **Auth**: Signed in
* **Payload**: `{ "title": "Hack Priority", "column": "pending", "priority": "URGENT_CRITICAL", "points": 10, "createdAt": "request.time" }`
* **Expected Result**: `PERMISSION_DENIED` (Priority must be `baja`, `media`, `alta`)

### T7: Massive Payload Injection (Denial of Wallet)
* **Target**: `/boards/board123/tasks/task1` (Create)
* **Auth**: Signed in
* **Payload**: `{ "title": "A".repeat(1000), "column": "pending", "priority": "baja", "points": 10, "createdAt": "request.time" }`
* **Expected Result**: `PERMISSION_DENIED` (Title size limit exceeded)

### T8: Negative XP/Points Exploit
* **Target**: `/boards/board123/tasks/task1` (Create)
* **Auth**: Signed in
* **Payload**: `{ "title": "Malicious task", "column": "pending", "priority": "baja", "points": -1000, "createdAt": "request.time" }`
* **Expected Result**: `PERMISSION_DENIED` (Points must be `>= 0`)

### T9: Modifying Task Immutable Creation Timestamp
* **Target**: `/boards/board123/tasks/task1` (Update)
* **Auth**: Signed in
* **Payload**: `{ "createdAt": "request.time" }`
* **Expected Result**: `PERMISSION_DENIED` (`createdAt` is immutable)

### T10: Malicious Activity Modification
* **Target**: `/boards/board123/activities/act1` (Update)
* **Auth**: Signed in
* **Payload**: `{ "text": "Hacked activity log text" }`
* **Expected Result**: `PERMISSION_DENIED` (Activities are immutable)

### T11: Activity Deletion Exploit
* **Target**: `/boards/board123/activities/act1` (Delete)
* **Auth**: Signed in
* **Expected Result**: `PERMISSION_DENIED` (Deletion of logs is forbidden)

### T12: Board Code Validation Poisoning
* **Target**: `/boards/board123` (Create)
* **Auth**: Signed in
* **Payload**: `{ "title": "Bad Code Board", "code": "12345#", "createdAt": "request.time" }`
* **Expected Result**: `PERMISSION_DENIED` (Code must be exactly 6 alphanumeric uppercase characters: `^[A-Z0-9]{6}$`)

---

## 3. Threat Model Verification Strategy

We will configure `firestore.rules` with strict data-type helpers, key-set constraints, and temporal validations. All incoming writes are verified at the rule boundary before commit.
