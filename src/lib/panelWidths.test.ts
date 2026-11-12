import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { clampPanelWidth } from "./panelWidths";

describe("panel widths", () => {
  it("clamps to the inclusive min and max", () => {
    assert.equal(clampPanelWidth(100, 220, 600), 220);
    assert.equal(clampPanelWidth(900, 220, 600), 600);
    assert.equal(clampPanelWidth(300, 220, 600), 300);
  });

  it("rounds and rejects non-finite values", () => {
    assert.equal(clampPanelWidth(280.6, 220, 600), 281);
    assert.equal(clampPanelWidth(Number.NaN, 220, 600), 220);
  });
});
