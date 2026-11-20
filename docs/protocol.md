# Sync protocol

How FieldSync devices and the server agree on the same data.

## Clock

Every change is stamped with a hybrid logical clock (HLC): the device's time,
a counter, and the device's id. Stamps decide which edit is the latest, so they
must stay ordered even when a phone's clock is wrong.

A stamp is a fixed-width string, so plain string comparison orders it:

```
0193a5c2f1e00-0003-0a1b2c3d
└ time (ms, 13 hex) └ counter (4 hex) └ node (first 8 hex of the device id)
```

Rules, implemented in `packages/hlc`:

- **Local event:** take the later of the device time and the last stamp's
  time. If the time did not advance, add one to the counter; otherwise reset it
  to zero. A device clock that jumps back never produces an older stamp.
- **Stamp received from another device:** move to the latest of the device
  time, the last stamp and the received stamp, with a counter above both. The
  next local stamp then sorts after everything the device has seen.
- **Drift guard:** a received stamp more than 24 hours ahead of the device time
  is ignored, so one broken clock cannot pull every device into the future.
- **Ties:** two devices cannot produce the same stamp, because the node is part
  of it.
- **Restart:** the device persists its last stamp and resumes from it.

The clock takes its time source as a parameter. Tests and the simulator pass a
fake one.

## Operations

Every change is an operation, defined in `packages/protocol`:

| Field           | Meaning                                                     |
| --------------- | ----------------------------------------------------------- |
| `opId`          | Unique id; lets the server recognise a retry                |
| `deviceId`      | The device that made the change                             |
| `entityType`    | For example `work_order`                                    |
| `entityId`      | The record being changed                                    |
| `kind`          | `upsert`, `delete` or `restore`                             |
| `patch`         | The fields being set (`upsert` only)                        |
| `base`          | Per field, the stamp of the value the user saw when editing |
| `hlc`           | The stamp of this operation; its node must match `deviceId` |
| `clientVersion` | The app version that produced it                            |

`upsert` creates the record if it does not exist, so a create and an edit can
arrive in either order.

## Merge

`packages/merge` is one pure function: `merge(state, op)` returns the new
state, the fields the operation won, and any conflicts. The client and the
server run the same code.

A record stores, next to its field values, the stamp of the write that last
won each field, plus the latest delete and restore stamps.

- **Fields:** an operation wins a field only if its stamp is later than the
  stored one. Edits to different fields never compete.
- **Delete and restore:** each keeps its latest stamp. The record is deleted
  when the latest delete is later than the latest restore.
- **Delete wins over edits:** a deleted record stays deleted whatever edits
  arrive. The edits are still merged into the hidden fields, so the result
  does not depend on arrival order, and a restore brings back the latest
  values.

Applying the same operations in any order, or more than once, gives the same
state. Property tests check this on random sequences.

### Conflicts

Merging never fails, but it must not lose work silently. An operation raises a
conflict when:

- it writes a field that another device changed since the user last saw it
  (the stored stamp differs from `base`), whichever side wins; or
- it edits a record that another device deleted.

A device's own operations arriving late or out of order are not conflicts.
Only the server records conflicts; devices merge pulled changes with detection
off. Dispatchers read them in the conflict log, which names who wrote each
value: the last 8 characters of a stamp identify the device, and so its user.

## Server storage

| Table          | Role                                                             |
| -------------- | ---------------------------------------------------------------- |
| `orgs`         | One row per organisation, with its change counter `seq`          |
| `entities`     | Current state of each record: fields, clocks, delete and restore |
| `changes`      | Append-only log, numbered by `seq`; this is what devices pull    |
| `received_ops` | The result given for each operation, replayed on a retry         |
| `conflicts`    | Every conflict the merge reported                                |

## Push

A device sends its pending operations in a batch. The server handles the batch
in one transaction, so it is applied entirely or not at all. For each
operation it:

1. validates the shape (`INVALID_OP` if it fails);
2. returns the stored result if the operation was already received
   (`duplicate`), so retries are safe;
3. checks that the device is the one that signed in (`FORBIDDEN`) and that the
   clock is not more than 24 hours ahead (`CLOCK_DRIFT`);
4. merges it into the record, appends a change with the fields it won, stores
   any conflicts, and remembers the result.

Each result is `applied`, `duplicate` or `rejected` with a reason. An applied
result carries its conflicts, so the device can tell the user their edit was
overridden. A `CLOCK_DRIFT` rejection is not remembered: the answer depends on
the time, so the device may retry.

### Why the change counter is not a Postgres sequence

With a sequence, two transactions can take numbers 41 and 42 and commit in the
opposite order. A device that pulls between the two commits sees 42, moves its
cursor past 41, and never receives change 41.

Instead the counter lives on the organisation's row and the push transaction
locks that row first. Writers in one organisation run one at a time, so
numbers are handed out in commit order and a cursor can never skip a change.
The cost is one writer per organisation at a time, which is fine at this
scale.

## Pull

A device asks for the changes after its cursor, the `seq` of the last change it
applied:

```
cursor, limit (at most 500)  →  epoch, changes, nextCursor, hasMore, serverTime
```

Changes come in `seq` order. The device applies them with the merge function
(conflict detection off), stores `nextCursor`, and asks again while `hasMore`
is true. Its own changes come back too and merge as no-ops.

An integration test on a real Postgres runs 20 devices pushing at once while
another device pulls in a loop, and checks the puller receives every change
exactly once. The same test fails when the counter is replaced by a Postgres
sequence.

### Resets

An org's data can be wiped, for the nightly demo reset or a restore from
backup. The server then gives the org a new `epoch`. A device that sees an
epoch different from the one its records came from drops them, rebuilds its
records from the operations still in its outbox, and pulls again from 0. Users
and devices stay signed in, and the change counter keeps counting, so no
number is reused.

## Client

`packages/sync-client` runs on the device. It knows nothing about the UI or the
database: it talks to storage and to the network through two interfaces,
`SyncStorage` and `Transport`, so tests and the simulator can swap both.

- **`mutate()`** is the only way the app writes. It stamps an operation, fills
  `base` from the clocks of the fields being replaced, merges it into the local
  record, and queues it in the outbox, in one atomic write.
- **Push** sends pending operations oldest first, in batches of 100. Applied and
  duplicate operations leave the outbox. If the request fails, the batch goes
  back to pending.
- **Pull** applies changes after the stored cursor through the same merge
  function, moves the clock past every remote stamp, and stores the new cursor
  in the same write.

A sync is a push followed by a pull.

### Clock correction

Every response carries `serverTime`. The client keeps the difference between
server time and device time, and stamps with the corrected time, so a phone
with a wrong clock still produces sensible stamps after its first contact.

### Rejections

- **`CLOCK_DRIFT`:** the operation was stamped before the device knew the
  server's time. The client pulls its clock back to the drift limit (corrected
  time plus 24 hours) and re-issues every pending operation stamped beyond it,
  in order, with a new `opId`. Every stamp the server ever accepted is below
  that limit, so the re-issued operations still sort after the device's
  earlier edits. The cost: the device's stamps can stay up to 24 hours ahead
  until real time catches up.
- **Any other reason:** the operation stays in the outbox as dead, with its
  reason, and is never resent.

In both cases the client fetches the server's copy of each affected record and
rebuilds it from that copy plus the operations still pending, so the device
never keeps an edit the server refused.

## Proof: the simulation

`packages/sim` plays random scenarios with 2 to 5 devices. Each device runs the
real `SyncClient` with a clock wrong by up to two days in either direction,
which can also jump during the run, and talks to the server through a
transport that can:

- be offline;
- lose a response after the server applied the request, so the device retries
  an operation the server already has;
- hold a request back and deliver it later, after the device has retried it,
  so the server sees duplicates out of order.

Between faults, devices edit, delete and restore four shared work orders. At
the end the network heals and every device syncs until nothing is left to
send. The run passes only if every device holds exactly the server's state, no
operation was rejected, and each device's clock only moved forward.

fast-check generates 500 scenarios per run against an in-memory server, and 50
against the real push and pull handlers on Postgres. When a run fails, it
shrinks the scenario to a short one that still fails.

## HTTP

| Method | Path                       | Body or query                | Returns            |
| ------ | -------------------------- | ---------------------------- | ------------------ |
| POST   | `/sync/push`               | `{ ops }`, at most 100       | `PushResponse`     |
| GET    | `/sync/pull`               | `cursor`, `limit` (1 to 500) | `PullResponse`     |
| GET    | `/sync/entities/:type/:id` |                              | `EntityResponse`   |
| POST   | `/auth/login`              | email, password, device      | session            |
| POST   | `/auth/refresh`            | `refreshToken`               | session            |
| GET    | `/users`                   |                              | the org's members  |
| GET    | `/conflicts`               | `open` (default `true`)      | the conflict log   |
| POST   | `/conflicts/:id/review`    |                              | 204                |
| GET    | `/devices`                 |                              | the org's devices  |
| POST   | `/devices/:id/revoke`      |                              | 204                |
| GET    | `/healthz`                 |                              | process is up      |
| GET    | `/readyz`                  |                              | database reachable |

Every `/sync` request carries `X-Protocol-Version` and a bearer token. The
version is checked first, so an outdated app is told to update even when
signed out.

| Status | `error`                | Meaning                                   |
| ------ | ---------------------- | ----------------------------------------- |
| 400    | `BAD_REQUEST`          | Malformed body, query or path             |
| 401    | `UNAUTHORIZED`         | Missing or invalid token                  |
| 401    | `DEVICE_REVOKED`       | An admin locked this device out           |
| 403    | `FORBIDDEN`            | The role may not do this                  |
| 404    | `NOT_FOUND`            | No such device in the org                 |
| 409    | `DEVICE_TAKEN`         | Device id or its clock node already used  |
| 426    | `UNSUPPORTED_PROTOCOL` | The app must update before syncing again  |
| 500    | `INTERNAL`             | Logged on the server; no details returned |

Bodies are limited to 1 MB. A rejected operation inside a push is not an HTTP
error: the request succeeds and the result says why.

## Auth

Passwords are hashed with argon2id. Login registers the device: its id is
generated on the device, and the first 8 characters break clock ties, so they
must be unique within the org.

A session is a 15-minute access token (a signed JWT) and a 30-day refresh token,
stored only as a SHA-256 hash. Each refresh uses up the token and returns a new
one in the same family. A used token coming back means it may have been copied:
the whole family is revoked. The exception is a retry within 60 seconds, which
is a device that never received the answer on a bad network.

An expired access token never blocks local writes: changes wait in the outbox
until the app refreshes. Every request checks the device, so a revoked device
is locked out at once, not when its access token expires.

## Roles

The server checks every pushed operation against the record as it stores it,
and rejects what the user's role may not do with `FORBIDDEN`.

| Action                                 | Technician    | Dispatcher | Admin |
| -------------------------------------- | ------------- | ---------- | ----- |
| Create, delete or restore a work order | no            | yes        | yes   |
| Plan the job                           | no            | yes        | yes   |
| Report progress                        | assigned only | yes        | yes   |
| Read and review the conflict log       | no            | yes        | yes   |
| List and revoke devices                | no            | no         | yes   |

Planning fields are title, description, address, priority, assignee and due
date; progress fields are status and notes.

Fields outside these lists, and other kinds of record, are refused for every
role. A technician who edits an order offline while it is reassigned to someone
else gets the edit rejected on sync, and the device rebuilds the order from the
server. Every device still pulls the whole org: limiting what each one receives
comes later.
