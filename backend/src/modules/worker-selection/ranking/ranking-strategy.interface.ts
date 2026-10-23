/**
 * backend/src/modules/worker-selection/ranking/ranking-strategy.interface.ts
 *
 * Interface for deterministic Worker Ranking Strategies.
 */

export interface CandidateEvaluation {
  workerId: string;
  workerName: string;
  workerType: string;
  respondedAt: Date;
  distanceKm: number;
  distanceScore: number;
  performanceScore?: number;
  combinedScore?: number;
  eligible: boolean;
  ineligibilityReason?: string;
}

export interface IRankingStrategy {
  readonly name: string;
  /**
   * Sorts candidate evaluations deterministically according to the strategy's rules.
   * Only eligible candidates should be placed at the top.
   */
  rank(candidates: CandidateEvaluation[]): CandidateEvaluation[];
}
