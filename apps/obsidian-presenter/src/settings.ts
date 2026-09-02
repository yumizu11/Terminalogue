import { PluginSettingTab, Setting, type Plugin } from 'obsidian';
import type { PresenterSettings } from './settings-defaults.js';

/** The settings tab: where Marp CLI is, and whether a presentation opens itself. */

export { DEFAULT_SETTINGS } from './settings-defaults.js';
export type { PresenterSettings } from './settings-defaults.js';

/** What the settings tab needs from the plugin that owns it. */
export interface PresenterSettingsHost extends Plugin {
  settings: PresenterSettings;
  saveSettings(): Promise<void>;
  /** Runs `marp --version` and reports, in one sentence, what it found. */
  testMarp(): Promise<string>;
}

export class PresenterSettingTab extends PluginSettingTab {
  constructor(private readonly host: PresenterSettingsHost) {
    super(host.app, host);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Marp executable')
      .setDesc(
        'Path to the Marp CLI executable. Leave this empty to look for "marp" on PATH — ' +
          'set it explicitly when Obsidian was started from a launcher, because its PATH is ' +
          'often shorter than a terminal’s.',
      )
      .addText((text) =>
        text
          .setPlaceholder('marp')
          .setValue(this.host.settings.marpExecutable)
          .onChange(async (value) => {
            this.host.settings.marpExecutable = value;
            await this.host.saveSettings();
          }),
      )
      .addButton((button) =>
        button.setButtonText('Test Marp').onClick(async () => {
          button.setDisabled(true);
          status.setText('Running marp --version…');
          try {
            status.setText(await this.host.testMarp());
          } finally {
            button.setDisabled(false);
          }
        }),
      );

    const status = containerEl.createEl('p');
    status.style.marginTop = '0';
    status.style.opacity = '0.75';

    new Setting(containerEl)
      .setName('Open browser automatically')
      .setDesc('Open the presentation in the default browser once it has been generated.')
      .addToggle((toggle) =>
        toggle.setValue(this.host.settings.openBrowserAutomatically).onChange(async (value) => {
          this.host.settings.openBrowserAutomatically = value;
          await this.host.saveSettings();
        }),
      );
  }
}
