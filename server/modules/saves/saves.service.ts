import { API_LIMITS, type SaveMeta, type SaveMetaInput, type WorldCityMeta } from '../../../src/shared/api.ts';
import { forbidden, notFound } from '../../http/errors.ts';
import type { SavesRepository } from './saves.repository.ts';

/** City saves for a signed-in user: the rules (quota, ownership) on top of the repository. */
export class SavesService {
  private readonly repo: SavesRepository;

  constructor(repo: SavesRepository) {
    this.repo = repo;
  }

  list(userId: number): Promise<SaveMeta[]> {
    return this.repo.list(userId);
  }

  listPublic(): Promise<WorldCityMeta[]> {
    return this.repo.listPublic();
  }

  async loadPublic(id: number): Promise<{ meta: WorldCityMeta; json: string }> {
    const found = await this.repo.findPublic(id);
    if (!found) throw notFound('Shared city not found');
    const { data, ...meta } = found;
    return { meta, json: data };
  }

  async setPublic(userId: number, id: number, isPublic: boolean): Promise<SaveMeta> {
    const saved = await this.repo.setPublic(userId, id, isPublic);
    if (!saved) throw notFound('City not found');
    return saved;
  }

  /** The meta and the stored JSON text. 404 if missing or someone else's. */
  async load(userId: number, id: number): Promise<{ meta: SaveMeta; json: string }> {
    const found = await this.repo.find(userId, id);
    if (!found) throw notFound('City not found');
    const { data, ...meta } = found;
    return { meta, json: data };
  }

  async create(userId: number, meta: SaveMetaInput, data: unknown): Promise<SaveMeta> {
    const saved = await this.repo.createWithin(userId, API_LIMITS.savesPerUser, meta, JSON.stringify(data));
    if (!saved) throw forbidden(`You can keep up to ${API_LIMITS.savesPerUser} cities. Delete one to make room.`);
    return saved;
  }

  async update(userId: number, id: number, meta: SaveMetaInput, data: unknown): Promise<SaveMeta> {
    const saved = await this.repo.update(userId, id, meta, JSON.stringify(data));
    if (!saved) throw notFound('City not found');
    return saved;
  }

  async remove(userId: number, id: number): Promise<void> {
    if (!(await this.repo.remove(userId, id))) throw notFound('City not found');
  }
}
