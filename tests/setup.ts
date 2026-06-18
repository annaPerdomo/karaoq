import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom in this setup does not provide a working localStorage, so components
// that read/write it on mount (e.g. saved host/singer names) would throw.
// Supply a minimal in-memory implementation for all tests.
class LocalStorageMock {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return key in this.store ? this.store[key] : null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
  key(index: number): string | null {
    return Object.keys(this.store)[index] ?? null;
  }
  get length(): number {
    return Object.keys(this.store).length;
  }
}

Object.defineProperty(globalThis, "localStorage", {
  value: new LocalStorageMock(),
  writable: true,
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});
