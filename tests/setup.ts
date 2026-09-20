import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// vitest doesn't run with Jest's `globals: true` here (see vitest.config.ts),
// so @testing-library/react's own auto-cleanup (which relies on detecting a
// global `afterEach`) never registers on its own. Without this, every
// render() in a `tests/components/**` file leaks its DOM into the next test
// in the same file — confirmed empirically while adding this repo's first
// component test (IndicatorPicker.test.tsx): a later test's queries matched
// duplicate nodes left over from an earlier test's render().
afterEach(() => {
  cleanup();
});
