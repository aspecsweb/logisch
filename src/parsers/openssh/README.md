## OpenSSHParser

Parser für SSHD / PAM Logs.

### Format
MMM DD HH:mm:ss host sshd: message

### Besonderheiten

- Year injection: aktuelles Jahr (Syslog-Timestamps enthalten kein Jahr)

### Security Levels

- FATAL:
  - BREAK-IN ATTEMPT
  - TOO MANY AUTH FAILURES

- ERROR:
  - AUTH FAILURE
  - FAILED PASSWORD

- WARN:
  - INVALID USER
  - UNKNOWN

### Ziel

Security Monitoring / Intrusion Detection

### Output

- time
- rawTimestamp
- level (INFO/WARN/ERROR/FATAL)
- service = host/sshd
- message
- color
- raw