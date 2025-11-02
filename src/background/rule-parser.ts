/**
 * Rule parser utility - Tokenizer-based parser for rule strings
 * Supports domain-specific rules with syntax: domain1,domain2#?#selector:contains-meaning-*('...')
 */

import { RULE_PATTERNS } from '../shared/constants';

/**
 * Parsed rule components extracted from a rule string
 * Rule format: domain1,domain2#?#selector:contains-meaning-*('...')
 */
export interface ParsedRuleComponents {
    /**
     * Array of domain strings extracted from the rule (empty if no domains specified)
     */
    domains: string[];

    /**
     * The rule portion after the #?# separator (or entire string if no separator found)
     */
    rulePart: string;
}

/**
 * Rule parser class - Uses tokenization instead of regex
 */
export class RuleParser {
    /**
     * Parse rule string to extract domains and rule portion
     * @param ruleString Full rule string to parse
     * @returns Parsed components with domains array and rule portion
     */
    static parseRuleComponents(ruleString: string): ParsedRuleComponents {
        // Find domain separator
        const separatorIndex = ruleString.indexOf(
            RULE_PATTERNS.DOMAIN_SEPARATOR,
        );

        // No separator means no domains specified
        if (separatorIndex === -1) {
            return {
                domains: [],
                rulePart: ruleString,
            };
        }

        // Extract domain part (before separator)
        const domainPart = ruleString.substring(0, separatorIndex);
        const rulePart = ruleString.substring(
            separatorIndex + RULE_PATTERNS.DOMAIN_SEPARATOR.length,
        );

        // Parse domains (comma-separated)
        const domains = RuleParser.parseDomains(domainPart);

        return {
            domains,
            rulePart,
        };
    }

    /**
     * Parse comma-separated domain list
     * @param domainPart String containing comma-separated domains
     * @returns Array of trimmed domain strings
     */
    static parseDomains(domainPart: string): string[] {
        if (!domainPart || domainPart.trim() === '') {
            return [];
        }

        // Split by comma and trim each domain
        const domains: string[] = [];
        let currentDomain = '';

        for (let i = 0; i < domainPart.length; i += 1) {
            const char = domainPart[i];

            if (char === ',') {
                // Found separator, add current domain if not empty
                const trimmed = currentDomain.trim();
                if (trimmed) {
                    domains.push(trimmed);
                }
                currentDomain = '';
            } else {
                currentDomain += char;
            }
        }

        // Add last domain if exists
        const trimmed = currentDomain.trim();
        if (trimmed) {
            domains.push(trimmed);
        }

        return domains;
    }

    /**
     * Validate domain format
     * Supports wildcards (*), paths (/), and special identifiers
     * @param domain Domain string to validate
     * @returns True if domain is valid
     */
    static isValidDomain(domain: string): boolean {
        if (!domain || domain.trim() === '') {
            return false;
        }

        // Special identifiers are always valid
        if (domain === 'file://' || domain === 'localhost') {
            return true;
        }

        // Path patterns (for file URLs) are valid if they contain /
        // e.g., test-page/index.html, */test-page/*, /Volumes/dev/*/index.html
        if (domain.includes('/')) {
            // Check for invalid characters in paths
            const invalidChars = ['#', '?', ' ', '\t', '\n', '\r'];
            for (const char of invalidChars) {
                if (domain.includes(char)) {
                    return false;
                }
            }
            return true;
        }

        // Basic validation without regex for regular domains
        // Check for invalid characters
        const invalidChars = ['#', '?', ' ', '\t', '\n', '\r'];
        for (const char of invalidChars) {
            if (domain.includes(char)) {
                return false;
            }
        }

        // Must contain at least one dot (e.g., example.com, *.example.com)
        if (!domain.includes('.')) {
            return false;
        }

        // Check for invalid wildcard patterns
        // Wildcard-only patterns like "*" are not valid
        if (domain === '*') {
            return false;
        }

        // Check if starts/ends with dot (not counting wildcards)
        // *.example.org is valid, but .example.org is not
        // example.* is valid, but example. is not
        const withoutWildcards = domain.replace(/\*/g, '');
        // Only check for dots if there's content left after removing wildcards
        if (withoutWildcards.length > 0) {
            // Check for leading dot (that's not after a wildcard)
            if (!domain.startsWith('*') && domain.startsWith('.')) {
                return false;
            }
            // Check for trailing dot (that's not before a wildcard)
            if (!domain.endsWith('*') && domain.endsWith('.')) {
                return false;
            }
        }

        return true;
    }

    /**
     * Validate all domains in array
     * @param domains Array of domain strings to validate
     * @returns Object with isValid flag and error message if invalid
     */
    static validateDomains(
        domains: string[],
    ): { isValid: boolean; error?: string } {
        for (const domain of domains) {
            if (!RuleParser.isValidDomain(domain)) {
                return {
                    isValid: false,
                    error: `Invalid domain format: "${domain}"`,
                };
            }
        }

        return { isValid: true };
    }
}
