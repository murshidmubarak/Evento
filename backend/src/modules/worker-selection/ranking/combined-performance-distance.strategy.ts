import type { IRankingStrategy, CandidateEvaluation } from './ranking-strategy.interface.js';

/**
 * CombinedPerformanceDistanceRankingStrategy
 *
 * Architecture-ready strategy for future verified performance scoring:
 * Combined Score = (Performance Score * 0.55) + (Distance Score * 0.45)
 *
 * Deterministic tie-breaking rules:
 * 1. Enforce worker eligibility before ranking (ineligibles at the bottom).
 * 2. Rank by highest combined score (descending).
 * 3. Resolve tied combined score by higher performance score (descending).
 * 4. Resolve additional tie by shorter distance (ascending distanceKm).
 * 5. Resolve identical performance and distance by earlier server-recorded interest timestamp.
 * 6. Use stable unique Worker identifier as final tie-breaker.
 */
export class CombinedPerformanceDistanceRankingStrategy implements IRankingStrategy {
  public readonly name = 'combined-performance-distance';

  /**
   * Pure calculation helper for combined score
   */
  static calculateCombinedScore(performanceScore100: number, distanceScore100: number): number {
    const raw = performanceScore100 * 0.55 + distanceScore100 * 0.45;
    return Math.round(raw * 1000) / 1000;
  }

  rank(candidates: CandidateEvaluation[]): CandidateEvaluation[] {
    const list = candidates.map((c) => {
      const perf = c.performanceScore ?? 0;
      const dist = c.distanceScore ?? 0;
      const combined = CombinedPerformanceDistanceRankingStrategy.calculateCombinedScore(perf, dist);
      return {
        ...c,
        combinedScore: combined,
      };
    });

    list.sort((a, b) => {
      // 1. Ineligible candidates to the bottom
      if (a.eligible && !b.eligible) return -1;
      if (!a.eligible && b.eligible) return 1;
      if (!a.eligible && !b.eligible) return a.workerId.localeCompare(b.workerId);

      // 2. Highest combined score first (descending)
      const combinedDiff = (b.combinedScore ?? 0) - (a.combinedScore ?? 0);
      if (Math.abs(combinedDiff) >= 0.001) {
        return combinedDiff;
      }

      // 3. Tied combined score -> higher performance score wins (descending)
      const perfDiff = (b.performanceScore ?? 0) - (a.performanceScore ?? 0);
      if (Math.abs(perfDiff) >= 0.001) {
        return perfDiff;
      }

      // 4. Tied performance score -> shorter distance wins (ascending)
      const distDiff = a.distanceKm - b.distanceKm;
      if (Math.abs(distDiff) >= 0.001) {
        return distDiff;
      }

      // 5. Earlier server-recorded interest timestamp wins (ascending)
      const timeDiff = a.respondedAt.getTime() - b.respondedAt.getTime();
      if (timeDiff !== 0) {
        return timeDiff;
      }

      // 6. Stable unique identifier tie-breaker
      return a.workerId.localeCompare(b.workerId);
    });

    return list;
  }
}
