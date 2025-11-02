/**
 * Domain matching utilities for rule filtering
 * Supports wildcard patterns and path-based matching
 */

import type { Rule } from './rule-types';

/**
 * Check if a domain pattern matches a given URL
 * Supports wildcards and path matching
 * @param pattern Domain pattern (may contain wildcards or paths)
 * @param hostname Hostname to match against
 * @param pathname Pathname to match against
 * @returns True if pattern matches
 */
export function matchesDomainPattern(
    pattern: string,
    hostname: string,
    pathname: string,
): boolean {
    // Exact hostname match
    if (pattern === hostname) {
        return true;
    }

    // Path-based pattern matching
    // If pattern contains '/', match against pathname
    if (pattern.includes('/')) {
        // Partial path matching
        // Pattern: test-page/index.html matches /anything/test-page/index.html
        if (pathname.includes(pattern)) {
            return true;
        }
        // Wildcard path matching
        if (pattern.includes('*')) {
            const regexPattern = pattern
                .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
                .replace(/\*/g, '.*');
            const regex = new RegExp(regexPattern);
            return regex.test(pathname);
        }
        return false;
    }

    // Domain wildcard matching
    if (!pattern.includes('*')) {
        return false;
    }

    // Convert pattern to regex for wildcard domain matching
    const regexPattern = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(hostname);
}

/**
 * Check if a rule should apply to a given URL
 * @param rule Rule to check
 * @param hostname Hostname from URL
 * @param pathname Pathname from URL
 * @returns True if rule should apply
 */
export function shouldRuleApply(
    rule: Rule,
    hostname: string,
    pathname: string,
): boolean {
    // Empty domains array means apply to all sites
    if (rule.domains.length === 0) {
        return true;
    }

    // Check if URL matches any of the rule's patterns
    return rule.domains.some((pattern) => (
        matchesDomainPattern(pattern, hostname, pathname)
    ));
}

/**
 * Extract hostname and pathname from a URL string
 * @param urlString URL to parse
 * @returns Object with hostname and pathname, or null if invalid URL
 */
export function parseUrl(urlString: string): {
    hostname: string;
    pathname: string;
} | null {
    try {
        const url = new URL(urlString);
        return {
            hostname: url.hostname,
            pathname: url.pathname,
        };
    } catch (error) {
        return null;
    }
}

/**
 * Filter rules that apply to a specific URL
 * Only processes web pages (https://, http://) and local files (file://)
 * Ignores system pages (chrome://, chrome-extension://, about:, etc.)
 * @param rules Array of rules to filter
 * @param urlString URL to match against
 * @returns Array of enabled rules that apply to the URL, or empty array for non-web URLs
 */
export function filterRulesByUrl(rules: Rule[], urlString: string): Rule[] {
    // Only handle web pages (https/http) and local files
    // Ignore system pages (chrome://, chrome-extension://, about:, etc.)
    const isWebUrl = urlString.startsWith('https://')
        || urlString.startsWith('http://')
        || urlString.startsWith('file://');

    if (!isWebUrl) {
        return [];
    }

    const parsed = parseUrl(urlString);
    if (!parsed) {
        // If URL is invalid, return rules with no domain restrictions
        return rules.filter((rule) => rule.domains.length === 0);
    }

    const { hostname, pathname } = parsed;
    return rules.filter((rule) => (
        rule.enabled && shouldRuleApply(rule, hostname, pathname)
    ));
}
