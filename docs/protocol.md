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
