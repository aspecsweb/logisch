## MacOSXParser

Parser für macOS Systemlogs.

### Format
MMM DD HH:mm:ss host service: message

### Unterstützt

- Apple system daemons
- com.apple Logs (Fallback)

### Level Detection

- WARN:
  - deny
  - unexpected
  - unplug

- ERROR:
  - failed
  - exited abnormally

### Besonderheiten

- Year injection: aktuelles Jahr (Syslog-Timestamps enthalten kein Jahr)
- Fallback aktiv bei `com.apple`

### Output

- time
- rawTimestamp
- level
- service = host/service
- message
- color
- raw
