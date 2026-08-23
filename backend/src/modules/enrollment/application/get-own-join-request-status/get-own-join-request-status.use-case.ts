import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { JOIN_REQUEST_REPOSITORY } from '../../domain/join-request.repository.interface';
import type { IJoinRequestRepository } from '../../domain/join-request.repository.interface';
import {
  JoinRequestStatus,
  JoinRequestStatusDto,
} from './get-own-join-request-status-response.dto';

@Injectable()
export class GetOwnJoinRequestUseCase {
  constructor(
    @Inject(JOIN_REQUEST_REPOSITORY)
    private readonly joinRequestRepository: IJoinRequestRepository,
  ) {}

  async execute(userId: string): Promise<JoinRequestStatusDto> {
    const record = await this.joinRequestRepository.findLatestForUser(userId);
    if (!record) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'المورد المطلوب غير موجود',
      });
    }

    return {
      data: {
        status: record.status as JoinRequestStatus,
      },
    };
  }
}
