import { z } from 'zod';
import { API_LIMITS } from '../../../src/shared/api.ts';

export const SaveIdParam = z.coerce.number().int().positive();
export const SaveSharingBody = z.object({ isPublic: z.boolean() });

/**
 * The server can't run the sim, so it checks the list metadata and that `data` looks like a
 * save (an object with a format version). The client validates the rest when loading (sim/save.ts).
 */
export const SaveWriteBody = z.object({
  meta: z.object({
    name: z.string().trim().min(1, 'City needs a name').max(API_LIMITS.cityNameMax),
    population: z.number().int().min(0),
    funds: z.number(),
    day: z.number().int().min(0),
    size: z.number().int().min(16).max(1024),
    preset: z.string().min(1).max(32),
    seed: z.number().int(),
  }),
  data: z.looseObject({ v: z.number().int() }),
});
