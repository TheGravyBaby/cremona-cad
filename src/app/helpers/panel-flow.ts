export type PanelDefinition<T extends string = string> = {
  id: T;
  label?: string;
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

  canStep(currentPanel: T, direction: number): boolean {
    const enabledPanels = this.getEnabledPanels();
    if (!enabledPanels.length) return false;

    const current = enabledPanels.includes(currentPanel) ? currentPanel : enabledPanels[0];
    const currentIndex = enabledPanels.indexOf(current);
    const delta = direction >= 0 ? 1 : -1;
    const nextIndex = currentIndex + delta;

    return nextIndex >= 0 && nextIndex < enabledPanels.length;
  }

  step(currentPanel: T, direction: number): T | null {
    const enabledPanels = this.getEnabledPanels();
    if (!enabledPanels.length) return null;

    const current = enabledPanels.includes(currentPanel) ? currentPanel : enabledPanels[0];
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