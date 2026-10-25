'use strict';

// The settings pane. Three fields and a note about the link syntax, because the syntax
// is the part a reader has to know and the settings are the part they rarely touch.

const { PluginSettingTab, Setting } = require('obsidian');
const { t } = require('./i18n');

class HoverPreviewSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName(t('settings.enabled.name'))
      .setDesc(t('settings.enabled.desc'))
      // `toggle`, not `t`: the letter name shadows the i18n helper this file imported.
      .addToggle((toggle) =>
        toggle.setValue(!!this.plugin.settings.enabled).onChange(async (v) => {
          this.plugin.settings.enabled = v;
          await this.plugin.saveSettings();
          if (!v) this.plugin.preview.hide();
        }),
      );

    new Setting(containerEl)
      .setName(t('settings.modifier.name'))
      .setDesc(t('settings.modifier.desc'))
      .addDropdown((d) => {
        d.addOption('ctrl', t('settings.modifier.ctrl'));
        d.addOption('shift', t('settings.modifier.shift'));
        d.addOption('alt', t('settings.modifier.alt'));
        d.addOption('none', t('settings.modifier.none'));
        d.addOption('custom', t('settings.modifier.custom'));
        d.setValue(this.plugin.settings.hoverModifier || 'ctrl');
        d.onChange(async (v) => {
          this.plugin.settings.hoverModifier = v;
          await this.plugin.saveSettings();
          // The custom row and the plain-hover hint come and go with the choice.
          this.display();
        });
      });

    if (this.plugin.settings.hoverModifier === 'custom') {
      new Setting(containerEl).setDesc(t('settings.modifier.customDesc'));
      // One row per key: the key's name is the row's name, so a reader can tell which
      // switch belongs to which key. One Setting with three toggles and three names in
      // its description put the names in an order nothing tied to the switches.
      for (const key of ['ctrl', 'shift', 'alt']) {
        const list = this.plugin.settings.hoverModifiers || [];
        new Setting(containerEl)
          .setName(t('settings.modifier.' + key))
          .addToggle((tg) =>
            tg
              .setValue(list.includes(key))
              .onChange(async (on) => {
                const set = new Set(this.plugin.settings.hoverModifiers || []);
                if (on) set.add(key); else set.delete(key);
                this.plugin.settings.hoverModifiers = ['ctrl', 'shift', 'alt'].filter((k) => set.has(k));
                await this.plugin.saveSettings();
              }),
          );
      }
      // Every switch off is a misconfiguration the plugin answers with the default key, not
      // a silent plain hover indistinguishable from `none`: say so where the switches are.
      if (!(this.plugin.settings.hoverModifiers || []).some((k) => k === 'ctrl' || k === 'shift' || k === 'alt')) {
        containerEl.createDiv({ cls: 'cp-settings-note', text: t('settings.modifier.customEmptyHint') });
      }
    }

    if (this.plugin.settings.hoverModifier === 'none') {
      containerEl.createDiv({ cls: 'cp-settings-note', text: t('settings.modifier.noneHint') });
    }

    // The syntax is the interface, so it is written out here rather than buried in a
    // README the reader may never open.
    const help = containerEl.createDiv({ cls: 'cp-settings-help' });
    help.createEl('p', { text: t('settings.help.code') });
    help.createEl('pre', {
      text: '[the parser](../src/main.c#L18)\n[the loop](../src/main.c#L18-23)',
    });
    help.createEl('p', { text: t('settings.help.repo') });
    help.createEl('pre', {
      text: '[upstream](https://github.com/owner/repo/blob/main/src/main.c#L18-L23)',
    });
    help.createEl('p', { text: t('settings.help.web') });
    help.createEl('pre', {
      text: '[install](https://example.com/page#install)\n'
        + '[intro](https://example.com/page#-#install)\n'
        + '[install to usage](https://example.com/page#install-usage)\n'
        + '[install onward](https://example.com/page#install-)',
    });
    help.createEl('p', { cls: 'cp-settings-note', text: t('settings.help.webForms') });
    help.createEl('p', { cls: 'cp-settings-note', text: t('settings.help.note') });
  }
}

module.exports = { HoverPreviewSettingTab };
