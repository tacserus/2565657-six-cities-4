import { DocumentType, types } from '@typegoose/typegoose';
import { inject, injectable } from 'inversify';
import 'reflect-metadata';
import { Types } from 'mongoose';

import { OfferService, OfferEntity, CreateOfferDto, UpdatedOfferDto } from './index.js';
import { ComponentName } from '../../../enums/index.js';
import { Logger } from '../../logger/index.js';

@injectable()
export class DefaultOfferService implements OfferService {
  constructor(
    @inject(ComponentName.Logger) private readonly logger: Logger,
    @inject(ComponentName.OfferModel)
    private readonly offerModel: types.ModelType<OfferEntity>
  ) {}

  public async create(dto: CreateOfferDto): Promise<DocumentType<OfferEntity>> {
    const result = await this.offerModel.create({
      ...dto,
      isFavorite: false,
      rating: 1,
      commentCount: 0
    });
    this.logger.info(`Сгенерирован оффер, название: ${dto.title}`);

    return result;
  }

  public async findById(id: string): Promise<DocumentType<OfferEntity> | null> {
    return this.offerModel
      .findById(id)
      .populate('authorId')
      .exec();
  }

  public async updateById(id: string, dto: UpdatedOfferDto): Promise<DocumentType<OfferEntity> | null> {
    return this.offerModel
      .findByIdAndUpdate(id, dto, { new: true })
      .populate('authorId')
      .exec();
  }

  public async deleteById(id: string): Promise<DocumentType<OfferEntity> | null> {
    return this.offerModel
      .findByIdAndDelete(id)
      .exec();
  }

  public async find(limit = 60): Promise<DocumentType<OfferEntity>[]> {
    return this.offerModel
      .find()
      .sort({ postDate: -1 })
      .limit(limit)
      .populate('authorId')
      .exec();
  }

  public async findPremiumByCity(city: string): Promise<DocumentType<OfferEntity>[]> {
    return this.offerModel
      .find({ city, isPremium: true })
      .sort({ postDate: -1 })
      .limit(3)
      .populate('authorId')
      .exec();
  }

  public async findFavorites(): Promise<DocumentType<OfferEntity>[]> {
    return this.offerModel
      .find({ isFavorite: true })
      .sort({ postDate: -1 })
      .populate('authorId')
      .exec();
  }

  public async addToFavorites(offerId: string): Promise<DocumentType<OfferEntity> | null> {
    return this.offerModel
      .findByIdAndUpdate(
        offerId,
        { isFavorite: true },
        { new: true }
      )
      .populate('authorId')
      .exec();
  }

  public async removeFromFavorites(offerId: string): Promise<DocumentType<OfferEntity> | null> {
    return this.offerModel
      .findByIdAndUpdate(
        offerId,
        { isFavorite: false },
        { new: true }
      )
      .populate('authorId')
      .exec();
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.offerModel
      .exists({ _id: new Types.ObjectId(id) })) !== null;
  }

  public async incCommentCount(id: string): Promise<DocumentType<OfferEntity> | null> {
    const updatedOffer = await this.offerModel
      .findByIdAndUpdate(
        id,
        { $inc: { commentsCount: 1 } },
        { new: true }
      )
      .exec();

    if (updatedOffer) {
      return this.updateRating(id);
    }

    return null;
  }

  public async updateRating(offerId: string): Promise<DocumentType<OfferEntity> | null> {
    const aggregateResult = await this.offerModel
      .aggregate([
        { $match: { _id: new Types.ObjectId(offerId) } },
        {
          $lookup: {
            from: 'comments',
            localField: '_id',
            foreignField: 'offerId',
            as: 'comments'
          }
        },
        {
          $addFields: {
            rating: { $avg: '$comments.rating' }
          }
        },
        { $project: { comments: 0 } }
      ])
      .exec();

    if (!aggregateResult.length) {
      return null;
    }

    const newRating = aggregateResult[0].rating || 0;
    return this.offerModel
      .findByIdAndUpdate(
        offerId,
        { rating: parseFloat(newRating.toFixed(1)) },
        { new: true }
      )
      .populate('authorId')
      .exec();
  }
}
