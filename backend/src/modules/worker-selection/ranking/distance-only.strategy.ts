import type { IRankingStrategy, CandidateEvaluation } from './ranking-strategy.interface.js';

/**
 * DistanceOnlyRankingStrategy
 *
 * Current operational ranking strategy when Worker Performance Management is not yet implemented.
 *
 * Ranking criteria (Deterministic):
 * 1. Shorter valid distance first (ascending distanceKm).
 * 2. If distance is tied within comparison precision (0.001 km / 1 m), earlier server-recorded interest timestamp.
 * 3. If timestamps are identical, stable unique Worker identifier (workerId string comparison).
 */
export class DistanceOnlyRankingStrategy implements IRankingStrategy {
  public readonly name = 'distance-only';

  rank(candidates: CandidateEvaluation[]): CandidateEvaluation[] {
    const list = [...candidates];

    list.sort((a, b) => {
      // 1. Ineligible candidates always sort to the bottom
      if (a.eligible && !b.eligible) return -1;
      if (!a.eligible && b.eligible) return 1;
      if (!a.eligible && !b.eligible) return a.workerId.localeCompare(b.workerId);

      // 2. Shorter distance first (within 0.001 km tolerance)
      const distDiff = a.distanceKm - b.distanceKm;
      if (Math.abs(distDiff) >= 0.001) {
        return distDiff;
      }

      // 3. Distance tied -> earlier server-recorded interest timestamp wins
      const timeDiff = a.respondedAt.getTime() - b.respondedAt.getTime();
      if (timeDiff !== 0) {
        return timeDiff;
      }

      // 4. Stable unique identifier tie-breaker
      return a.workerId.localeCompare(b.workerId);
    });

    return list;
  }
}
