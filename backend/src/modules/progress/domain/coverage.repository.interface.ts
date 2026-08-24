import { EntityManager } from 'typeorm';

export const COVERAGE_REPOSITORY = Symbol('COVERAGE_REPOSITORY');

export interface ICoverageRepository {
  seedFromHizbSelection(
    membershipId: string,
    hizbNumbers: number[],
    manager: EntityManager,
  ): Promise<void>;
}
