import { describe, expect, it } from 'vitest';
import { RuleService } from '../../src/background/rule-service';
import { RULE_TYPE } from '../../src/shared/constants';
import type {
    EmbeddingRule,
    PromptRule,
    VisionRule,
} from '../../src/shared/rule-types';

describe('RuleService', () => {
    describe('parseRule', () => {
        describe('Embedding rules', () => {
            it('should parse embedding rule without domains', () => {
                const ruleString = 'div:contains-meaning-embedding(\'advertisement\')';
                const rule = RuleService.parseRule(ruleString) as EmbeddingRule;

                expect(rule.type).toBe(RULE_TYPE.EMBEDDING);
                expect(rule.selector).toBe('div');
                expect(rule.containsText).toBe('advertisement');
                expect(rule.domains).toEqual([]);
                expect(rule.ruleString).toBe(ruleString);
                expect(rule.enabled).toBe(true);
                expect(rule.id).toMatch(/^rule-/);
            });

            it('should parse embedding rule with single domain', () => {
                const ruleString = 'example.org#?#div:contains-meaning-embedding(\'ad\')';
                const rule = RuleService.parseRule(ruleString) as EmbeddingRule;

                expect(rule.type).toBe(RULE_TYPE.EMBEDDING);
                expect(rule.selector).toBe('div');
                expect(rule.containsText).toBe('ad');
                expect(rule.domains).toEqual(['example.org']);
                expect(rule.ruleString).toBe(ruleString);
            });

            it('should parse embedding rule with multiple domains', () => {
                const ruleString = 'example.org,test.com#?#article:contains-meaning-embedding(\'buy\')';
                const rule = RuleService.parseRule(ruleString) as EmbeddingRule;

                expect(rule.type).toBe(RULE_TYPE.EMBEDDING);
                expect(rule.selector).toBe('article');
                expect(rule.containsText).toBe('buy');
                expect(rule.domains).toEqual(['example.org', 'test.com']);
            });

            it('should parse embedding rule with complex selector', () => {
                const ruleString = 'div[class*="ad"]:contains-meaning-embedding(\'advertisement\')';
                const rule = RuleService.parseRule(ruleString) as EmbeddingRule;

                expect(rule.selector).toBe('div[class*="ad"]');
                expect(rule.containsText).toBe('advertisement');
            });
        });

        describe('Prompt rules', () => {
            it('should parse prompt rule without domains', () => {
                const ruleString = 'div:contains-meaning-prompt(\'promotional content\')';
                const rule = RuleService.parseRule(ruleString) as PromptRule;

                expect(rule.type).toBe(RULE_TYPE.PROMPT);
                expect(rule.selector).toBe('div');
                expect(rule.prompt).toBe('promotional content');
                expect(rule.domains).toEqual([]);
                expect(rule.ruleString).toBe(ruleString);
            });

            it('should parse prompt rule with single domain', () => {
                const ruleString = 'news.org#?#article:contains-meaning-prompt(\'clickbait\')';
                const rule = RuleService.parseRule(ruleString) as PromptRule;

                expect(rule.type).toBe(RULE_TYPE.PROMPT);
                expect(rule.selector).toBe('article');
                expect(rule.prompt).toBe('clickbait');
                expect(rule.domains).toEqual(['news.org']);
            });

            it('should parse prompt rule with multiple domains', () => {
                const ruleString = 'site1.com,site2.org,site3.net#?#section:contains-meaning-prompt(\'donation request\')';
                const rule = RuleService.parseRule(ruleString) as PromptRule;

                expect(rule.type).toBe(RULE_TYPE.PROMPT);
                expect(rule.selector).toBe('section');
                expect(rule.prompt).toBe('donation request');
                expect(rule.domains).toEqual(['site1.com', 'site2.org', 'site3.net']);
            });
        });

        describe('Vision rules', () => {
            it('should parse vision rule without domains', () => {
                const ruleString = 'img:contains-meaning-vision(\'advertisement banner\')';
                const rule = RuleService.parseRule(ruleString) as VisionRule;

                expect(rule.type).toBe(RULE_TYPE.VISION);
                expect(rule.selector).toBe('img');
                expect(rule.criteria).toBe('advertisement banner');
                expect(rule.domains).toEqual([]);
            });

            it('should parse vision rule with single domain', () => {
                const ruleString = 'blog.org#?#div:contains-meaning-vision(\'sponsored image\')';
                const rule = RuleService.parseRule(ruleString) as VisionRule;

                expect(rule.type).toBe(RULE_TYPE.VISION);
                expect(rule.selector).toBe('div');
                expect(rule.criteria).toBe('sponsored image');
                expect(rule.domains).toEqual(['blog.org']);
            });

            it('should parse vision rule with multiple domains', () => {
                const ruleString = 'example.org,test.com#?#section:contains-meaning-vision(\'promotional visual\')';
                const rule = RuleService.parseRule(ruleString) as VisionRule;

                expect(rule.type).toBe(RULE_TYPE.VISION);
                expect(rule.selector).toBe('section');
                expect(rule.criteria).toBe('promotional visual');
                expect(rule.domains).toEqual(['example.org', 'test.com']);
            });
        });

        describe('Domain validation', () => {
            it('should reject rule with invalid domain (no dot)', () => {
                const ruleString = 'invalid#?#div:contains-meaning-embedding(\'ad\')';
                expect(() => RuleService.parseRule(ruleString)).toThrow('Invalid domain format');
            });

            it('should reject rule with invalid domain (has #)', () => {
                const ruleString = 'exam#ple.org#?#div:contains-meaning-embedding(\'ad\')';
                expect(() => RuleService.parseRule(ruleString)).toThrow('Invalid domain format');
            });

            it('should reject rule with invalid domain (starts with dot)', () => {
                const ruleString = '.example.org#?#div:contains-meaning-embedding(\'ad\')';
                expect(() => RuleService.parseRule(ruleString)).toThrow('Invalid domain format');
            });

            it('should reject rule with invalid domain (ends with dot)', () => {
                const ruleString = 'example.org.#?#div:contains-meaning-embedding(\'ad\')';
                expect(() => RuleService.parseRule(ruleString)).toThrow('Invalid domain format');
            });

            it('should accept localhost as valid domain', () => {
                const ruleString = 'localhost#?#div:contains-meaning-embedding(\'ad\')';
                const rule = RuleService.parseRule(ruleString);
                expect(rule.domains).toEqual(['localhost']);
            });
        });

        describe('Edge cases', () => {
            it('should handle domains with whitespace', () => {
                const ruleString = ' example.org , test.com #?#div:contains-meaning-embedding(\'ad\')';
                const rule = RuleService.parseRule(ruleString);
                expect(rule.domains).toEqual(['example.org', 'test.com']);
            });

            it('should handle selector with special characters', () => {
                const ruleString = 'div[data-ad="true"]:contains-meaning-embedding(\'ad\')';
                const rule = RuleService.parseRule(ruleString) as EmbeddingRule;
                expect(rule.selector).toBe('div[data-ad="true"]');
            });

            it('should handle rule text with quotes', () => {
                const ruleString = 'div:contains-meaning-prompt("promotional content")';
                const rule = RuleService.parseRule(ruleString) as PromptRule;
                expect(rule.prompt).toBe('promotional content');
            });

            it('should throw error for invalid rule format', () => {
                const ruleString = 'invalid-rule-format';
                expect(() => RuleService.parseRule(ruleString)).toThrow('Invalid rule format');
            });

            it('should throw error for empty rule part', () => {
                const ruleString = 'example.org#?#';
                expect(() => RuleService.parseRule(ruleString)).toThrow('Invalid rule format');
            });
        });

        describe('Real-world examples', () => {
            it('should parse complex multi-domain embedding rule', () => {
                const ruleString = 'www.example.org,blog.test.com,news.site.io#?#div[class*="advertisement"]:contains-meaning-embedding(\'buy now\')';
                const rule = RuleService.parseRule(ruleString) as EmbeddingRule;

                expect(rule.type).toBe(RULE_TYPE.EMBEDDING);
                expect(rule.selector).toBe('div[class*="advertisement"]');
                expect(rule.containsText).toBe('buy now');
                expect(rule.domains).toEqual(['www.example.org', 'blog.test.com', 'news.site.io']);
            });

            it('should parse complex single-domain prompt rule', () => {
                const ruleString = 'news.example.org#?#article:contains-meaning-prompt(\'sensational headlines designed to get clicks\')';
                const rule = RuleService.parseRule(ruleString) as PromptRule;

                expect(rule.type).toBe(RULE_TYPE.PROMPT);
                expect(rule.selector).toBe('article');
                expect(rule.prompt).toBe('sensational headlines designed to get clicks');
                expect(rule.domains).toEqual(['news.example.org']);
            });

            it('should parse complex vision rule with image selector', () => {
                const ruleString = 'shop.example.com,store.test.org#?#img[src*="banner"]:contains-meaning-vision(\'promotional advertisement image\')';
                const rule = RuleService.parseRule(ruleString) as VisionRule;

                expect(rule.type).toBe(RULE_TYPE.VISION);
                expect(rule.selector).toBe('img[src*="banner"]');
                expect(rule.criteria).toBe('promotional advertisement image');
                expect(rule.domains).toEqual(['shop.example.com', 'store.test.org']);
            });
        });
    });

    describe('validateRuleFormat', () => {
        it('should validate correct rule without domains', () => {
            const result = RuleService.validateRuleFormat('div:contains-meaning-embedding(\'ad\')');
            expect(result).toBe(true);
        });

        it('should validate correct rule with domains', () => {
            const result = RuleService.validateRuleFormat('example.org#?#div:contains-meaning-prompt(\'ad\')');
            expect(result).toBe(true);
        });

        it('should reject invalid rule format', () => {
            const result = RuleService.validateRuleFormat('invalid-format');
            expect(result).toBe(false);
        });

        it('should reject rule with invalid domain', () => {
            const result = RuleService.validateRuleFormat('invalid domain#?#div:contains-meaning-embedding(\'ad\')');
            expect(result).toBe(false);
        });
    });
});
