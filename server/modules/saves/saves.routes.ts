import { Router } from 'express';
import type { SaveListResponse, SaveWriteResponse } from '../../../src/shared/api.ts';
import { requireUser } from '../../http/middleware.ts';
import { parse } from '../../http/validate.ts';
import { SaveIdParam, SaveSharingBody, SaveWriteBody } from './saves.schemas.ts';
import type { SavesService } from './saves.service.ts';

/** /api/saves: the signed-in user's cities. */
export function savesRoutes(saves: SavesService): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const body: SaveListResponse = { saves: await saves.list(requireUser(res).id) };
    res.json(body);
  });

  router.get('/:id', async (req, res) => {
    const user = requireUser(res);
    const { meta, json } = await saves.load(user.id, parse(SaveIdParam, req.params.id));
    // The stored JSON goes out as-is: no parse and re-stringify of a big blob.
    res.type('json').send(`{"meta":${JSON.stringify(meta)},"data":${json}}`);
  });

  router.post('/', async (req, res) => {
    const user = requireUser(res);
    const { meta, data } = parse(SaveWriteBody, req.body);
    const body: SaveWriteResponse = { meta: await saves.create(user.id, meta, data) };
    res.status(201).json(body);
  });

  router.put('/:id', async (req, res) => {
    const user = requireUser(res);
    const id = parse(SaveIdParam, req.params.id);
    const { meta, data } = parse(SaveWriteBody, req.body);
    const body: SaveWriteResponse = { meta: await saves.update(user.id, id, meta, data) };
    res.json(body);
  });

  router.put('/:id/sharing', async (req, res) => {
    const user = requireUser(res);
    const id = parse(SaveIdParam, req.params.id);
    const { isPublic } = parse(SaveSharingBody, req.body);
    res.json({ meta: await saves.setPublic(user.id, id, isPublic) });
  });

  router.delete('/:id', async (req, res) => {
    await saves.remove(requireUser(res).id, parse(SaveIdParam, req.params.id));
    res.status(204).end();
  });

  return router;
}
