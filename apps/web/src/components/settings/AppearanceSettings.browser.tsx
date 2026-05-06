import "../../index.css";

import { page } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import {
  ACTIVE_THEME_STORAGE_KEY,
  CUSTOM_THEMES_STORAGE_KEY,
  THEME_STYLE_ELEMENT_ID,
} from "../../themes/registry";
import { AppearanceSettingsPanel } from "./AppearanceSettings";

describe("AppearanceSettingsPanel", () => {
  let mounted:
    | (Awaited<ReturnType<typeof render>> & {
        cleanup?: () => Promise<void>;
        unmount?: () => Promise<void>;
      })
    | null = null;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    document.getElementById(THEME_STYLE_ELEMENT_ID)?.remove();
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(async () => {
    if (mounted) {
      const teardown = mounted.cleanup ?? mounted.unmount;
      await teardown?.call(mounted).catch(() => {});
    }
    mounted = null;
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = "";
    document.documentElement.className = "";
    document.getElementById(THEME_STYLE_ELEMENT_ID)?.remove();
  });

  it("lists built-in themes and applies a selected built-in theme", async () => {
    mounted = await render(<AppearanceSettingsPanel />);

    await expect.element(page.getByText("Default", { exact: true })).toBeInTheDocument();
    await expect.element(page.getByText("Solarized Dark", { exact: true })).toBeInTheDocument();
    await expect.element(page.getByText("Nord", { exact: true })).toBeInTheDocument();

    await page.getByRole("radio", { name: /Nord/ }).click();

    expect(localStorage.getItem(ACTIVE_THEME_STORAGE_KEY)).toBe("nord");
    await vi.waitFor(() => {
      expect(document.getElementById(THEME_STYLE_ELEMENT_ID)?.textContent).toContain("#2e3440");
    });
  });

  it("adds, duplicates, and deletes custom themes", async () => {
    mounted = await render(<AppearanceSettingsPanel />);

    await page.getByRole("button", { name: "Create a new theme" }).click();
    await expect.element(page.getByRole("radio", { name: /New theme/ })).toBeInTheDocument();
    expect(localStorage.getItem(ACTIVE_THEME_STORAGE_KEY)).toBe("custom-new");

    await page.getByRole("button", { name: /Duplicate Default/ }).click();
    await expect.element(page.getByRole("radio", { name: /Default \(Copy\)/ })).toBeInTheDocument();

    await page.getByRole("button", { name: "Delete New theme" }).click();
    await expect.element(page.getByText("Delete custom theme?")).toBeInTheDocument();
    await page.getByRole("button", { name: "Delete theme" }).click();

    await expect.element(page.getByRole("radio", { name: /New theme/ })).not.toBeInTheDocument();
    expect(localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY)).not.toContain("custom-new");
  });
});
