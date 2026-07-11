## ThunderbirdParser

Parser für Thunderbird-Cluster-Logs (HPC-Knoten-Topologien).

### Format

`- epoch yyyy.mm.dd node MMM DD HH:mm:ss node service: message`

### Features

- Epoch-basierte Zeit (Sekunden → ms)
- Node- und Service-Gruppierung
- Cluster-bewusste Service-Benennung

### Level Logik

- "got not answer", "failed", "error" → ERROR
- "warning", "disconnected" → WARN
- Default → INFO

### Output

- time (epoch × 1000)
- rawTimestamp
- level
- service = Thunderbird/node/service
- message
- color
- raw
