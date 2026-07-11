## BGLParser

Parser für IBM Blue Gene/L Supercomputer RAS-Logs.

### Format
AlertFlag Epoch Date Node Date Node RAS Layer Level Message

### Features

- Epoch-basierte Zeit (Sekunden → ms)
- Alert-Flag-Erkennung (`-` = normal, alles andere = Alert)
- Level-Normalisierung via `detectLevel()`
- Service = Layer/Node

### Level Logik

- Level wird aus dem RAS-Level-Token via `detectLevel()` bestimmt
- Ist das Alert-Flag gesetzt und der erkannte Level `INFO`, wird er auf `WARN` hochgestuft
- Bei einem Alert wird der Nachricht ein `[ALERT_CAT: <flag>]`-Präfix vorangestellt

### Output

- time (epoch × 1000)
- rawTimestamp
- level
- service = layer/node
- message (inkl. optionalem Alert-Präfix)
- color
- raw
