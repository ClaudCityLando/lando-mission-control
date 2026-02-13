import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { InfoPopover } from "@/features/mission-control/components/InfoPopover";

afterEach(cleanup);

const renderPopover = (side?: "top" | "right" | "bottom" | "left") =>
  render(
    createElement(
      InfoPopover,
      { title: "Test Panel", side, children: createElement("p", null, "Detailed explanation here.") },
    ),
  );

describe("InfoPopover", () => {
  it("renders a trigger button with an accessible label", () => {
    renderPopover();
    const btn = screen.getByRole("button", { name: /info: test panel/i });
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens the popover on click", () => {
    renderPopover();
    const btn = screen.getByRole("button", { name: /info: test panel/i });
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Detailed explanation here.")).toBeTruthy();
  });

  it("closes the popover on second click (toggle)", () => {
    renderPopover();
    const btn = screen.getByRole("button", { name: /info: test panel/i });
    fireEvent.click(btn);
    expect(screen.queryByRole("dialog")).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes the popover on Escape key", () => {
    renderPopover();
    const btn = screen.getByRole("button", { name: /info: test panel/i });
    fireEvent.click(btn);
    expect(screen.queryByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes the popover on outside click", () => {
    renderPopover();
    const btn = screen.getByRole("button", { name: /info: test panel/i });
    fireEvent.click(btn);
    expect(screen.queryByRole("dialog")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the title in the popover header", () => {
    renderPopover();
    fireEvent.click(screen.getByRole("button", { name: /info: test panel/i }));
    expect(screen.getByText("Test Panel")).toBeTruthy();
  });

  it("has a close button inside the popover", () => {
    renderPopover();
    fireEvent.click(screen.getByRole("button", { name: /info: test panel/i }));
    const closeBtn = screen.getByRole("button", { name: /close/i });
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
