## ZookeeperParser

Parser für Apache Zookeeper Logs.

### Format
YYYY-MM-DD HH:mm:ss,SSS LEVEL [component] message

### Features

- Full timestamp with milliseconds
- Component extraction from brackets
- detectLevel fallback logic

### Output

- time
- rawTimestamp
- level
- service = component
- message
- color
- raw