/**
 * backend/src/modules/worker-selection/ranking/performance-provider.interface.ts
 *
 * Interface for future verified Worker Performance Score integration.
 * DO NOT fabricate or mock ratings in live selection.
 */

export interface IPerformanceScoreProvider {
  /**
   * Returns a verified performance score normalized to a 0–100 scale.
   * If the worker has no verified performance history, returns null.
   */
  getVerifiedPerformanceScore(workerId: string): Promise<number | null>;
}
