import { SetMetadata } from '@nestjs/common';

export const TRACK_PERFORMANCE_KEY = 'track_performance';

export function TrackPerformance(operation: string) {
  return SetMetadata(TRACK_PERFORMANCE_KEY, operation);
}
