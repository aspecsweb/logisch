## WindowsCbsParser

Parser für Windows CBS / CSI Logs.

### Format
YYYY-MM-DD HH:mm:ss, LEVEL COMPONENT message

### Features

- Direct ISO timestamp parsing
- Windows severity normalization
- CBS / CSI system log support

### Level Logic

- ERROR / FAILED → ERROR
- WARNING / UNRECOGNIZED → WARN

### Output

- time
- rawTimestamp
- level
- service = Windows/component
- message
- color
- raw