/**
 * F-TEST-03 — proves the mass-assignment table really does cover EVERY
 * mutation endpoint, by re-deriving the route list from the controller
 * sources and comparing it to the hand-maintained list the table drives
 * from. A new `@Post`/`@Patch` anywhere under `src/` fails here until it
 * is added to `MUTATION_ROUTES` and given a case in the table.
 */
import { join } from 'path';
import {
  MUTATION_ROUTES,
  scanControllerMutationRoutes,
} from './mutation-endpoints';

describe('Mutation endpoint inventory (F-TEST-03)', () => {
  const sourceRoot = join(__dirname, '..', '..', 'src');

  it('the declared table matches every POST/PATCH route the controllers expose', () => {
    const scanned = scanControllerMutationRoutes(sourceRoot);
    expect(scanned).toEqual([...MUTATION_ROUTES].sort());
  });

  it('declares no duplicate routes', () => {
    expect(new Set(MUTATION_ROUTES).size).toBe(MUTATION_ROUTES.length);
  });
});
