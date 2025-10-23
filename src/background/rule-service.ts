// Rule Service - Pure rule logic without DOM dependencies

import { nanoid } from 'nanoid/non-secure';
import { RULE_PATTERNS, RULE_TYPE, SETTINGS_KEYS } from '../shared/constants';
import { createLogger, getErrorMessage } from '../shared/logger';
import type { Rule } from '../shared/rule-types';
import { SettingsManager } from '../shared/settings';

const logger = createLogger('RuleService');

/**
 * Stored rule format (persisted in settings)
 */
interface StoredRule {
    ruleString: string;
    enabled: boolean;
}

/**
 * Rule Service - Manages ad blocking rules
 */
export class RuleService {
    private rules: Rule[] = [];

    /**
     * Initialize the rule service by loading rules from storage
     */
    async initialize(): Promise<void> {
        await this.loadRulesFromStorage();
        logger.info(`RuleService initialized with ${this.rules.length} rules`);
    }

    /**
     * Load rules from settings
     * @returns Array of loaded rules
     */
    async loadRulesFromStorage(): Promise<Rule[]> {
        const storedRules = await SettingsManager.get(
            SETTINGS_KEYS.AD_BLOCK_RULES,
        );

        this.rules = storedRules.map((storedRule): Rule | null => {
            try {
                const rule = RuleService.parseRule(storedRule.ruleString);
                rule.enabled = storedRule.enabled ?? true;
                return rule;
            } catch (error) {
                const ruleStr = storedRule.ruleString;
                logger.error(`Failed to parse stored rule "${ruleStr}": ${getErrorMessage(error)}`);
                return null;
            }
        }).filter((rule): rule is Rule => rule !== null);

        return this.rules;
    }

    /**
     * Save current rules to settings
     */
    async saveRulesToStorage(): Promise<void> {
        const rulesToSave: StoredRule[] = this.rules.map((rule) => ({
            ruleString: rule.ruleString,
            enabled: rule.enabled,
        }));
        await SettingsManager.set(SETTINGS_KEYS.AD_BLOCK_RULES, rulesToSave);
        logger.info(`Saved ${rulesToSave.length} rules to storage`);
    }

    /**
     * Generate a unique rule ID
     * @returns Unique rule ID with 'rule-' prefix
     */
    static generateRuleId(): string {
        return `rule-${nanoid()}`;
    }

    /**
     * Parse rule from string format
     * @param ruleString Rule string to parse
     * @returns Parsed rule object
     * @throws {Error} When rule format is invalid
     */
    static parseRule(ruleString: string): Rule {
        // Try to match embedding-based rule first
        let match = ruleString.match(RULE_PATTERNS.PARSING.EMBEDDING);
        if (match) {
            const [, selector, containsText] = match;
            return {
                id: RuleService.generateRuleId(),
                selector: selector!.trim(),
                containsText: containsText!.trim(),
                enabled: true,
                ruleString,
                type: RULE_TYPE.EMBEDDING,
            };
        }

        // Try to match LLM prompt-based rule
        match = ruleString.match(RULE_PATTERNS.PARSING.PROMPT);
        if (match) {
            const [, selector, prompt] = match;
            return {
                id: RuleService.generateRuleId(),
                selector: selector!.trim(),
                prompt: prompt!.trim(),
                enabled: true,
                ruleString,
                type: RULE_TYPE.PROMPT,
            };
        }

        // Try to match vision-based rule
        match = ruleString.match(RULE_PATTERNS.PARSING.VISION);
        if (match) {
            const [, selector, criteria] = match;
            return {
                id: RuleService.generateRuleId(),
                selector: selector!.trim(),
                criteria: criteria!.trim(),
                enabled: true,
                ruleString,
                type: RULE_TYPE.VISION,
            };
        }

        throw new Error(`Invalid rule format: ${ruleString}`);
    }

    /**
     * Add rule to the collection
     * @param ruleString Rule string to add
     * @returns Parsed rule object or null if parsing failed
     */
    async addRule(ruleString: string): Promise<Rule | null> {
        try {
            const rule = RuleService.parseRule(ruleString);
            this.rules.push(rule);
            logger.info(`Added rule: ${rule.ruleString}`);
            await this.saveRulesToStorage();
            return rule;
        } catch (error) {
            const errorMsg = error instanceof Error
                ? error.message
                : String(error);
            const msg = `Rule parsing error "${ruleString}": ${errorMsg}`;
            logger.error(msg);
            return null;
        }
    }

    /**
     * Remove rule by ID
     * @param ruleId Rule ID to remove
     * @returns True if rule was removed
     */
    async removeRule(ruleId: string): Promise<boolean> {
        const index = this.rules.findIndex((rule) => rule.id === ruleId);
        if (index !== -1) {
            const removed = this.rules.splice(index, 1)[0]!;
            logger.info(`Removed rule: ${removed.ruleString}`);
            await this.saveRulesToStorage();
            return true;
        }
        return false;
    }

    /**
     * Get all rules
     * @returns Copy of all rules
     */
    getRules(): Rule[] {
        return [...this.rules];
    }

    /**
     * Enable/disable rule by ID
     * @param ruleId Rule ID to toggle
     * @param enabled New enabled state
     * @returns True if rule was found and toggled
     */
    async toggleRule(ruleId: string, enabled: boolean): Promise<boolean> {
        const rule = this.rules.find((r) => r.id === ruleId);
        if (rule) {
            rule.enabled = enabled;
            const state = enabled ? 'enabled' : 'disabled';
            logger.info(`Rule ${rule.ruleString} ${state}`);
            await this.saveRulesToStorage();
            return true;
        }
        return false;
    }

    /**
     * Clear all rules
     */
    async clearRules(): Promise<void> {
        const count = this.rules.length;
        this.rules = [];
        await this.saveRulesToStorage();
        logger.info(`Cleared ${count} rules`);
    }

    /**
     * Validate rule string format
     * @param ruleString Rule string to validate
     * @returns True if rule format is valid
     */
    static validateRuleFormat(ruleString: string): boolean {
        try {
            RuleService.parseRule(ruleString);
            return true;
        } catch {
            return false;
        }
    }
}
