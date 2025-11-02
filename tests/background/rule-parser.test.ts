import { describe, expect, it } from 'vitest';
import { RuleParser } from '../../src/background/rule-parser';

describe('RuleParser', () => {
    describe('parseRuleComponents', () => {
        it('should parse rule without domains', () => {
            const ruleString = 'div:contains-meaning-embedding(\'advertisement\')';
            const result = RuleParser.parseRuleComponents(ruleString);

            expect(result.domains).toEqual([]);
            expect(result.rulePart).toBe('div:contains-meaning-embedding(\'advertisement\')');
        });

        it('should parse rule with single domain', () => {
            const ruleString = 'example.org#?#div:contains-meaning-prompt(\'ad\')';
            const result = RuleParser.parseRuleComponents(ruleString);

            expect(result.domains).toEqual(['example.org']);
            expect(result.rulePart).toBe('div:contains-meaning-prompt(\'ad\')');
        });

        it('should parse rule with multiple domains', () => {
            const ruleString = 'example.org,test.com,news.io#?#article:contains-meaning-vision(\'sponsored\')';
            const result = RuleParser.parseRuleComponents(ruleString);

            expect(result.domains).toEqual(['example.org', 'test.com', 'news.io']);
            expect(result.rulePart).toBe('article:contains-meaning-vision(\'sponsored\')');
        });

        it('should trim whitespace from domains', () => {
            const ruleString = ' example.org , test.com , news.io #?#div:contains-meaning-embedding(\'ad\')';
            const result = RuleParser.parseRuleComponents(ruleString);

            expect(result.domains).toEqual(['example.org', 'test.com', 'news.io']);
        });

        it('should handle empty domain part', () => {
            const ruleString = '#?#div:contains-meaning-embedding(\'ad\')';
            const result = RuleParser.parseRuleComponents(ruleString);

            expect(result.domains).toEqual([]);
            expect(result.rulePart).toBe('div:contains-meaning-embedding(\'ad\')');
        });

        it('should treat first #?# as separator (not content in rule)', () => {
            // Note: First #?# is always treated as the separator
            const ruleString = 'example.org#?#div:contains-meaning-embedding(\'text\')';
            const result = RuleParser.parseRuleComponents(ruleString);

            expect(result.domains).toEqual(['example.org']);
            expect(result.rulePart).toBe('div:contains-meaning-embedding(\'text\')');
        });

        it('should handle domain with subdomain', () => {
            const ruleString = 'www.example.org,blog.test.com#?#div:contains-meaning-prompt(\'ad\')';
            const result = RuleParser.parseRuleComponents(ruleString);

            expect(result.domains).toEqual(['www.example.org', 'blog.test.com']);
            expect(result.rulePart).toBe('div:contains-meaning-prompt(\'ad\')');
        });
    });

    describe('parseDomains', () => {
        it('should parse single domain', () => {
            const result = RuleParser.parseDomains('example.org');
            expect(result).toEqual(['example.org']);
        });

        it('should parse multiple domains', () => {
            const result = RuleParser.parseDomains('example.org,test.com,news.io');
            expect(result).toEqual(['example.org', 'test.com', 'news.io']);
        });

        it('should trim whitespace', () => {
            const result = RuleParser.parseDomains(' example.org , test.com , news.io ');
            expect(result).toEqual(['example.org', 'test.com', 'news.io']);
        });

        it('should handle empty string', () => {
            const result = RuleParser.parseDomains('');
            expect(result).toEqual([]);
        });

        it('should skip empty domains', () => {
            const result = RuleParser.parseDomains('example.org,,test.com');
            expect(result).toEqual(['example.org', 'test.com']);
        });

        it('should handle trailing comma', () => {
            const result = RuleParser.parseDomains('example.org,test.com,');
            expect(result).toEqual(['example.org', 'test.com']);
        });

        it('should handle leading comma', () => {
            const result = RuleParser.parseDomains(',example.org,test.com');
            expect(result).toEqual(['example.org', 'test.com']);
        });
    });

    describe('isValidDomain', () => {
        it('should validate simple domain', () => {
            expect(RuleParser.isValidDomain('example.org')).toBe(true);
        });

        it('should validate domain with subdomain', () => {
            expect(RuleParser.isValidDomain('www.example.org')).toBe(true);
            expect(RuleParser.isValidDomain('blog.news.example.org')).toBe(true);
        });

        it('should validate localhost', () => {
            expect(RuleParser.isValidDomain('localhost')).toBe(true);
        });

        it('should validate file:// identifier', () => {
            expect(RuleParser.isValidDomain('file://')).toBe(true);
        });

        it('should validate wildcard subdomains', () => {
            expect(RuleParser.isValidDomain('*.example.org')).toBe(true);
            expect(RuleParser.isValidDomain('*.example.com')).toBe(true);
        });

        it('should validate wildcard TLDs', () => {
            expect(RuleParser.isValidDomain('example.*')).toBe(true);
            expect(RuleParser.isValidDomain('test.*')).toBe(true);
        });

        it('should validate multiple wildcards', () => {
            expect(RuleParser.isValidDomain('*.example.*')).toBe(true);
        });

        it('should validate file path patterns', () => {
            expect(RuleParser.isValidDomain('test-page/index.html')).toBe(true);
            expect(RuleParser.isValidDomain('/Volumes/dev/test-page/index.html')).toBe(true);
            expect(RuleParser.isValidDomain('*/test-page/*.html')).toBe(true);
        });

        it('should reject empty string', () => {
            expect(RuleParser.isValidDomain('')).toBe(false);
        });

        it('should reject domain with #', () => {
            expect(RuleParser.isValidDomain('example#.org')).toBe(false);
        });

        it('should reject domain with ?', () => {
            expect(RuleParser.isValidDomain('example?.org')).toBe(false);
        });

        it('should reject domain with space', () => {
            expect(RuleParser.isValidDomain('example .org')).toBe(false);
        });

        it('should reject domain with tab', () => {
            expect(RuleParser.isValidDomain('example\t.org')).toBe(false);
        });

        it('should reject domain with newline', () => {
            expect(RuleParser.isValidDomain('example\n.org')).toBe(false);
        });

        it('should reject domain without dot (except localhost and file://)', () => {
            expect(RuleParser.isValidDomain('example')).toBe(false);
            expect(RuleParser.isValidDomain('exampleorg')).toBe(false);
        });

        it('should reject wildcard-only patterns', () => {
            expect(RuleParser.isValidDomain('*')).toBe(false);
        });

        it('should reject domain starting with dot', () => {
            expect(RuleParser.isValidDomain('.example.org')).toBe(false);
        });

        it('should reject domain ending with dot', () => {
            expect(RuleParser.isValidDomain('example.org.')).toBe(false);
        });
    });

    describe('validateDomains', () => {
        it('should validate array of valid domains', () => {
            const result = RuleParser.validateDomains(['example.org', 'test.com', 'news.io']);
            expect(result.isValid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('should validate empty array', () => {
            const result = RuleParser.validateDomains([]);
            expect(result.isValid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('should reject array with invalid domain', () => {
            const result = RuleParser.validateDomains(['example.org', 'invalid domain', 'test.com']);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('invalid domain');
        });

        it('should return error for domain without dot', () => {
            const result = RuleParser.validateDomains(['example']);
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Invalid domain format: "example"');
        });

        it('should return error for domain with invalid character', () => {
            const result = RuleParser.validateDomains(['example#.org']);
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Invalid domain format: "example#.org"');
        });
    });
});

