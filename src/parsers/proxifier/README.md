## ThunderbirdParser

Parser für Cluster / Thunderbird Logs.

### Format
epoch yyyy.mm.dd node syslog process: message

### Features

- Epoch-based time (seconds → ms)
- Node + process grouping
- Cluster-aware service naming

### Level Logic

- error / failed → ERROR
- warning / disconnected → WARN

### Output

- time
- rawTimestamp
- level
- service = Thunderbird/node/service
- message
- color
- raw