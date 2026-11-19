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
off.
