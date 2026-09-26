import { Injectable, NotFoundException } from '@nestjs/common';
import { getPaginationMeta } from '@/utils';
import {
  MarketingTaskModel,
  MarketingTaskRecord,
} from './schemas/marketing-task.schema';
import {
  MarketingTaskHistoryActor,
  MarketingTaskHistoryEntry,
  MarketingTaskHistoryType,
  MarketingTaskSource,
  MarketingTaskStatus,
} from './marketing-task.types';
import {
  buildMarketingTaskFingerprint,
  pushMarketingTaskHistory,
} from './marketing-task.utils';
import {
  AddMarketingTaskCommentDto,
  CreateMarketingTaskDto,
  GetMarketingTasksRequestDto,
  UpdateMarketingTaskDto,
} from './dto/marketing-task.dto';

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

@Injectable()
export class MarketingTaskService {
  async list(query: GetMarketingTasksRequestDto) {
    const pagination = getPaginationMeta({
      page: query.page,
      limit: query.limit,
      defaultLimit: 20,
      maxLimit: 100,
    });
    const filter: Record<string, unknown> = {};

    if (query.status) filter.status = query.status;
    if (query.priority) filter.priority = query.priority;
    if (query.category) filter.category = query.category;

    const [items, total] = await Promise.all([
      MarketingTaskModel.aggregate<MarketingTaskRecord>([
        { $match: filter },
        {
          $addFields: {
            priorityOrder: {
              $switch: {
                branches: Object.entries(PRIORITY_ORDER).map(
                  ([priority, order]) => ({
                    case: { $eq: ['$priority', priority] },
                    then: order,
                  }),
                ),
                default: 3,
              },
            },
          },
        },
        {
          $sort:
            query.sort === 'recent'
              ? { updatedAt: -1 }
              : { priorityOrder: 1, createdAt: -1 },
        },
        { $skip: pagination.skip },
        { $limit: pagination.limit },
        // The list only needs the size of the history; the task page loads it.
        {
          $addFields: {
            historyCount: { $size: { $ifNull: ['$history', []] } },
          },
        },
        { $project: { priorityOrder: 0, history: 0 } },
      ]).exec(),
      MarketingTaskModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items.map((item) => MarketingTaskModel.serialize(item)),
      total,
    };
  }

  async getById(id: string) {
    const task = await MarketingTaskModel.findById(id).exec();

    if (!task) {
      throw new NotFoundException(`Marketing task ${id} not found`);
    }

    return MarketingTaskModel.serialize(task);
  }

  async create(dto: CreateMarketingTaskDto) {
    const task = await MarketingTaskModel.create({
      ...dto,
      source: MarketingTaskSource.manual,
      fingerprint: buildMarketingTaskFingerprint(dto),
      history: [
        {
          at: new Date(),
          actor: MarketingTaskHistoryActor.admin,
          type: MarketingTaskHistoryType.created,
        },
      ],
    });

    return MarketingTaskModel.serialize(task);
  }

  async update(id: string, dto: UpdateMarketingTaskDto) {
    const current = await MarketingTaskModel.findById(id)
      .select('status')
      .lean()
      .exec();

    if (!current) {
      throw new NotFoundException(`Marketing task ${id} not found`);
    }

    const set: Record<string, unknown> = { ...dto };
    const statusChanged = !!dto.status && dto.status !== current.status;

    if (statusChanged) {
      set.completedAt =
        dto.status === MarketingTaskStatus.done ? new Date() : null;
    }

    const task = await MarketingTaskModel.findByIdAndUpdate(
      id,
      {
        $set: set,
        ...(statusChanged &&
          pushMarketingTaskHistory([
            {
              at: new Date(),
              actor: MarketingTaskHistoryActor.admin,
              type: MarketingTaskHistoryType.status_changed,
              status: dto.status,
            },
          ])),
      },
      { new: true },
    ).exec();

    if (!task) {
      throw new NotFoundException(`Marketing task ${id} not found`);
    }

    return MarketingTaskModel.serialize(task);
  }

  async addComment(id: string, dto: AddMarketingTaskCommentDto) {
    const entry: MarketingTaskHistoryEntry = {
      at: new Date(),
      actor: MarketingTaskHistoryActor.admin,
      type: MarketingTaskHistoryType.comment,
      text: dto.text.trim(),
    };
    const task = await MarketingTaskModel.findByIdAndUpdate(
      id,
      pushMarketingTaskHistory([entry]),
      { new: true },
    ).exec();

    if (!task) {
      throw new NotFoundException(`Marketing task ${id} not found`);
    }

    return MarketingTaskModel.serialize(task);
  }

  async remove(id: string) {
    const task = await MarketingTaskModel.findByIdAndDelete(id).exec();

    if (!task) {
      throw new NotFoundException(`Marketing task ${id} not found`);
    }

    return { success: true };
  }
}
