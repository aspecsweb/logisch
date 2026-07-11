## FallbackParser

Heuristischer Safety-Net-Parser für Logformate, die keinem dedizierten Parser entsprechen.

### Funktionsweise

- `canParse()` gibt immer `true` zurück — dient als letzter Parser in der Registry-Kette
- Sucht die Zeile nach einer Reihe bekannter Timestamp-Muster ab (der Reihe nach, erster Treffer gewinnt):
  - ISO 8601 (`2024-03-15T10:30:00Z`, mit optionalen Millisekunden/Offset)
  - Klassischer Syslog (`Oct 25 14:32:10`, Jahr wird als aktuelles Jahr angenommen)
  - Android-artig (`MM-DD HH:mm:ss.SSS`, Jahr wird als aktuelles Jahr angenommen)
  - Slash-getrennt (`yy/MM/dd HH:mm:ss` bzw. `yyyy/MM/dd HH:mm:ss`)
  - 13-stelliger Epoch (Millisekunden)
  - 10-stelliger Epoch (Sekunden → wird auf ms hochgerechnet)
- Gibt `null` zurück, wenn kein Muster einen gültigen Timestamp liefert

### Level Logik

Eigenständige Musterliste (unabhängig von `BaseParser.detectLevel`), sortiert nach Priorität:

- FATAL: CRITICAL, EMERG, ALERT, CRIT
- ERROR: ERR, EXCEPTION, SEVERE
- WARN: WARNING, NOTICE
- INFO: INFORMATION
- DEBUG: TRACE, VERBOSE, FINE
- Default: INFO

### Service-Erkennung

Untersucht den Text direkt nach dem gefundenen Timestamp:

- Geklammerter Ausdruck (`[Service]`, `(Service)`, `{Service}`)
- Oder ein `Service:`-Präfix, sofern es kein Level-Token ist
- Andernfalls leerer String

### Output

- time
- rawTimestamp
- level
- service (kann leer sein)
- message (vollständige Rohzeile)
- color
- raw
