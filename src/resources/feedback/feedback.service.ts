import { Injectable, NotFoundException } from '@nestjs/common';
import { getPaginationMeta } from '@/utils';
import { UserDocument } from '@/resources/user/user.types';
import { FeedbackModel } from './schemas';
import { CreateFeedbackDto, GetFeedbackRequestDto } from './dto/feedback.dto';

@Injectable()
export class FeedbackService {
  async createFeedback(user: UserDocument | undefined, dto: CreateFeedbackDto) {
    const feedback = await FeedbackModel.create({
      user: user?._id,
      email: dto.email,
      message: dto.message,
    });

    if (user) {
      await feedback.populate('user');
    }

    return FeedbackModel.serialize(feedback);
  }

  async getFeedbackList(query: GetFeedbackRequestDto) {
    const pagination = getPaginationMeta({
      page: query.page,
      limit: query.limit,
      defaultLimit: 20,
      maxLimit: 100,
    });
    const filter =
      typeof query.isRead === 'boolean' ? { isRead: query.isRead } : {};

    const [feedback, total] = await Promise.all([
      FeedbackModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .populate('user')
        .exec(),
      FeedbackModel.countDocuments(filter).exec(),
    ]);

    return {
      feedback: feedback.map((item) => FeedbackModel.serialize(item)),
      total,
    };
  }

  async markAsRead(feedbackId: string) {
    const feedback = await FeedbackModel.findByIdAndUpdate(
      feedbackId,
      {
        isRead: true,
        readAt: new Date(),
      },
      { new: true },
    )
      .populate('user')
      .exec();

    if (!feedback) {
      throw new NotFoundException(`Feedback ${feedbackId} not found`);
    }

    return FeedbackModel.serialize(feedback);
  }
}
