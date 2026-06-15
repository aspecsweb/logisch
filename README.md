# Logisch

> Built for [www.logier.dev](https://www.logier.dev)

## Description

`logisch` is a log parsing engine built with TypeScript. It transforms raw, unstructured log lines from various operating systems, databases, and application frameworks into typed, predictable `LogEntry` structures.

The package is optimized for bundlers and supports modern **subpath exports**, allowing you to import only the specific parsers your application needs without bloat.

### Available Subpath Modules

You can import parsers individually to keep your production bundles minimal:

- `logisch/android` - Android Logcat (Formats A & B)
- `logisch/apache` - Apache Server Error Logs
- `logisch/bgl` - IBM Blue Gene/L Supercomputer Logs
- `logisch/linux` - Linux System & Authentication Logs
- `logisch/macos` - Apple macOS Diagnostic Daemon Logs
- `logisch/openssh` - OpenSSH Daemon Security Audits
- `logisch/proxifier` - Proxifier Network Traffic Logs
- `logisch/spark` - Apache Spark Data Engine Logs
- `logisch/thunderbird` - Thunderbird Cluster Topologies
- `logisch/windows` - Windows CBS/CSI Servicing Logs
- `logisch/zookeeper` - Apache ZooKeeper Coordination Logs
- `logisch/fallback` - Heuristic Safety-Net Parser

## Installation

```sh
npm install logisch
```

## Quick Start

Using Specific Subpath Parsers

```Typescript
import { ApacheParser } from "logisch/apache";

const parser = new ApacheParser();
const line = '[Sun Dec 04 04:47:44 2005] [notice] workerEnv.init() ok';

if (parser.canParse(line)) {
  const logEntry = parser.parse(line, line);
  console.log(logEntry);
}
```

## Local Dev Setup

Follow these steps to set up the project locally for development:

1. Clone the repo: `git clone https://github.com/aspecsweb/logisch.git`

2. Navigate to the project directory `cd logisch`

3. Install dependencies `npm install`

4. Link for local application development:

To test changes live inside your frontend application without publishing, use [npm link](https://docs.npmjs.com/cli/v9/commands/npm-link)
Then, in your web app's root directory, run: `npm link logisch`
Build the package: `npm run build`