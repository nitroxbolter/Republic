import { Router } from 'express';
import type { WorldCityListResponse } from '../../../src/shared/api.ts';
import { parse } from '../../http/validate.ts';
import { SaveIdParam } from './saves.schemas.ts';
import type { SavesService } from './saves.service.ts';

/** Public, opt-in city directory. Responses never include owner identity or account-only funds. */
export function worldRoutes(saves: SavesService): Router {
  const router = Router();

  router.get('/cities', async (_req, res) => {
    const body: WorldCityListResponse = { cities: await saves.listPublic() };
    res.json(body);
  });

  router.get('/cities/:id', async (req, res) => {
    const { meta, json } = await saves.loadPublic(parse(SaveIdParam, req.params.id));
    res.type('json').send(`{"meta":${JSON.stringify(meta)},"data":${json}}`);
  });

  return router;
}
