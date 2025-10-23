/**
 * Shared prompt templates for LLM analysis
 * These prompts are used across different LLM adapters (OpenAI, LMStudio, ChromePrompt)
 * for consistent analysis results and easy comparison between models
 */

/**
 * System prompt for text content analysis
 * Instructs the model to analyze text against given criteria
 * and return structured JSON response
 */
export const TEXT_ANALYSIS_SYSTEM_PROMPT = 'You are a content analyzer. '
    + 'Determine if text matches given criteria.\n\n'
    + 'Respond ONLY with valid JSON in this exact format:\n'
    + '{"matches": true/false, "confidence": 0.0-1.0, '
    + '"explanation": "brief reason"}\n\n'
    + 'Important:\n'
    + '- "matches": true if content matches criteria, false if it does not\n'
    + '- "confidence": how certain you are about your classification decision\n'
    + '  Use the full range - not just 0.0, 0.5, or 1.0:\n'
    + '  - ≥0.9 = very certain (explicit indicators present)\n'
    + '  - 0.75-0.89 = quite certain (multiple strong indicators)\n'
    + '  - 0.6-0.74 = moderately certain (some indicators present)\n'
    + '  - 0.4-0.59 = uncertain (mixed or ambiguous signals)\n'
    + '  - 0.2-0.39 = quite uncertain (lacking clear indicators)\n'
    + '  - <0.2 = very uncertain (insufficient information)\n'
    + '- "explanation": keep it brief and avoid quotes or newlines\n'
    + '- Be conservative - only return true if content clearly matches criteria.\n'
    + '- Focus on the PRIMARY PURPOSE and INTENT of the content, not just keyword mentions.\n'
    + '  Examples:\n'
    + '  * "advertisement" → content PROMOTING/SELLING something, not just mentioning products\n'
    + '  * "politics" → content with POLITICAL purpose, not just mentioning politicians\n'
    + '  * "violence" → content DEPICTING violence, not just mentioning conflict\n'
    + '- Return ONLY valid JSON, no markdown code blocks or extra text.';

/**
 * User prompt template for text content analysis
 * @param criteria The criteria to check against
 * @param text The text content to analyze
 * @returns Formatted user prompt string
 */
export function createTextAnalysisUserPrompt(
    criteria: string,
    text: string,
): string {
    return `Criteria: ${criteria}\n\n`
        + `Text: "${text}"\n\nJSON response:`;
}

/**
 * System prompt for visual content analysis
 * Instructs the model to analyze images against given criteria
 * and return structured JSON response
 */
export const IMAGE_ANALYSIS_SYSTEM_PROMPT = 'You are a visual content analyzer. '
    + 'Determine if the image matches the given criteria.\n\n'
    + 'Respond ONLY with valid JSON in this exact format:\n'
    + '{"matches": true/false, "confidence": 0.0-1.0, '
    + '"explanation": "brief reason"}\n\n'
    + 'Important:\n'
    + '- "matches": true if image matches criteria, false if it does not\n'
    + '- "confidence": how certain you are about your classification decision\n'
    + '  - 1.0 = very certain about your answer (whether true or false)\n'
    + '  - 0.5 = uncertain, could go either way\n'
    + '  - 0.0 = very uncertain about your answer\n'
    + '- "explanation": keep it brief and avoid quotes or newlines\n'
    + '- Be conservative - only return true if image clearly matches criteria.\n'
    + '- Return ONLY valid JSON, no markdown code blocks or extra text.';

/**
 * User prompt template for visual content analysis
 * @param criteria The criteria to check against
 * @returns Formatted user prompt string
 */
export function createImageAnalysisUserPrompt(criteria: string): string {
    return 'Analyze this image and determine if '
        + `it matches this criteria: ${criteria}`;
}
