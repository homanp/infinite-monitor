import { describe, it, expect } from "vitest";
import { sanitizePath, validatePackages } from "@/lib/widget-runner";

describe("sanitizePath", () => {
  it("accepts valid src/ paths", () => {
    expect(sanitizePath("src/App.tsx")).toBe("src/App.tsx");
    expect(sanitizePath("src/components/Chart.tsx")).toBe("src/components/Chart.tsx");
  });

  it("normalizes backslashes to forward slashes", () => {
    expect(sanitizePath("src\\components\\Chart.tsx")).toBe("src/components/Chart.tsx");
  });

  it("rejects absolute paths", () => {
    expect(() => sanitizePath("/etc/passwd")).toThrow("Invalid path");
  });

  it("rejects path traversal with ..", () => {
    expect(() => sanitizePath("src/../etc/passwd")).toThrow("Invalid path");
    expect(() => sanitizePath("..")).toThrow("Invalid path");
  });

  it("rejects paths not under src/", () => {
    expect(() => sanitizePath("public/index.html")).toThrow("Path must be under src/");
    expect(() => sanitizePath("package.json")).toThrow("Path must be under src/");
  });
});

describe("validatePackages", () => {
  it("accepts valid package names", () => {
    expect(() => validatePackages(["react", "lodash"])).not.toThrow();
  });

  it("accepts scoped packages", () => {
    expect(() => validatePackages(["@types/react", "@ai-sdk/openai"])).not.toThrow();
  });

  it("accepts packages with version specifiers", () => {
    expect(() => validatePackages(["react@18.2.0", "lodash@^4.17"])).not.toThrow();
  });

  it("accepts empty array", () => {
    expect(() => validatePackages([])).not.toThrow();
  });

  it("rejects packages with shell injection attempts", () => {
    expect(() => validatePackages(["react; rm -rf /"])).toThrow("Invalid package name");
    expect(() => validatePackages(["$(whoami)"])).toThrow("Invalid package name");
  });

  it("rejects empty string package name", () => {
    expect(() => validatePackages([""])).toThrow("Invalid package name");
  });
});
