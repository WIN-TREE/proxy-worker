import type { BackendConfig, RequestInfo, BackendMetrics } from '../types';

export class LoadBalancer {
  private static readonly REGION_MAP = new Map([
    ['CN', 'asia-east'], ['HK', 'asia-east'], ['TW', 'asia-east'],
    ['JP', 'asia-northeast'], ['KR', 'asia-northeast'],
    ['SG', 'asia-southeast'], ['MY', 'asia-southeast'], ['TH', 'asia-southeast'],
    ['ID', 'asia-southeast'], ['PH', 'asia-southeast'], ['VN', 'asia-southeast'],
    ['IN', 'asia-south'], ['PK', 'asia-south'], ['BD', 'asia-south'],
    ['US', 'us-west'], ['CA', 'us-west'], ['MX', 'americas-north'],
    ['BR', 'americas-south'], ['AR', 'americas-south'], ['CL', 'americas-south'],
    ['GB', 'europe-west'], ['DE', 'europe-west'], ['FR', 'europe-west'],
    ['NL', 'europe-west'], ['IT', 'europe-west'], ['ES', 'europe-west'],
    ['PL', 'europe-east'], ['CZ', 'europe-east'], ['RU', 'europe-east'],
    ['AU', 'oceania'], ['NZ', 'oceania']
  ]);

  selectBackend(
    backends: BackendConfig[],
    requestInfo: RequestInfo,
    metrics?: Map<string, BackendMetrics>
  ): BackendConfig {
    if (backends.length === 1) {
      return backends[0];
    }

    // Regional preference
    const regionalBackends = this.getRegionalBackends(backends, requestInfo.country);
    const candidateBackends = regionalBackends.length > 0 ? regionalBackends : backends;

    // Performance-based selection if metrics available
    if (metrics && metrics.size > 0) {
      return this.selectByPerformance(candidateBackends, metrics);
    }

    // Weighted random selection
    return this.weightedRandomSelect(candidateBackends);
  }

  private getRegionalBackends(backends: BackendConfig[], clientCountry: string): BackendConfig[] {
    if (!clientCountry || clientCountry === 'unknown') {
      return [];
    }

    const preferredRegion = LoadBalancer.REGION_MAP.get(clientCountry.toUpperCase());
    if (!preferredRegion) {
      return [];
    }

    // Exact match
    let matches = backends.filter(backend =>
      backend.region.toLowerCase() === preferredRegion.toLowerCase()
    );

    // Partial match if no exact match
    if (matches.length === 0) {
      const regionParts = preferredRegion.split('-');
      matches = backends.filter(backend => {
        const backendRegion = backend.region.toLowerCase();
        return regionParts.some(part => backendRegion.includes(part));
      });
    }

    return matches;
  }

  private selectByPerformance(
    backends: BackendConfig[],
    metrics: Map<string, BackendMetrics>
  ): BackendConfig {
    const scores = new Map<string, number>();

    for (const backend of backends) {
      const metric = metrics.get(backend.url);
      if (!metric || metric.requests === 0) {
        scores.set(backend.url, 50); // Default score for new backends
        continue;
      }

      const errorRate = metric.errors / metric.requests;
      const avgResponseTime = metric.totalTime / metric.requests;

      // Combined score: error rate 70%, response time 30%
      const errorScore = errorRate * 100 * 0.7;
      const timeScore = Math.min(avgResponseTime / 100, 50) * 0.3;

      scores.set(backend.url, errorScore + timeScore);
    }

    // Convert scores to weights (lower score = higher weight)
    const maxScore = Math.max(...scores.values()) + 1;
    const weightedBackends = backends.map(backend => ({
      ...backend,
      weight: Math.max(1, Math.floor(maxScore - (scores.get(backend.url) || 50)))
    }));

    return this.weightedRandomSelect(weightedBackends);
  }

  private weightedRandomSelect(backends: BackendConfig[]): BackendConfig {
    const totalWeight = backends.reduce((sum, backend) => sum + backend.weight, 0);

    if (totalWeight === 0) {
      return backends[0];
    }

    let random = Math.random() * totalWeight;

    for (const backend of backends) {
      random -= backend.weight;
      if (random <= 0) {
        return backend;
      }
    }

    return backends[backends.length - 1];
  }
}
