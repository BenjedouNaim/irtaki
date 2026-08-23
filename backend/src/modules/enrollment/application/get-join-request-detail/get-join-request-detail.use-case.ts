import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { UserRole } from '../../../identity/domain/user-role.enum';
import {
  type IJoinRequestRepository,
  JOIN_REQUEST_REPOSITORY,
  JoinRequestDetailRow,
} from '../../domain/join-request.repository.interface';
import {
  ApplicantProfileDto,
  GetJoinRequestDetailResponseDto,
} from './get-join-request-detail-response.dto';

@Injectable()
export class GetJoinRequestDetailUseCase {
  constructor(
    @Inject(JOIN_REQUEST_REPOSITORY)
    private readonly joinRequestRepo: IJoinRequestRepository,
  ) {}

  async execute(
    callerId: string,
    callerRole: string,
    joinRequestId: string,
  ): Promise<GetJoinRequestDetailResponseDto> {
    const row = await this.joinRequestRepo.findByIdForDetail(joinRequestId);

    // Uniform 403 for non-existent, soft-deleted, or unauthorized records (NFR-20 / APIQ-04)
    if (!row || row.deletedAt) {
      throw new ForbiddenException();
    }

    const isAdmin = callerRole === (UserRole.Admin as string);
    if (!isAdmin && row.assistantId !== callerId) {
      throw new ForbiddenException();
    }

    return {
      data: this.mapToDto(row),
    };
  }

  private mapToDto(row: JoinRequestDetailRow): ApplicantProfileDto {
    return {
      id: row.id,
      full_name: row.fullName,
      gender: row.gender,
      age: row.age,
      phone_number: row.phoneNumber,
      occupation: row.occupation,
      city: row.city,
      memorized_ahzab: row.memorizedAhzab,
      tajweed_level: row.tajweedLevel,
      studied_tajweed_theory: row.studiedTajweedTheory,
      studied_qalun: row.studiedQalun,
      fee_agreement: row.feeAgreement,
      program_goal: row.programGoal,
      score: row.score,
      status: row.status,
      created_at: row.createdAt.toISOString(),
    };
  }
}
