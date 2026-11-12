import { useCallback, useEffect, useState } from "react";
import {
  clampStoredPanelWidth,
  defaultPanelWidth,
  loadPanelWidth,
  maxPanelWidth,
  minPanelWidth,
  savePanelWidth,
  type PanelId,
} from "../lib/panelWidths";

export function useResizablePanel(id: PanelId) {
  const [width, setWidthState] = useState(() => loadPanelWidth(id));

  const setWidth = useCallback(
    (next: number) => {
      setWidthState(clampStoredPanelWidth(id, next));
    },
    [id],
  );

  const commit = useCallback(
    (next: number) => {
      const width = clampStoredPanelWidth(id, next);
      setWidthState(width);
      savePanelWidth(id, width);
    },
    [id],
  );

  const reset = useCallback(() => {
    commit(defaultPanelWidth(id));
  }, [commit, id]);

  useEffect(() => {
    const onResize = () => {
      setWidthState((current) => clampStoredPanelWidth(id, current));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [id]);

  return {
    width,
    setWidth,
    commit,
    reset,
    min: minPanelWidth(id),
    max: maxPanelWidth(id),
  };
}
