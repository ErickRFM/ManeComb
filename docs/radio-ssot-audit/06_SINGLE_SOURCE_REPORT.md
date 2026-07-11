# Single Source Report

| Datum | Producer | Status | Evidence |
|---|---|---|---|
| `currentPosition` | MediaPlayer | PASS | native status map, one card session |
| `duration` | MediaPlayer after prepare | PASS | persisted duration only shown before prepare |
| history waveform level | card Visualizer | PASS | one Visualizer stored in `RadioPlayerSession` |
| TX waveform level | AudioRecord PCM peak | PASS | one 20 ms capture frame producer |
| RX waveform level | received PCM peak | PASS | one enqueue producer while receiving |
| history messages | global Store | PASS | backend/REST hydrate into one collection |
| connection shown by Radio | dedicated realtime service | PASS | global socket state no longer rendered |
| AudioFocus owner | native audio module singleton | PARTIAL | one focus request object shared across independent players |
| recording state | React state | PARTIAL | mirrored in `recordingStateRef` |
| radio phase | React derived value | PARTIAL | mirrored in `radioPhaseRef` for logs |
| selected channel | local id + Store active conversation | FAIL | two writable producers synchronized by effects |
| selected conversation | global Store | PARTIAL | Radio copies it into local channel selection |
| PTT availability | React calculation | PARTIAL | depends on network, dedicated connection, channel, permissions and submission state |
| transmission state | several live facts | PARTIAL | recording/receiving/busy/id refs can diverge on error races |
| channel authorization | backend | FAIL | UI ready state does not wait for `radio:join` ACK |
| background state | Android service + JS lifecycle | FAIL | no single producer confirms that reception is active |

Certification result: FAIL. At least selected channel and channel authorization have multiple or incomplete sources.
