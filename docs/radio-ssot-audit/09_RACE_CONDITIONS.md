# Radio Race Conditions

| ID | Race | Impact | Evidence |
|---|---|---|---|
| R1 | socket connect marks ready before room authorization | READY but start forbidden | physically reproduced |
| R2 | Store channel and local channel synchronize through multiple effects | history/PTT room mismatch window | two writable ids |
| R3 | async status polling uses `setInterval` without in-flight exclusion | older response may overwrite newer PlayerStatus | 100 ms polling promises can overlap |
| R4 | rapid play on two cards calls global stop and independent start concurrently | two preparation operations can race for shared AudioFocus | global stop is not serialized with starts |
| R5 | `radio:end` is broadcast before persistence | console READY before history appears | backend order is explicit |
| R6 | socket error/end can execute while local stop is awaiting ACK | sequential setters can restore stale message/operator | separate local facts and refs |
| R7 | `onStart` starts AudioTrack asynchronously while frames may arrive | early frames can call enqueue before track exists | start promise and frame events are independent |
| R8 | frame writes use nonblocking AudioTrack with no retry/jitter queue | partial writes/drop under pressure | returned byte count is ignored by JS |
| R9 | process-local backend arbitration | multi-instance deployment can allow simultaneous transmitters | `activeRadioTransmissions` is in-memory per process |
| R10 | foreground service alive while JS socket is suspended | notification/service can imply availability without frame delivery | service does not own the Socket.IO transport |

Highest priority: R1, R2, R7, R8, R9. R9 cannot be solved only in Mobile and conflicts with a strict no-Backend-change implementation phase.
