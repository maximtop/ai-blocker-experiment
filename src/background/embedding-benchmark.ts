import {
    EMBEDDING_BENCHMARK_CONFIG,
    STORAGE_KEYS,
} from '../shared/constants';
import { createLogger } from '../shared/logger';
import { getModelInfo } from '../shared/model-utils';
import { Storage } from '../shared/storage';

const logger = createLogger('EmbeddingBenchmark');

/**
 * Text type for categorizing embeddings
 */
export type EmbeddingTextType = 'content' | 'query';

/**
 * Single measurement data point
 */
export interface BenchmarkMeasurement {
    timestamp: number;
    durationMs: number;
    textLength: number;
    provider: string;
    model: string;
    textType?: EmbeddingTextType;
    imageSize?: number;
    imageDetail?: 'auto' | 'low' | 'high';
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    cost?: number;
    groundTruth?: 'ad' | 'not-ad';
    llmResult?: boolean;
    isCorrect?: boolean;
    hadJsonError?: boolean;
}

/**
 * Statistics for a model
 */
export interface ModelStatistics {
    provider: string;
    model: string;
    measurementCount: number;
    averageDurationMs: number;
    minDurationMs: number;
    maxDurationMs: number;
    measurements: BenchmarkMeasurement[];
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    averagePromptTokens: number;
    averageCompletionTokens: number;
    averageTotalTokens: number;
    totalCost: number;
    averageCost: number;
    jsonErrorCount: number;
    jsonErrorRate: number;
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
    visionStats?: {
        count: number;
        totalImageSizeBytes: number;
        averageImageSizeBytes: number;
        detailLevels: {
            auto: number;
            low: number;
            high: number;
        };
    };
}

/**
 * Complete benchmark data structure
 */
export interface BenchmarkData {
    enabled: boolean;
    modelStats: Record<string, ModelStatistics>;
}

/**
 * Embedding benchmark service for performance testing
 * Tracks embedding API call performance across different models/providers
 */
export class EmbeddingBenchmark {
    private enabled: boolean;

    private data: BenchmarkData;

    constructor() {
        this.enabled = EMBEDDING_BENCHMARK_CONFIG.DEFAULT_ENABLED;
        this.data = {
            enabled: this.enabled,
            modelStats: {},
        };
    }

    /**
     * Initialize benchmark service from storage
     */
    async init(): Promise<void> {
        try {
            // FIXME use default in this case
            const storedEnabled = await Storage.get(
                STORAGE_KEYS.EMBEDDING_BENCHMARK_ENABLED,
            ) as boolean | undefined;

            // FIXME use default data (empty object) in this case
            const storedData = await Storage.get(
                STORAGE_KEYS.EMBEDDING_BENCHMARK_DATA,
            ) as BenchmarkData | undefined;

            this.enabled = storedEnabled ?? this.enabled;

            if (storedData) {
                this.data = storedData;
                this.data.enabled = this.enabled;
            }

            const status = this.enabled ? 'enabled' : 'disabled';
            const modelCount = Object.keys(this.data.modelStats).length;
            logger.info(
                `Benchmark ${status} with ${modelCount} model(s) tracked`,
            );
        } catch (error) {
            logger.error('Failed to initialize benchmark:', error);
        }
    }

    /**
     * Check if benchmarking is enabled
     * @returns True if benchmarking is enabled
     */
    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Enable or disable benchmarking
     * @param enabled New enabled state
     */
    async setEnabled(enabled: boolean): Promise<void> {
        this.enabled = enabled;
        this.data.enabled = enabled;

        await Storage.set(
            STORAGE_KEYS.EMBEDDING_BENCHMARK_ENABLED,
            enabled,
        );

        const status = enabled ? 'enabled' : 'disabled';
        logger.info(`Benchmark ${status}`);
    }

    /**
     * Record a measurement
     * @param modelId Unique model ID (provider:modelName format)
     * @param durationMs Duration in milliseconds
     * @param textLength Length of text that was embedded
     * @param textType Type of text being embedded (content or query)
     * @param imageSize Size of image in bytes (for vision models)
     * @param imageDetail Detail level for image processing
     * @param usage Token usage from provider API
     * @param usage.promptTokens Input tokens used
     * @param usage.completionTokens Output tokens generated
     * @param usage.totalTokens Total tokens used
     * @param usage.cost Cost in USD
     * @param groundTruth Ground truth label for accuracy tracking
     * @param llmResult LLM decision result (matches=true/false)
     * @param hadJsonError Whether JSON parsing error occurred
     */
    async recordMeasurement(
        modelId: string,
        durationMs: number,
        textLength: number,
        textType?: EmbeddingTextType,
        imageSize?: number,
        imageDetail?: 'auto' | 'low' | 'high',
        usage?: {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
            cost?: number;
        },
        groundTruth?: 'ad' | 'not-ad',
        llmResult?: boolean,
        hadJsonError?: boolean,
    ): Promise<void> {
        if (!this.enabled) {
            return;
        }

        // Get model info from registry to get provider
        const modelInfo = getModelInfo(modelId);
        const { provider } = modelInfo;

        // Calculate if result is correct (if we have ground truth)
        let isCorrect: boolean | undefined;
        if (groundTruth !== undefined && llmResult !== undefined) {
            const expectedResult = groundTruth === 'ad';
            isCorrect = llmResult === expectedResult;
        }

        const measurement: BenchmarkMeasurement = {
            timestamp: Date.now(),
            durationMs,
            textLength,
            provider,
            model: modelId,
            textType,
            imageSize,
            imageDetail,
            promptTokens: usage?.promptTokens,
            completionTokens: usage?.completionTokens,
            totalTokens: usage?.totalTokens,
            cost: usage?.cost,
            groundTruth,
            llmResult,
            isCorrect,
            hadJsonError,
        };

        // Initialize model stats if needed
        if (!this.data.modelStats[modelId]) {
            this.data.modelStats[modelId] = {
                provider,
                model: modelId,
                measurementCount: 0,
                averageDurationMs: 0,
                minDurationMs: Infinity,
                maxDurationMs: 0,
                totalPromptTokens: 0,
                totalCompletionTokens: 0,
                totalTokens: 0,
                averagePromptTokens: 0,
                averageCompletionTokens: 0,
                averageTotalTokens: 0,
                totalCost: 0,
                averageCost: 0,
                jsonErrorCount: 0,
                jsonErrorRate: 0,
                measurements: [],
            };
        }

        const stats = this.data.modelStats[modelId];

        // Add measurement (keep only last N measurements)
        stats.measurements.push(measurement);
        const maxMeas = EMBEDDING_BENCHMARK_CONFIG.MAX_MEASUREMENTS_PER_MODEL;
        if (stats.measurements.length > maxMeas) {
            stats.measurements.shift();
        }

        // Recalculate statistics from current measurements
        this.recalculateStatistics(stats);

        // Save to storage
        await this.save();

        const msg = `📊 ${provider}/${modelId}: ${durationMs.toFixed(2)}ms `
            + `(avg: ${stats.averageDurationMs.toFixed(2)}ms, `
            + `count: ${stats.measurementCount})`;
        logger.info(msg);
    }

    /**
     * Recalculate statistics from measurements
     * @param stats Model statistics to update
     */
    private recalculateStatistics(stats: ModelStatistics): void {
        /* eslint-disable no-param-reassign */
        const { measurements } = stats;

        if (measurements.length === 0) {
            stats.measurementCount = 0;
            stats.averageDurationMs = 0;
            stats.minDurationMs = 0;
            stats.maxDurationMs = 0;
            stats.totalPromptTokens = 0;
            stats.totalCompletionTokens = 0;
            stats.totalTokens = 0;
            stats.averagePromptTokens = 0;
            stats.averageCompletionTokens = 0;
            stats.averageTotalTokens = 0;
            stats.totalCost = 0;
            stats.averageCost = 0;
            stats.jsonErrorCount = 0;
            stats.jsonErrorRate = 0;
            return;
        }

        stats.measurementCount = measurements.length;

        let durationSum = 0;
        let promptTokenSum = 0;
        let completionTokenSum = 0;
        let totalTokenSum = 0;
        let costSum = 0;
        let jsonErrorCount = 0;
        let min = Infinity;
        let max = 0;

        // Count measurements with actual token data
        let measurementsWithTokens = 0;

        for (const m of measurements) {
            durationSum += m.durationMs;
            min = Math.min(min, m.durationMs);
            max = Math.max(max, m.durationMs);

            // Count JSON errors
            if (m.hadJsonError) {
                jsonErrorCount += 1;
            }

            // Use actual token data if available
            const hasTokenData = m.promptTokens !== undefined
                && m.completionTokens !== undefined;
            if (hasTokenData) {
                promptTokenSum += m.promptTokens!;
                completionTokenSum += m.completionTokens!;
                const total = m.totalTokens
                    || (m.promptTokens! + m.completionTokens!);
                totalTokenSum += total;
                costSum += m.cost || 0;
                measurementsWithTokens += 1;
            }
        }

        stats.averageDurationMs = durationSum / measurements.length;
        stats.minDurationMs = min;
        stats.maxDurationMs = max;

        // Set JSON error stats
        stats.jsonErrorCount = jsonErrorCount;
        stats.jsonErrorRate = jsonErrorCount / measurements.length;

        // Only set token stats if we have actual data
        if (measurementsWithTokens > 0) {
            stats.totalPromptTokens = promptTokenSum;
            stats.totalCompletionTokens = completionTokenSum;
            stats.totalTokens = totalTokenSum;
            stats.averagePromptTokens = promptTokenSum
                / measurementsWithTokens;
            stats.averageCompletionTokens = completionTokenSum
                / measurementsWithTokens;
            stats.averageTotalTokens = totalTokenSum
                / measurementsWithTokens;
            stats.totalCost = costSum;
            stats.averageCost = costSum / measurementsWithTokens;
        } else {
            stats.totalPromptTokens = 0;
            stats.totalCompletionTokens = 0;
            stats.totalTokens = 0;
            stats.averagePromptTokens = 0;
            stats.averageCompletionTokens = 0;
            stats.averageTotalTokens = 0;
            stats.totalCost = 0;
            stats.averageCost = 0;
        }

        // Calculate vision-specific stats (only track image metadata)
        const visionMeasurements = measurements.filter(
            (m) => m.imageSize !== undefined,
        );
        if (visionMeasurements.length > 0) {
            let imageSizeSum = 0;
            const detailCounts = { auto: 0, low: 0, high: 0 };

            for (const m of visionMeasurements) {
                imageSizeSum += m.imageSize || 0;
                const detail = m.imageDetail || 'auto';
                detailCounts[detail] += 1;
            }

            stats.visionStats = {
                count: visionMeasurements.length,
                totalImageSizeBytes: imageSizeSum,
                averageImageSizeBytes: imageSizeSum / visionMeasurements.length,
                detailLevels: detailCounts,
            };
        }

        // Calculate accuracy metrics (if we have ground truth data)
        const measurementsWithGroundTruth = measurements.filter(
            (m) => m.groundTruth !== undefined && m.llmResult !== undefined,
        );
        if (measurementsWithGroundTruth.length > 0) {
            let truePositives = 0;
            let trueNegatives = 0;
            let falsePositives = 0;
            let falseNegatives = 0;

            for (const m of measurementsWithGroundTruth) {
                const expectedAd = m.groundTruth === 'ad';
                const llmSaidAd = m.llmResult === true;

                if (expectedAd && llmSaidAd) {
                    truePositives += 1;
                } else if (!expectedAd && !llmSaidAd) {
                    trueNegatives += 1;
                } else if (!expectedAd && llmSaidAd) {
                    falsePositives += 1;
                } else if (expectedAd && !llmSaidAd) {
                    falseNegatives += 1;
                }
            }

            const correct = truePositives + trueNegatives;
            const total = measurementsWithGroundTruth.length;
            const accuracy = total > 0 ? correct / total : 0;

            // Calculate precision, recall, and F1 score
            const totalPredictedAds = truePositives + falsePositives;
            const totalActualAds = truePositives + falseNegatives;
            const precision = totalPredictedAds > 0
                ? truePositives / totalPredictedAds
                : 0;
            const recall = totalActualAds > 0
                ? truePositives / totalActualAds
                : 0;
            const f1Score = (precision + recall) > 0
                ? (2 * precision * recall) / (precision + recall)
                : 0;

            stats.accuracy = {
                totalWithGroundTruth: total,
                correct,
                incorrect: total - correct,
                accuracy,
                truePositives,
                trueNegatives,
                falsePositives,
                falseNegatives,
                precision,
                recall,
                f1Score,
            };
        }
        /* eslint-enable no-param-reassign */
    }

    /**
     * Get all benchmark data
     * @returns Complete benchmark data
     */
    getData(): BenchmarkData {
        return {
            enabled: this.enabled,
            modelStats: { ...this.data.modelStats },
        };
    }

    /**
     * Clear all benchmark data
     */
    async clear(): Promise<void> {
        this.data.modelStats = {};
        await this.save();
        logger.info('Benchmark data cleared');
    }

    /**
     * Save benchmark data to storage
     */
    private async save(): Promise<void> {
        await Storage.set(
            STORAGE_KEYS.EMBEDDING_BENCHMARK_DATA,
            this.data,
        );
    }
}
