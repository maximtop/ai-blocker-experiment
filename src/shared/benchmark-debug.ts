/* eslint-disable no-console */

// Debug utilities for embedding benchmark
// Exposed globally for easy console access in background console

import type { BackgroundManager } from '../background/background-manager';

/**
 * Get the benchmark instance from the background manager
 * @returns The benchmark instance
 */
function getBenchmark() {
    const bgManager = (
        globalThis as { backgroundManager?: BackgroundManager }
    ).backgroundManager;
    if (!bgManager) {
        throw new Error(
            'BackgroundManager not initialized. '
                + 'Wait a moment and try again.',
        );
    }
    return bgManager.llmService.benchmark;
}

/**
 * Global benchmark utilities for console debugging
 */
const embeddingBenchmark = {
    /**
     * Enable benchmarking
     */
    async enable() {
        const benchmark = getBenchmark();
        await benchmark.setEnabled(true);
        console.log('✅ Embedding benchmarking enabled (cache bypassed)');
    },

    /**
     * Disable benchmarking
     */
    async disable() {
        const benchmark = getBenchmark();
        await benchmark.setEnabled(false);
        console.log('✅ Embedding benchmarking disabled (cache restored)');
    },

    /**
     * Get benchmark results from storage
     * @returns {Promise<object>} Benchmark data
     */
    async getResults() {
        const benchmark = getBenchmark();
        const benchmarkData = benchmark.getData();

        console.log('📊 Benchmark Results:', benchmarkData);

        // Pretty print the statistics
        const stats = Object.values(
            benchmarkData.modelStats as Record<string, unknown>,
        );
        if (stats.length === 0) {
            console.log('No measurements recorded yet.');
        } else {
            // Separate models into embedding, prompt, and vision categories
            const embeddingStats: unknown[] = [];
            const promptStats: unknown[] = [];
            const visionStats: unknown[] = [];

            stats.forEach((stat: unknown) => {
                const s = stat as {
                    model: string;
                    visionStats?: { count: number };
                };
                if (s.visionStats && s.visionStats.count > 0) {
                    visionStats.push(stat);
                } else if (s.model.includes('embedding')) {
                    embeddingStats.push(stat);
                } else {
                    promptStats.push(stat);
                }
            });

            // Display embedding analysis results
            if (embeddingStats.length > 0) {
                console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('🔢 EMBEDDING ANALYSIS BENCHMARKS');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

                embeddingStats.forEach((stat: unknown) => {
                    const s = stat as {
                        provider: string;
                        model: string;
                        measurementCount: number;
                        averageDurationMs: number;
                        minDurationMs: number;
                        maxDurationMs: number;
                        totalPromptTokens: number;
                        totalCompletionTokens: number;
                        totalTokens: number;
                        averagePromptTokens: number;
                        averageCompletionTokens: number;
                        averageTotalTokens: number;
                        totalCost: number;
                        averageCost: number;
                        jsonErrorCount?: number;
                        jsonErrorRate?: number;
                        accuracy?: {
                            totalWithGroundTruth: number;
                            correct: number;
                            incorrect: number;
                            accuracy: number;
                            truePositives: number;
                            trueNegatives: number;
                            falsePositives: number;
                            falseNegatives: number;
                            precision: number;
                            recall: number;
                            f1Score: number;
                        };
                    };
                    console.log(`\n📈 ${s.provider}/${s.model}:`);
                    console.log(`   Requests: ${s.measurementCount}`);
                    console.log(`   Average: ${s.averageDurationMs.toFixed(2)}ms`);
                    console.log(`   Min: ${s.minDurationMs.toFixed(2)}ms`);
                    console.log(`   Max: ${s.maxDurationMs.toFixed(2)}ms`);

                    if (s.totalTokens > 0) {
                        const tokensK = (s.totalTokens / 1000).toFixed(1);
                        const totalMsg = '   Total Tokens: '
                            + `${s.totalTokens} (~${tokensK}K)`;
                        console.log(totalMsg);
                        console.log(`     - Input (prompt): ${s.totalPromptTokens}`);
                        const outMsg = '     - Output (completion): '
                            + `${s.totalCompletionTokens}`;
                        console.log(outMsg);
                        const avgMsg = '   Avg Tokens/Request: '
                            + `${Math.round(s.averageTotalTokens)}`;
                        console.log(avgMsg);
                        const avgInMsg = '     - Input: '
                            + `${Math.round(s.averagePromptTokens)}`;
                        console.log(avgInMsg);
                        const avgOutMsg = '     - Output: '
                            + `${Math.round(s.averageCompletionTokens)}`;
                        console.log(avgOutMsg);

                        if (s.totalCost > 0) {
                            const costMsg = '   💰 Total Cost: '
                                + `$${s.totalCost.toFixed(6)}`;
                            console.log(costMsg);
                            const avgCostMsg = '   💰 Avg Cost/Request: '
                                + `$${s.averageCost.toFixed(6)}`;
                            console.log(avgCostMsg);
                        }
                    } else {
                        console.log('   ℹ️  No token usage data available');
                        console.log('      (provider does not return usage info)');
                    }

                    // Display accuracy metrics if available
                    if (s.accuracy) {
                        const { accuracy: acc } = s;
                        const metricsHeader = '\n   🎯 ACCURACY METRICS '
                            + `(${acc.totalWithGroundTruth} samples):`;
                        console.log(metricsHeader);
                        const accPct = (acc.accuracy * 100).toFixed(1);
                        console.log(`   Overall Accuracy: ${accPct}%`);
                        console.log(`     - Correct: ${acc.correct}`);
                        console.log(`     - Incorrect: ${acc.incorrect}`);
                        console.log('   Confusion Matrix:');
                        const tpMsg = '     - True Positives (Ad → Blocked): '
                            + `${acc.truePositives}`;
                        console.log(tpMsg);
                        const tnMsg = '     - True Negatives (Non-Ad → Kept): '
                            + `${acc.trueNegatives}`;
                        console.log(tnMsg);
                        const fpMsg = '     - False Positives '
                            + '(Non-Ad → Blocked): '
                            + `${acc.falsePositives}`;
                        console.log(fpMsg);
                        const fnMsg = '     - False Negatives (Ad → Kept): '
                            + `${acc.falseNegatives}`;
                        console.log(fnMsg);
                        const precPct = (acc.precision * 100).toFixed(1);
                        const recallPct = (acc.recall * 100).toFixed(1);
                        const f1Pct = (acc.f1Score * 100).toFixed(1);
                        console.log(`   Precision: ${precPct}%`);
                        console.log(`   Recall: ${recallPct}%`);
                        console.log(`   F1 Score: ${f1Pct}%`);
                    }
                });
            }

            // Display prompt analysis results
            if (promptStats.length > 0) {
                console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('📝 PROMPT ANALYSIS BENCHMARKS');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

                promptStats.forEach((stat: unknown) => {
                    const s = stat as {
                        provider: string;
                        model: string;
                        measurementCount: number;
                        averageDurationMs: number;
                        minDurationMs: number;
                        maxDurationMs: number;
                        totalPromptTokens: number;
                        totalCompletionTokens: number;
                        totalTokens: number;
                        averagePromptTokens: number;
                        averageCompletionTokens: number;
                        averageTotalTokens: number;
                        totalCost: number;
                        averageCost: number;
                        jsonErrorCount?: number;
                        jsonErrorRate?: number;
                        accuracy?: {
                            totalWithGroundTruth: number;
                            correct: number;
                            incorrect: number;
                            accuracy: number;
                            truePositives: number;
                            trueNegatives: number;
                            falsePositives: number;
                            falseNegatives: number;
                            precision: number;
                            recall: number;
                            f1Score: number;
                        };
                    };
                    console.log(`\n📈 ${s.provider}/${s.model}:`);
                    console.log(`   Requests: ${s.measurementCount}`);
                    console.log(`   Average: ${s.averageDurationMs.toFixed(2)}ms`);
                    console.log(`   Min: ${s.minDurationMs.toFixed(2)}ms`);
                    console.log(`   Max: ${s.maxDurationMs.toFixed(2)}ms`);

                    // Show JSON error stats if any errors occurred
                    if (s.jsonErrorCount && s.jsonErrorCount > 0) {
                        const jsonErrPct = (s.jsonErrorRate! * 100).toFixed(1);
                        console.log(`   ⚠️  JSON Format Errors: ${s.jsonErrorCount} (${jsonErrPct}%)`);
                    }

                    if (s.totalTokens > 0) {
                        const tokensK = (s.totalTokens / 1000).toFixed(1);
                        const totalMsg = '   Total Tokens: '
                            + `${s.totalTokens} (~${tokensK}K)`;
                        console.log(totalMsg);
                        console.log(`     - Input (prompt): ${s.totalPromptTokens}`);
                        const outMsg = '     - Output (completion): '
                            + `${s.totalCompletionTokens}`;
                        console.log(outMsg);
                        const avgMsg = '   Avg Tokens/Request: '
                            + `${Math.round(s.averageTotalTokens)}`;
                        console.log(avgMsg);
                        const avgInMsg = '     - Input: '
                            + `${Math.round(s.averagePromptTokens)}`;
                        console.log(avgInMsg);
                        const avgOutMsg = '     - Output: '
                            + `${Math.round(s.averageCompletionTokens)}`;
                        console.log(avgOutMsg);

                        if (s.totalCost > 0) {
                            const costMsg = '   💰 Total Cost: '
                                + `$${s.totalCost.toFixed(6)}`;
                            console.log(costMsg);
                            const avgCostMsg = '   💰 Avg Cost/Request: '
                                + `$${s.averageCost.toFixed(6)}`;
                            console.log(avgCostMsg);
                        }
                    } else {
                        console.log('   ℹ️  No token usage data available');
                        console.log('      (provider does not return usage info)');
                    }

                    // Display accuracy metrics if available
                    if (s.accuracy) {
                        const { accuracy: acc } = s;
                        const metricsHeader = '\n   🎯 ACCURACY METRICS '
                            + `(${acc.totalWithGroundTruth} samples):`;
                        console.log(metricsHeader);
                        const accPct = (acc.accuracy * 100).toFixed(1);
                        console.log(`   Overall Accuracy: ${accPct}%`);
                        console.log(`     - Correct: ${acc.correct}`);
                        console.log(`     - Incorrect: ${acc.incorrect}`);
                        console.log('   Confusion Matrix:');
                        const tpMsg = '     - True Positives (Ad → Blocked): '
                            + `${acc.truePositives}`;
                        console.log(tpMsg);
                        const tnMsg = '     - True Negatives (Non-Ad → Kept): '
                            + `${acc.trueNegatives}`;
                        console.log(tnMsg);
                        const fpMsg = '     - False Positives '
                            + '(Non-Ad → Blocked): '
                            + `${acc.falsePositives}`;
                        console.log(fpMsg);
                        const fnMsg = '     - False Negatives (Ad → Kept): '
                            + `${acc.falseNegatives}`;
                        console.log(fnMsg);
                        const precPct = (acc.precision * 100).toFixed(1);
                        const recallPct = (acc.recall * 100).toFixed(1);
                        const f1Pct = (acc.f1Score * 100).toFixed(1);
                        console.log(`   Precision: ${precPct}%`);
                        console.log(`   Recall: ${recallPct}%`);
                        console.log(`   F1 Score: ${f1Pct}%`);
                    }
                });
            }

            // Display vision analysis results
            if (visionStats.length > 0) {
                console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('📸 VISION ANALYSIS BENCHMARKS');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

                visionStats.forEach((stat: unknown) => {
                    const s = stat as {
                        provider: string;
                        model: string;
                        measurementCount: number;
                        averageDurationMs: number;
                        minDurationMs: number;
                        maxDurationMs: number;
                        totalPromptTokens: number;
                        totalCompletionTokens: number;
                        totalTokens: number;
                        averagePromptTokens: number;
                        averageCompletionTokens: number;
                        averageTotalTokens: number;
                        totalCost: number;
                        averageCost: number;
                        jsonErrorCount?: number;
                        jsonErrorRate?: number;
                        accuracy?: {
                            totalWithGroundTruth: number;
                            correct: number;
                            incorrect: number;
                            accuracy: number;
                            truePositives: number;
                            trueNegatives: number;
                            falsePositives: number;
                            falseNegatives: number;
                            precision: number;
                            recall: number;
                            f1Score: number;
                        };
                        visionStats: {
                            count: number;
                            totalImageSizeBytes: number;
                            averageImageSizeBytes: number;
                            detailLevels: {
                                auto: number;
                                low: number;
                                high: number;
                            };
                        };
                    };
                    console.log(`\n📈 ${s.provider}/${s.model}:`);
                    console.log(`   Requests: ${s.measurementCount}`);
                    console.log(`   Average: ${s.averageDurationMs.toFixed(2)}ms`);
                    console.log(`   Min: ${s.minDurationMs.toFixed(2)}ms`);
                    console.log(`   Max: ${s.maxDurationMs.toFixed(2)}ms`);

                    // Show JSON error stats if any errors occurred
                    if (s.jsonErrorCount && s.jsonErrorCount > 0) {
                        const jsonErrPct = (s.jsonErrorRate! * 100).toFixed(1);
                        console.log(`   ⚠️  JSON Format Errors: ${s.jsonErrorCount} (${jsonErrPct}%)`);
                    }

                    // Vision-specific stats
                    const { visionStats: vStats } = s;
                    const avgSizeKb = (vStats.averageImageSizeBytes / 1024)
                        .toFixed(2);
                    console.log(`   Avg Image Size: ${avgSizeKb} KB`);
                    console.log(
                        '   Detail Levels: '
                        + `auto=${vStats.detailLevels.auto}, `
                        + `low=${vStats.detailLevels.low}, `
                        + `high=${vStats.detailLevels.high}`,
                    );

                    // Token usage
                    if (s.totalTokens > 0) {
                        const tokensK = (s.totalTokens / 1000).toFixed(1);
                        const totalMsg = '   Total Tokens: '
                            + `${s.totalTokens} (~${tokensK}K)`;
                        console.log(totalMsg);
                        const inMsg = '     - Input (text + image): '
                            + `${s.totalPromptTokens}`;
                        console.log(inMsg);
                        const outMsg = '     - Output (completion): '
                            + `${s.totalCompletionTokens}`;
                        console.log(outMsg);
                        const avgMsg = '   Avg Tokens/Request: '
                            + `${Math.round(s.averageTotalTokens)}`;
                        console.log(avgMsg);
                        const avgInMsg = '     - Input: '
                            + `${Math.round(s.averagePromptTokens)}`;
                        console.log(avgInMsg);
                        const avgOutMsg = '     - Output: '
                            + `${Math.round(s.averageCompletionTokens)}`;
                        console.log(avgOutMsg);

                        if (s.totalCost > 0) {
                            const costMsg = '   💰 Total Cost: '
                                + `$${s.totalCost.toFixed(6)}`;
                            console.log(costMsg);
                            const avgCostMsg = '   💰 Avg Cost/Request: '
                                + `$${s.averageCost.toFixed(6)}`;
                            console.log(avgCostMsg);
                        }
                    } else {
                        console.log('   ℹ️  No token usage data available');
                        console.log('      (provider does not return usage info)');
                    }

                    // Display accuracy metrics if available
                    if (s.accuracy) {
                        const { accuracy: acc } = s;
                        const metricsHeader = '\n   🎯 ACCURACY METRICS '
                            + `(${acc.totalWithGroundTruth} samples):`;
                        console.log(metricsHeader);
                        const accPct = (acc.accuracy * 100).toFixed(1);
                        console.log(`   Overall Accuracy: ${accPct}%`);
                        console.log(`     - Correct: ${acc.correct}`);
                        console.log(`     - Incorrect: ${acc.incorrect}`);
                        console.log('   Confusion Matrix:');
                        const tpMsg = '     - True Positives (Ad → Blocked): '
                            + `${acc.truePositives}`;
                        console.log(tpMsg);
                        const tnMsg = '     - True Negatives (Non-Ad → Kept): '
                            + `${acc.trueNegatives}`;
                        console.log(tnMsg);
                        const fpMsg = '     - False Positives '
                            + '(Non-Ad → Blocked): '
                            + `${acc.falsePositives}`;
                        console.log(fpMsg);
                        const fnMsg = '     - False Negatives (Ad → Kept): '
                            + `${acc.falseNegatives}`;
                        console.log(fnMsg);
                        const precPct = (acc.precision * 100).toFixed(1);
                        const recallPct = (acc.recall * 100).toFixed(1);
                        const f1Pct = (acc.f1Score * 100).toFixed(1);
                        console.log(`   Precision: ${precPct}%`);
                        console.log(`   Recall: ${recallPct}%`);
                        console.log(`   F1 Score: ${f1Pct}%`);
                    }
                });
            }
        }

        return benchmarkData;
    },

    /**
     * Clear all benchmark data from storage
     */
    async clear() {
        const benchmark = getBenchmark();
        const currentData = benchmark.getData();
        const modelCount = Object.keys(currentData.modelStats).length;

        // Show what's being cleared
        if (modelCount > 0) {
            console.log(`🗑️  Clearing benchmark data for ${modelCount} model(s):`);
            Object.values(currentData.modelStats).forEach((stats: unknown) => {
                const s = stats as {
                    provider: string;
                    model: string;
                    measurementCount: number;
                };
                console.log(`   - ${s.provider}/${s.model}: ${s.measurementCount} measurements`);
            });
        }

        await benchmark.clear();
        console.log('✅ Benchmark data cleared');
    },

    /**
     * Show help
     */
    help() {
        console.log(`
📊 Benchmark Utilities (Embedding, Prompt & Vision Analysis)

Available commands:
  embeddingBenchmark.clear()        - Clear all benchmark data (do this first!)
  embeddingBenchmark.enable()       - Enable benchmarking (bypasses cache)
  embeddingBenchmark.disable()      - Disable benchmarking (restores cache)
  embeddingBenchmark.getResults()   - View benchmark results
  embeddingBenchmark.help()         - Show this help

Example workflow:
  1. await embeddingBenchmark.clear();      // Clear old data
  2. await embeddingBenchmark.enable();     // Start benchmarking
  3. // ... reload test pages to collect data ...
  4. await embeddingBenchmark.getResults(); // View results
  5. await embeddingBenchmark.disable();    // Stop benchmarking

Note: Benchmark data persists across browser sessions. Always clear()
      before starting a new test to avoid mixing old and new measurements.

      Accuracy tracking works with data-ground-truth attributes:
      - Use test-page/debug.html for accuracy testing
      - Elements with data-ground-truth="ad" or "not-ad" will track accuracy
        `);
    },
};

(globalThis as unknown as { embeddingBenchmark: typeof embeddingBenchmark })
    .embeddingBenchmark = embeddingBenchmark;

// Show help on load
console.log('📊 Benchmark utilities loaded. Type embeddingBenchmark.help() for commands.');
console.log('💡 Quick start: await embeddingBenchmark.clear() → enable() → test → getResults()');
