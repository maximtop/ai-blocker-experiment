/**
 * Vector mathematics utilities for LLM operations
 */
export class VectorMath {
    /**
     * Calculate cosine similarity between two vectors
     * @param a First vector
     * @param b Second vector
     * @returns Similarity score between 0 and 1
     * @throws {Error} When vectors have different lengths
     */
    static cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error('Vectors must have the same length');
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i += 1) {
            dotProduct += a[i]! * b[i]!;
            normA += a[i]! * a[i]!;
            normB += b[i]! * b[i]!;
        }

        normA = Math.sqrt(normA);
        normB = Math.sqrt(normB);

        if (normA === 0 || normB === 0) {
            return 0;
        }

        return dotProduct / (normA * normB);
    }
}
