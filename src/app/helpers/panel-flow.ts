export type PanelDefinition<T extends string = string> = {
  id: T;
  label?: string;
};

export type PanelProgress<T extends string = string> = {
  panel: T;
  index: number;
  total: number;
  current: number;
  percent: number;
};

export class PanelFlow<T extends string = string> {
  constructor(
    private readonly panelOrder: readonly PanelDefinition<T>[],
    private readonly isPanelEnabled: (panelId: T) => boolean
  ) {}

  isEnabled(panelId: T): boolean {
    return this.isPanelEnabled(panelId);
  }

  getEnabledPanels(): T[] {
    return this.panelOrder
      .filter(panel => this.isPanelEnabled(panel.id))
      .map(panel => panel.id);
  }

  getCurrent(currentPanel: T): T | null {
    const enabledPanels = this.getEnabledPanels();
    if (!enabledPanels.length) return null;

    return enabledPanels.includes(currentPanel)
      ? currentPanel
      : enabledPanels[0];
  }

  getProgress(currentPanel: T): PanelProgress<T> {
    const enabledPanels = this.getEnabledPanels();
    if (!enabledPanels.length) {
      return {
        panel: currentPanel,
        index: 0,
        total: 1,
        current: 1,
        percent: 100,
      };
    }

    const panel = this.getCurrent(currentPanel) ?? enabledPanels[0];
    const index = enabledPanels.indexOf(panel);
    const total = enabledPanels.length;
    const percent = total <= 1 ? 100 : (index / (total - 1)) * 100;

    return {
      panel,
      index,
      total,
      current: index + 1,
      percent,
    };
  }

  canStep(currentPanel: T, direction: number): boolean {
    const enabledPanels = this.getEnabledPanels();
    if (!enabledPanels.length) return false;

    const current = this.getCurrent(currentPanel);
    if (!current) return false;

    const currentIndex = enabledPanels.indexOf(current);
    const delta = direction >= 0 ? 1 : -1;
    const nextIndex = currentIndex + delta;

    return nextIndex >= 0 && nextIndex < enabledPanels.length;
  }

  step(currentPanel: T, direction: number): T | null {
    const enabledPanels = this.getEnabledPanels();
    if (!enabledPanels.length) return null;

    const current = this.getCurrent(currentPanel);
    if (!current) return null;

    const currentIndex = enabledPanels.indexOf(current);
    const delta = direction >= 0 ? 1 : -1;
    const nextIndex = currentIndex + delta;

    if (nextIndex < 0 || nextIndex >= enabledPanels.length) return null;
    return enabledPanels[nextIndex];
  }

  select(panelId: T): T | null {
    return this.isPanelEnabled(panelId) ? panelId : null;
  }
}