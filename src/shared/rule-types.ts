/**
 * Shared rule type definitions used across background and content scripts
 */

import type { RuleType } from './constants';
import { RULE_TYPE } from './constants';

/**
 * Base rule interface
 */
interface BaseRule {
    /**
     * Unique identifier for the rule
     */
    id: string;

    /**
     * CSS selector to find elements on the page
     */
    selector: string;

    /**
     * Whether the rule is currently active
     */
    enabled: boolean;

    /**
     * Original rule string as entered by the user
     */
    ruleString: string;

    /**
     * Type of rule (embedding, prompt, or vision)
     */
    type: RuleType;

    /**
     * Domain patterns where this rule should apply
     * Supports exact matches, wildcards (*.example.com), and path patterns
     * Empty array means apply to all sites
     */
    domains: string[];
}

/**
 * Embedding-based rule
 */
export interface EmbeddingRule extends BaseRule {
    type: typeof RULE_TYPE.EMBEDDING;
    containsText: string;
}

/**
 * LLM prompt-based rule
 */
export interface PromptRule extends BaseRule {
    type: typeof RULE_TYPE.PROMPT;
    prompt: string;
}

/**
 * Vision-based rule
 */
export interface VisionRule extends BaseRule {
    type: typeof RULE_TYPE.VISION;
    criteria: string;
}

/**
 * Union type for all rule types
 */
export type Rule = EmbeddingRule | PromptRule | VisionRule;

/**
 * Candidate element with metadata
 */
export interface CandidateElement {
    element: Element;
    text: string;
    rect: DOMRect;
    selector: string;
}

/**
 * Message response from background
 */
export interface MessageResponse {
    blockingEnabled?: boolean;
    rules?: Rule[];
}

/**
 * Screenshot response from background
 */
export interface ScreenshotResponse {
    success?: boolean;
    filename?: string;
    visionAnalysis?: VisionAnalysisResult;
    error?: string;
}

/**
 * Vision analysis result
 */
export interface VisionAnalysisResult {
    matches: boolean;
    confidence: number;
    threshold: number;
    explanation: string;
    filename?: string;
}
