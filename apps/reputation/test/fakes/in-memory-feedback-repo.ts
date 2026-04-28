import type {
  FeedbackInsertParams,
  FeedbackRepository,
  StoredFeedback,
} from '../../src/domain/feedback-repository.js';

export class InMemoryFeedbackRepository implements FeedbackRepository {
  private readonly byId = new Map<string, StoredFeedback>();

  public async findById(feedbackId: string): Promise<StoredFeedback | null> {
    return Promise.resolve(this.byId.get(feedbackId) ?? null);
  }

  public async findByTriple(
    fromDid: string,
    toDid: string,
    txId: string,
  ): Promise<StoredFeedback | null> {
    for (const fb of this.byId.values()) {
      if (fb.fromDid === fromDid && fb.toDid === toDid && fb.txId === txId) {
        return Promise.resolve(fb);
      }
    }
    return Promise.resolve(null);
  }

  public async insert(params: FeedbackInsertParams): Promise<void> {
    if (this.byId.has(params.feedbackId)) {
      throw new Error(`Duplicate feedbackId: ${params.feedbackId}`);
    }
    this.byId.set(params.feedbackId, {
      ...params,
      recordedAt: new Date(),
    });
    return Promise.resolve();
  }

  public size(): number {
    return this.byId.size;
  }
}
