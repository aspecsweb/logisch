---
name: Request New Log Parser
about: Want support for an unsupported log fomat?
title: Add Log Parser for [name]
labels: enhancement
assignees: ''
type: Feature
---

## Log Format Overview

Describe the log source you want supported.

- System / Tool / Service:
- Version (if relevant):
- Typical use case:

---

## Example Log Lines

Provide real examples (at least 3–10 lines if possible):

---

## Key Fields to Extract

List the important structured fields:

- timestamp:
- log level:
- message:
- service/module:
- error codes:
- other:

---

## Expected Output (`LogEntry`)

Describe or sketch the desired parsed structure:

```ts
{
  timestamp: "",
  level: "",
  message: "",
  raw: "",
}
``

## Edge Cases

- Any special cases or tricky formats?
- multiline logs:
- stack traces:
- locale/time formats:
- encoding issues:
- inconsistent formatting:

## Additional Context

Anything else useful (docs, links, screenshots, sample files).
