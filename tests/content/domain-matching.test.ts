import { describe, expect, it } from 'vitest';
import {
    filterRulesByUrl,
    matchesDomainPattern,
} from '../../src/shared/domain-matcher';
import { RULE_TYPE } from '../../src/shared/constants';
import type { Rule } from '../../src/shared/rule-types';

/**
 * Domain pattern matching tests
 * Tests the matchesDomainPattern function from shared/domain-matcher.ts
 */

describe('Domain Pattern Matching', () => {
    describe('Exact matches', () => {
        it('should match exact domain', () => {
            expect(matchesDomainPattern('example.org', 'example.org', '/')).toBe(true);
        });

        it('should match localhost', () => {
            expect(matchesDomainPattern('localhost', 'localhost', '/')).toBe(true);
        });

        it('should not match different domain', () => {
            expect(matchesDomainPattern('example.org', 'test.com', '/')).toBe(false);
        });
    });

    describe('Wildcard subdomain matching', () => {
        it('should match *.example.org with www.example.org', () => {
            expect(matchesDomainPattern('*.example.org', 'www.example.org', '/')).toBe(true);
        });

        it('should match *.example.org with blog.example.org', () => {
            expect(matchesDomainPattern('*.example.org', 'blog.example.org', '/')).toBe(true);
        });

        it('should match *.example.org with deep.sub.example.org', () => {
            expect(matchesDomainPattern('*.example.org', 'deep.sub.example.org', '/')).toBe(true);
        });

        it('should not match *.example.org with example.org', () => {
            expect(matchesDomainPattern('*.example.org', 'example.org', '/')).toBe(false);
        });

        it('should not match *.example.org with example.com', () => {
            expect(matchesDomainPattern('*.example.org', 'example.com', '/')).toBe(false);
        });
    });

    describe('Wildcard TLD matching', () => {
        it('should match example.* with example.com', () => {
            expect(matchesDomainPattern('example.*', 'example.com', '/')).toBe(true);
        });

        it('should match example.* with example.org', () => {
            expect(matchesDomainPattern('example.*', 'example.org', '/')).toBe(true);
        });

        it('should match example.* with example.co.uk', () => {
            expect(matchesDomainPattern('example.*', 'example.co.uk', '/')).toBe(true);
        });

        it('should not match example.* with test.com', () => {
            expect(matchesDomainPattern('example.*', 'test.com', '/')).toBe(false);
        });
    });

    describe('Multiple wildcards', () => {
        it('should match *.example.* with www.example.com', () => {
            expect(matchesDomainPattern('*.example.*', 'www.example.com', '/')).toBe(true);
        });

        it('should match *.example.* with blog.example.org', () => {
            expect(matchesDomainPattern('*.example.*', 'blog.example.org', '/')).toBe(true);
        });

        it('should not match *.example.* with example.com', () => {
            expect(matchesDomainPattern('*.example.*', 'example.com', '/')).toBe(false);
        });
    });

    describe('Partial wildcards', () => {
        it('should match *example.org with testexample.org', () => {
            expect(matchesDomainPattern('*example.org', 'testexample.org', '/')).toBe(true);
        });

        it('should match example*.org with exampletest.org', () => {
            expect(matchesDomainPattern('example*.org', 'exampletest.org', '/')).toBe(true);
        });

        it('should match ex*ple.org with example.org', () => {
            expect(matchesDomainPattern('ex*ple.org', 'example.org', '/')).toBe(true);
        });
    });

    describe('Special characters escaping', () => {
        it('should escape dots in pattern', () => {
            expect(matchesDomainPattern('example.org', 'exampleXorg', '/')).toBe(false);
        });

        it('should handle patterns with special regex chars', () => {
            // Ensure special chars in domain names are properly escaped
            expect(matchesDomainPattern('example.org', 'example.org', '/')).toBe(true);
            expect(matchesDomainPattern('test-site.com', 'test-site.com', '/')).toBe(true);
        });
    });

    describe('Path matching (works on all websites)', () => {
        it('should match exact path on any hostname', () => {
            expect(matchesDomainPattern(
                '/blog/article.html',
                'example.org',
                '/blog/article.html',
            )).toBe(true);
            expect(matchesDomainPattern(
                '/blog/article.html',
                'test.com',
                '/blog/article.html',
            )).toBe(true);
        });

        it('should match partial path substring', () => {
            expect(matchesDomainPattern(
                'test-page/index.html',
                'example.org',
                '/Volumes/dev/ai-blocker-experiment/test-page/index.html',
            )).toBe(true);
        });

        it('should match with wildcards in path', () => {
            expect(matchesDomainPattern(
                '*/product/*',
                'shop.example.com',
                '/store/product/item123',
            )).toBe(true);
        });

        it('should match directory pattern', () => {
            expect(matchesDomainPattern(
                '/blog/',
                'example.org',
                '/blog/article.html',
            )).toBe(true);
        });

        it('should not match different path', () => {
            expect(matchesDomainPattern(
                '/other-page/',
                'example.org',
                '/test-page/index.html',
            )).toBe(false);
        });

        it('should work with file:// URLs', () => {
            expect(matchesDomainPattern(
                'test-page/index.html',
                '',
                '/Volumes/dev/test-page/index.html',
            )).toBe(true);
        });
    });

    describe('Edge cases', () => {
        it('should not match pattern without wildcards to different domain', () => {
            expect(matchesDomainPattern('example.org', 'www.example.org', '/')).toBe(false);
        });

        it('should handle empty strings', () => {
            expect(matchesDomainPattern('', 'example.org', '/')).toBe(false);
            expect(matchesDomainPattern('example.org', '', '/')).toBe(false);
        });

        it('should be case-sensitive', () => {
            expect(matchesDomainPattern('Example.org', 'example.org', '/')).toBe(false);
            expect(matchesDomainPattern('example.org', 'Example.org', '/')).toBe(false);
        });
    });

    describe('Extension URL Filtering', () => {
        it('should return empty array for chrome-extension:// URLs', () => {
            const rules: Rule[] = [
                {
                    id: 'rule-1',
                    type: RULE_TYPE.EMBEDDING,
                    selector: 'div',
                    containsText: 'test',
                    enabled: true,
                    domains: [],
                    ruleString: 'div:contains-meaning-embedding(\'test\')',
                },
                {
                    id: 'rule-2',
                    type: RULE_TYPE.PROMPT,
                    selector: 'span',
                    prompt: 'check',
                    enabled: true,
                    domains: [],
                    ruleString: 'span:contains-meaning-prompt(\'check\')',
                },
            ];

            const result = filterRulesByUrl(
                rules,
                'chrome-extension://abcdefghijklmnop/popup/popup.html',
            );

            expect(result).toEqual([]);
        });

        it('should return empty array for chrome:// URLs', () => {
            const rules: Rule[] = [
                {
                    id: 'rule-1',
                    type: RULE_TYPE.EMBEDDING,
                    selector: 'div',
                    containsText: 'test',
                    enabled: true,
                    domains: [],
                    ruleString: 'div:contains-meaning-embedding(\'test\')',
                },
            ];

            const result = filterRulesByUrl(rules, 'chrome://extensions/');

            expect(result).toEqual([]);
        });

        it('should return empty array for about: URLs', () => {
            const rules: Rule[] = [
                {
                    id: 'rule-1',
                    type: RULE_TYPE.EMBEDDING,
                    selector: 'div',
                    containsText: 'test',
                    enabled: true,
                    domains: [],
                    ruleString: 'div:contains-meaning-embedding(\'test\')',
                },
            ];

            const result = filterRulesByUrl(rules, 'about:blank');

            expect(result).toEqual([]);
        });

        it('should not filter normal http/https URLs', () => {
            const rules: Rule[] = [
                {
                    id: 'rule-1',
                    type: RULE_TYPE.EMBEDDING,
                    selector: 'div',
                    containsText: 'test',
                    enabled: true,
                    domains: [],
                    ruleString: 'div:contains-meaning-embedding(\'test\')',
                },
            ];

            const httpResult = filterRulesByUrl(rules, 'http://example.com');
            const httpsResult = filterRulesByUrl(rules, 'https://example.com');

            expect(httpResult.length).toBe(1);
            expect(httpsResult.length).toBe(1);
        });
    });
});
