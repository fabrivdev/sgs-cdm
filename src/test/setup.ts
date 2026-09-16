import "@testing-library/jest-dom";

class TestIntersectionObserver {
  constructor(private callback: (entries: Array<{ isIntersecting: boolean }>) => void) {}
  observe() { setTimeout(() => this.callback([{ isIntersecting: true }]), 0); }
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}
Object.defineProperty(window, "IntersectionObserver", { writable: true, value: TestIntersectionObserver });
Object.defineProperty(globalThis, "IntersectionObserver", { writable: true, value: TestIntersectionObserver });

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
