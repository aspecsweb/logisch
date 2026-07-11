## SparkParser

Parser für Apache Spark Logs.

### Format

`yy/MM/dd HH:mm:ss LEVEL service: message`

### Features

- Konvertiert zweistelliges Jahr (`yy`) zu `20yy`
- Erkennt die Spark-Service-Komponente vor dem Doppelpunkt
- Level via `detectLevel(rawLevel, message)`

### Output

- time
- rawTimestamp
- level
- service
- message
- color
- raw
