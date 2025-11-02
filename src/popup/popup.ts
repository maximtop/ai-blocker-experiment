import {
    ACTIONS,
    DEFAULT_EMBEDDING_THRESHOLD,
    DEFAULT_PROMPT_THRESHOLD,
    DEFAULT_VISION_THRESHOLD,
    SETTINGS_KEYS,
} from '../shared/constants';
import { createLogger } from '../shared/logger';
import { Messaging } from '../shared/messaging';
import type { Rule } from '../shared/rule-types';
import { Translator } from '../shared/translator';

const logger = createLogger('Popup');

/**
 * Popup class handles all popup operations
 */
export class Popup {
    // State properties
    rules: Rule[];

    blockingEnabled: boolean;

    embeddingThreshold: number;

    promptThreshold: number;

    visionThreshold: number;

    thresholdsCollapsed: boolean;

    // DOM element properties (assigned during init before use)
    rulesContainer!: HTMLElement;

    emptyRules!: HTMLElement;

    ruleInput!: HTMLInputElement;

    addRuleBtn!: HTMLElement;

    settingsBtn!: HTMLElement;

    enabledToggle!: HTMLInputElement;

    toggleSwitch!: HTMLElement;

    toggleStatus!: HTMLElement;

    stats!: HTMLElement;

    status!: HTMLElement;

    embeddingThresholdSlider!: HTMLInputElement;

    embeddingThresholdValue!: HTMLElement;

    promptThresholdSlider!: HTMLInputElement;

    promptThresholdValue!: HTMLElement;

    visionThresholdSlider!: HTMLInputElement;

    visionThresholdValue!: HTMLElement;

    thresholdToggle!: HTMLElement;

    thresholdControls!: HTMLElement;

    thresholdToggleIcon!: HTMLElement;

    constructor() {
        this.rules = []; // Now stores full rule objects with enabled state
        this.blockingEnabled = true;
        this.embeddingThreshold = DEFAULT_EMBEDDING_THRESHOLD;
        this.promptThreshold = DEFAULT_PROMPT_THRESHOLD;
        this.visionThreshold = DEFAULT_VISION_THRESHOLD;
        this.thresholdsCollapsed = true;
    }

    /**
     * Initialize the popup manager
     */
    init() {
        document.addEventListener('DOMContentLoaded', async () => {
            // Assign DOM refs
            this.rulesContainer = document.getElementById('rulesContainer')!;
            this.emptyRules = document.getElementById('emptyRules')!;
            this.ruleInput = document.getElementById('ruleInput') as HTMLInputElement;
            this.addRuleBtn = document.getElementById('addRuleBtn')!;
            this.settingsBtn = document.getElementById('settingsBtn')!;
            this.enabledToggle = document.getElementById('enabledToggle') as HTMLInputElement;
            this.toggleSwitch = document.getElementById('toggleSwitch')!;
            this.toggleStatus = document.getElementById('toggleStatus')!;
            this.stats = document.getElementById('stats')!;
            this.status = document.getElementById('status')!;
            this.embeddingThresholdSlider = document.getElementById(
                'embeddingThreshold',
            ) as HTMLInputElement;
            this.embeddingThresholdValue = document.getElementById(
                'embeddingThresholdValue',
            )!;
            this.promptThresholdSlider = document.getElementById(
                'promptThreshold',
            ) as HTMLInputElement;
            this.promptThresholdValue = document.getElementById(
                'promptThresholdValue',
            )!;
            this.visionThresholdSlider = document.getElementById(
                'visionThreshold',
            ) as HTMLInputElement;
            this.visionThresholdValue = document.getElementById(
                'visionThresholdValue',
            )!;
            this.thresholdToggle = document.getElementById(
                'thresholdToggle',
            )!;
            this.thresholdControls = document.getElementById(
                'thresholdControls',
            )!;
            this.thresholdToggleIcon = this.thresholdToggle.querySelector(
                '.threshold-toggle-icon',
            )!;

            Popup.initializeLocalization();

            await this.loadSettings();
            await this.loadThresholds();
            this.updateRulesDisplay();

            this.setupEventListeners();
        });
    }

    /**
     * Set up all event listeners
     */
    setupEventListeners() {
        // Event handlers
        this.addRuleBtn.addEventListener('click', () => this.addRule());

        this.ruleInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addRule();
            }
        });

        this.settingsBtn.addEventListener('click', async () => {
            await Popup.openOptionsTab('models');
        });

        // Open options page when clicking rule format link
        const ruleFormatLink = document.getElementById('ruleFormatLink')!;
        ruleFormatLink.addEventListener('click', async (e) => {
            e.preventDefault();
            await Popup.openOptionsTab('rules');
        });

        // Toggle blocking on/off
        this.toggleSwitch.addEventListener('click', () => {
            this.enabledToggle.checked = !this.enabledToggle.checked;
            this.enabledToggle.dispatchEvent(new Event('change'));
        });

        this.enabledToggle.addEventListener('change', async () => {
            this.blockingEnabled = this.enabledToggle.checked;
            this.updateToggleStatus();
            await this.saveSettings();

            if (!this.blockingEnabled) {
                this.showStatus(
                    'Blocking disabled - reload page to see changes',
                    'warning',
                );
            } else {
                this.showStatus(
                    'Blocking enabled - reload page to apply rules',
                    'success',
                );
            }
        });

        // Threshold toggle
        this.thresholdToggle.addEventListener('click', () => {
            this.toggleThresholds();
        });

        // Threshold sliders
        this.embeddingThresholdSlider.addEventListener('input', (e: Event) => {
            const value = parseInt((e.target as HTMLInputElement).value, 10);
            this.embeddingThreshold = value / 100;
            this.embeddingThresholdValue.textContent = `${value}%`;
        });

        this.embeddingThresholdSlider.addEventListener('change', async () => {
            await this.saveEmbeddingThreshold();
        });

        this.promptThresholdSlider.addEventListener('input', (e: Event) => {
            const value = parseInt((e.target as HTMLInputElement).value, 10);
            this.promptThreshold = value / 100;
            this.promptThresholdValue.textContent = `${value}%`;
        });

        this.promptThresholdSlider.addEventListener('change', async () => {
            await this.savePromptThreshold();
        });

        this.visionThresholdSlider.addEventListener('input', (e: Event) => {
            const value = parseInt((e.target as HTMLInputElement).value, 10);
            this.visionThreshold = value / 100;
            this.visionThresholdValue.textContent = `${value}%`;
        });

        this.visionThresholdSlider.addEventListener('change', async () => {
            await this.saveVisionThreshold();
        });

        // Event delegation for dynamic buttons
        document.addEventListener('click', (e: Event) => {
            const target = e.target as HTMLElement;

            // Edit rule buttons
            if (target.classList.contains('edit') && target.dataset.index) {
                this.startEditRule(parseInt(target.dataset.index, 10));
            }

            // Save edit buttons
            if (target.dataset.saveIndex !== undefined) {
                this.saveEditRule(parseInt(target.dataset.saveIndex, 10));
            }

            // Cancel edit buttons
            if (target.dataset.cancelIndex !== undefined) {
                this.cancelEditRule();
            }

            // Remove rule buttons
            if (target.classList.contains('remove')
                && target.dataset.index
            ) {
                this.removeRule(parseInt(target.dataset.index, 10));
            }
        });

        // Event delegation for rule toggle checkboxes
        document.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (target.classList.contains('rule-toggle')
                && target.dataset.ruleId
            ) {
                this.toggleRule(target.dataset.ruleId, target.checked);
            }
        });
    }

    /**
     * Initialize UI localization
     */
    static initializeLocalization(): void {
        // Headers
        const title = `🤖 ${Translator.getMessage('extensionName')}`;
        document.getElementById('extensionTitle')!.textContent = title;
        const subtitle = Translator.getMessage('ruleBasedBlocking');
        document.getElementById('subtitle')!.textContent = subtitle;

        // Main elements
        const rulesLabel = document.getElementById('blockingRulesLabel')!;
        rulesLabel.textContent = Translator.getMessage('blockingRules');

        // Buttons
        const addButton = Translator.getMessage('addButton');
        document.getElementById('addRuleBtn')!.textContent = addButton;

        // Settings button (always exists)
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.textContent = '⚙️';
        }

        // Input placeholder and empty state
        const placeholder = Translator.getMessage('addRulePlaceholder');
        // TODO try to get rid of as HTMLInputElement
        (document.getElementById('ruleInput') as HTMLInputElement)!.placeholder = placeholder;
        const emptyMsg = Translator.getMessage('emptyRules');
        document.getElementById('emptyRules')!.textContent = emptyMsg;
    }

    /**
     * Load settings from background script
     */
    async loadSettings(): Promise<void> {
        // Load rules from background script (source of truth)
        await this.loadRulesFromBackground();

        // Get blocking status from background script (settings)
        const response = await Messaging.sendMessage({
            action: ACTIONS.GET_BLOCKING_STATUS,
        });

        if (response.success) {
            this.blockingEnabled = response.blockingEnabled;
        } else {
            logger.error('Failed to get blocking status, using default');
            this.blockingEnabled = true;
        }

        this.enabledToggle.checked = this.blockingEnabled;
        this.updateToggleStatus();
        const msg = `Loaded settings: rules=${this.rules.length}, `
            + `enabled=${this.blockingEnabled}`;
        logger.info(msg);
    }

    /**
     * Load rules from background script (source of truth)
     */
    async loadRulesFromBackground(): Promise<void> {
        const response = await Messaging.sendMessage({
            action: ACTIONS.GET_ALL_RULES,
        });

        if (response.success && response.rules) {
            // Store full rule objects including enabled state
            this.rules = response.rules;
        } else {
            this.rules = [];
        }
    }

    /**
     * Save settings via background script (non-rule settings only)
     */
    async saveSettings() {
        await Messaging.sendMessage({
            action: ACTIONS.UPDATE_SETTINGS,
            updates: {
                [SETTINGS_KEYS.BLOCKING_ENABLED]: this.blockingEnabled,
            },
        });

        logger.info('Settings saved');
    }

    /**
     * Update toggle status display
     */
    updateToggleStatus() {
        if (this.blockingEnabled) {
            this.toggleStatus.textContent = 'ON';
            this.toggleStatus.className = 'toggle-status on';
            this.toggleSwitch.classList.add('checked');
        } else {
            this.toggleStatus.textContent = 'OFF';
            this.toggleStatus.className = 'toggle-status off';
            this.toggleSwitch.classList.remove('checked');
        }
    }

    /**
     * Update rules display
     */
    updateRulesDisplay(): void {
        if (this.rules.length === 0) {
            this.emptyRules.style.display = 'block';
            this.rulesContainer.innerHTML = '';
            this.rulesContainer.appendChild(this.emptyRules);
            return;
        }

        this.emptyRules.style.display = 'none';
        this.rulesContainer.innerHTML = '';

        this.rules.forEach((rule, index) => {
            const ruleItem = document.createElement('div');
            ruleItem.className = 'rule-item';
            ruleItem.setAttribute('data-rule-index', index.toString());
            if (!rule.enabled) {
                ruleItem.classList.add('disabled');
            }

            const checked = rule.enabled ? 'checked' : '';
            const ruleString = rule.ruleString || rule;
            ruleItem.innerHTML = `
        <input type="checkbox"
          class="rule-toggle"
          data-rule-id="${rule.id}"
          ${checked}
          title="Enable/disable this rule">
        <span class="rule-text" title="${ruleString}">${ruleString}</span>
        <div class="rule-actions">
          <button class="btn-small edit" data-index="${index}">✏️</button>
          <button class="btn-small remove" data-index="${index}">×</button>
        </div>
      `;

            this.rulesContainer.appendChild(ruleItem);
        });
    }

    /**
     * Add new rule
     */
    async addRule(): Promise<void> {
        const ruleString = this.ruleInput.value.trim();

        if (!ruleString) {
            this.showStatus(Translator.getMessage('enterRule'), 'error');
            return;
        }

        // Validate rule format via background service
        const validationResponse = await Messaging.sendMessage({
            action: ACTIONS.VALIDATE_RULE,
            ruleString,
        });

        if (!validationResponse.success || !validationResponse.valid) {
            this.showStatus(Translator.getMessage('invalidFormat'), 'error');
            return;
        }

        // Check if rule already exists
        const ruleStrings = this.rules.map((r) => r.ruleString || r);
        if (ruleStrings.includes(ruleString)) {
            this.showStatus(Translator.getMessage('ruleExists'), 'error');
            return;
        }

        // Add rule via background script to keep RuleService in sync
        const response = await Messaging.sendMessage({
            action: ACTIONS.ADD_RULE,
            ruleString,
        });

        if (!response.success) {
            this.showStatus(response.error || 'Failed to add rule', 'error');
            return;
        }

        // Reload rules from background to stay in sync
        await this.loadRulesFromBackground();
        this.ruleInput.value = '';

        this.updateRulesDisplay();

        const msg = Translator.getMessage('ruleAdded', [ruleString]);
        this.showStatus(msg, 'success');
    }

    /**
     * Start inline editing
     * @param {number} index Rule index to edit
     */
    startEditRule(index: number): void {
        const ruleItem = document.querySelector(`[data-rule-index="${index}"]`);
        if (!ruleItem) {
            return;
        }

        const currentRule = this.rules[index];
        if (!currentRule) {
            return;
        }
        const { ruleString } = currentRule;

        // Replace rule item content with inline editor
        ruleItem.innerHTML = `
      <input type="text" class="rule-edit-input"
        value="${ruleString}" data-index="${index}">
      <div class="rule-edit-actions">
        <button class="btn-small"
          style="background: #28a745; color: white;"
          data-save-index="${index}">✓</button>
        <button class="btn-small"
          style="background: #6c757d; color: white;"
          data-cancel-index="${index}">✗</button>
      </div>
    `;

        // Focus the input and select all text
        const input = ruleItem.querySelector('.rule-edit-input') as HTMLInputElement;
        input.focus();
        input.select();

        // Handle Enter key to save
        input.addEventListener('keypress', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                this.saveEditRule(index);
            } else if (e.key === 'Escape') {
                this.cancelEditRule();
            }
        });
    }

    /**
     * Save edited rule
     * @param {number} index Rule index to save
     */
    async saveEditRule(index: number): Promise<void> {
        const selector = `input[data-index="${index}"]`;
        const input = document.querySelector(selector) as HTMLInputElement;
        if (!input) {
            return;
        }

        const newRule = input.value.trim();
        const currentRule = this.rules[index];
        if (!currentRule) {
            return;
        }
        const currentRuleString = currentRule.ruleString;

        if (!newRule) {
            this.showStatus(Translator.getMessage('enterRule'), 'error');
            return;
        }

        // Validate rule format via background service
        const validationResponse = await Messaging.sendMessage({
            action: ACTIONS.VALIDATE_RULE,
            ruleString: newRule,
        });

        if (!validationResponse.success || !validationResponse.valid) {
            this.showStatus(Translator.getMessage('invalidFormat'), 'error');
            return;
        }

        // Check if the new rule already exists (but not the current one)
        const ruleStrings = this.rules.map((r) => r.ruleString || r);
        if (ruleStrings.includes(newRule) && newRule !== currentRuleString) {
            this.showStatus(Translator.getMessage('ruleExists'), 'error');
            return;
        }

        // Edit = remove old + add new (via background script)
        await this.removeRule(index);

        const response = await Messaging.sendMessage({
            action: ACTIONS.ADD_RULE,
            ruleString: newRule,
        });

        if (!response.success) {
            this.showStatus('Failed to update rule', 'error');
            return;
        }

        // Reload rules from background to stay in sync
        await this.loadRulesFromBackground();
        this.updateRulesDisplay();

        this.showStatus(`Rule updated: ${newRule}`, 'success');
    }

    /**
     * Cancel editing
     */
    cancelEditRule(): void {
        this.updateRulesDisplay(); // Just refresh to show original rule
    }

    /**
     * Remove rule
     * @param {number} index Rule index to remove
     */
    async removeRule(index: number): Promise<void> {
        const removedRule = this.rules[index];
        if (!removedRule) {
            this.showStatus('Failed to remove rule', 'error');
            return;
        }

        const { ruleString } = removedRule;
        const ruleId = removedRule.id;

        if (!ruleId) {
            this.showStatus('Failed to remove rule', 'error');
            return;
        }

        const removeResponse = await Messaging.sendMessage({
            action: ACTIONS.REMOVE_RULE,
            ruleId,
        });

        if (!removeResponse.success) {
            this.showStatus('Failed to remove rule', 'error');
            return;
        }

        // Reload rules from background to stay in sync
        await this.loadRulesFromBackground();
        this.updateRulesDisplay();

        this.showStatus(
            Translator.getMessage('ruleRemoved', [ruleString]),
            'success',
        );
    }

    /**
     * Toggle rule enabled/disabled state
     * @param {string} ruleId Rule ID to toggle
     * @param {boolean} enabled New enabled state
     */
    async toggleRule(ruleId: string, enabled: boolean): Promise<void> {
        const response = await Messaging.sendMessage({
            action: ACTIONS.TOGGLE_RULE,
            ruleId,
            enabled,
        });

        if (!response.success) {
            this.showStatus('Failed to toggle rule', 'error');
            return;
        }

        // Reload rules from background to stay in sync
        await this.loadRulesFromBackground();
        this.updateRulesDisplay();

        const state = enabled ? 'enabled' : 'disabled';
        this.showStatus(`Rule ${state}`, 'success');
    }

    /**
     * Load thresholds from background
     */
    async loadThresholds(): Promise<void> {
        try {
            const response = await Messaging.sendMessage({
                action: ACTIONS.GET_THRESHOLDS,
            });

            if (response.success) {
                this.embeddingThreshold = response.embeddingThreshold;
                this.promptThreshold = response.promptThreshold;
                this.visionThreshold = response.visionThreshold;

                // Update UI
                const embeddingPercent = Math.round(
                    this.embeddingThreshold * 100,
                );
                const promptPercent = Math.round(this.promptThreshold * 100);
                const visionPercent = Math.round(this.visionThreshold * 100);

                const embeddingValue = embeddingPercent.toString();
                this.embeddingThresholdSlider.value = embeddingValue;
                const embeddingText = `${embeddingPercent}%`;
                this.embeddingThresholdValue.textContent = embeddingText;

                this.promptThresholdSlider.value = promptPercent.toString();
                this.promptThresholdValue.textContent = `${promptPercent}%`;

                this.visionThresholdSlider.value = visionPercent.toString();
                this.visionThresholdValue.textContent = `${visionPercent}%`;
            }
        } catch (error) {
            logger.error('Failed to load thresholds:', error);
        }
    }

    /**
     * Save embedding threshold to background
     */
    async saveEmbeddingThreshold(): Promise<void> {
        const response = await Messaging.sendMessage({
            action: ACTIONS.SET_EMBEDDING_THRESHOLD,
            threshold: this.embeddingThreshold,
        });

        if (response.success) {
            this.showStatus('Embedding threshold updated', 'success');
        }
    }

    /**
     * Save prompt threshold to background
     */
    async savePromptThreshold(): Promise<void> {
        const response = await Messaging.sendMessage({
            action: ACTIONS.SET_PROMPT_THRESHOLD,
            threshold: this.promptThreshold,
        });

        if (response.success) {
            this.showStatus('Prompt threshold updated', 'success');
        }
    }

    /**
     * Save vision threshold to background
     */
    async saveVisionThreshold(): Promise<void> {
        const response = await Messaging.sendMessage({
            action: ACTIONS.SET_VISION_THRESHOLD,
            threshold: this.visionThreshold,
        });

        if (response.success) {
            this.showStatus('Vision threshold updated', 'success');
        }
    }

    /**
     * Toggle threshold controls visibility
     */
    toggleThresholds(): void {
        this.thresholdsCollapsed = !this.thresholdsCollapsed;
        if (this.thresholdsCollapsed) {
            this.thresholdControls.classList.add('collapsed');
            this.thresholdToggleIcon.classList.add('collapsed');
        } else {
            this.thresholdControls.classList.remove('collapsed');
            this.thresholdToggleIcon.classList.remove('collapsed');
        }
    }

    /**
     * Show status message
     * @param {string} message Status message
     * @param {string} type Status type (success, error, warning)
     */
    showStatus(message: string, type: string): void {
        this.status.textContent = message;
        this.status.className = `status ${type}`;
        this.status.style.display = 'block';

        setTimeout(() => {
            this.status.style.display = 'none';
        }, 3000);
    }

    /**
     * Open or switch to options page with specific tab
     * @param tabName Tab to open (models, rules, data)
     */
    static async openOptionsTab(tabName: string): Promise<void> {
        const optionsUrl = chrome.runtime.getURL('options/options.html');
        const targetUrl = `${optionsUrl}#${tabName}`;

        // Find existing options tab
        const tabs = await chrome.tabs.query({});
        const existingTab = tabs.find((tab) => (
            tab.url?.startsWith(optionsUrl)
        ));

        if (existingTab && existingTab.id) {
            // Update tab URL with new hash and focus it
            // The hashchange event listener in options page will handle tab switching
            await chrome.tabs.update(existingTab.id, {
                url: targetUrl,
                active: true,
            });

            // Focus the window containing the tab
            if (existingTab.windowId) {
                await chrome.windows.update(existingTab.windowId, {
                    focused: true,
                });
            }
        } else {
            // Create new tab with hash
            await chrome.tabs.create({ url: targetUrl });
        }
    }
}
