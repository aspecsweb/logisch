import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "parsers/apache/index": "src/parsers/apache/index.ts",
    "parsers/android/index": "src/parsers/android/index.ts",
    "parsers/bgl/index": "src/parsers/bgl/index.ts",
    "parsers/fallback/index": "src/parsers/fallback/index.ts",
    "parsers/linux/index": "src/parsers/linux/index.ts",
    "parsers/macos/index": "src/parsers/macos/index.ts",
    "parsers/openssh/index": "src/parsers/openssh/index.ts",
    "parsers/proxifier/index": "src/parsers/proxifier/index.ts",
    "parsers/spark/index": "src/parsers/spark/index.ts",
    "parsers/thunderbird/index": "src/parsers/thunderbird/index.ts",
    "parsers/windows/index": "src/parsers/windows/index.ts",
    "parsers/zookeeper/index": "src/parsers/zookeeper/index.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  shims: true,
  clean: true,
  splitting: true,
});
