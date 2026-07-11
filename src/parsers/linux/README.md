## LinuxSyslogParser

Parser für klassische Linux Syslog Einträge.

### Format
MMM DD HH:mm:ss host service: message

### Features

- Host + Service Trennung
- Year injection (aktuelles Jahr, da Syslog-Timestamps kein Jahr enthalten)
- Security-aware severity detection
- Auth-spezifische Logik

### Level Logik

- "AUTHENTICATION FAILURE" → ERROR
- "FAILED", "UNKNOWN" → WARN
- Default → INFO

### Output

- time (parsed + year injection)
- rawTimestamp
- level
- service = host/service
- message
- color
- raw