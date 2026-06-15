## AndroidParser

Parst Android Logcat Logs in zwei unterstützten Formaten.

### Unterstützte Formate

- Format A: `MM-DD HH:mm:ss.SSS PID TID LEVEL TAG: message`
- Format B: `YYYY-MM-DD HH:mm:ss.SSS PID-TID TAG LEVEL message`

### Features

- Erkennt Log-Level: V, D, I, W, E, F
- Zwei Regex-Formate für unterschiedliche Android-Ausgaben
- Farbzuordnung pro Level
- Fallback-Farbgenerierung via HSL
- Zeitkonvertierung mit aktueller Jahresannahme (Format A)

### Besonderheiten

- Format A nutzt `parseMockEpoch()` → ergänzt aktuelles Jahr
- Format B nutzt direkte ISO-Zeit
- PID/TID werden extrahiert und gespeichert

### Output

- time (ms epoch)
- rawTimestamp
- level
- service (tag)
- message
- color
- pid / tid
- raw line