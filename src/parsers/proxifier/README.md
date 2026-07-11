## ProxifierParser

Parser für Proxifier Netzwerklogs.

### Format

`[MM.DD HH:mm:ss] process - proxy:port action`

### Features

- Kein explizites Level-Token → heuristische Erkennung über `detectLevel(undefined, message)`
- Timestamp ohne Jahr → current year injection
- Service = Prozessname direkt aus der Zeile

### Level

Wird über die Fallback-Nachrichten-Heuristik in `detectLevel()` bestimmt (z. B. `FAILED` → `ERROR`), da Proxifier-Logs keinen eigenen Level-Token führen.

### Output

- time
- rawTimestamp
- level
- service
- message
- color
- raw
