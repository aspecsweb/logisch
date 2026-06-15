## ProxifierParser

Parser für Proxifier Netzwerklogs.

### Format

[MM.DD HH:mm:ss] process - proxy:port action

### Features

- Kein expliziter Level → heuristisch
- Timestamp ohne Jahr → current year injection
- Service = process name

### Level

- via detectLevel(message)

### Output

- time
- rawTimestamp
- level
- service
- message
- color
- raw
  📄 SparkParser.md

## SparkParser

Parser für Apache Spark Logs.

### Format

yy/MM/dd HH:mm:ss LEVEL service: message

### Features

- Converts yy → 20yy
- Detects Spark service component
- Level via detectLevel()

### Output

- time
- rawTimestamp
- level
- service
- message
- color
- raw
