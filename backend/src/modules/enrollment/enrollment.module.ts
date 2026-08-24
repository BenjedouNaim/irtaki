import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupsModule } from '../groups/groups.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { ProgressModule } from '../progress/progress.module';
import { IdentityModule } from '../identity/identity.module';
import { JOIN_REQUEST_REPOSITORY } from './domain/join-request.repository.interface';
import { JoinRequestTypeOrmEntity } from './infrastructure/join-request.typeorm-entity';
import { JoinRequestAhzabTypeOrmEntity } from './infrastructure/join-request-ahzab.typeorm-entity';
import { JoinRequestRepository } from './infrastructure/join-request.repository';
import { SubmitJoinRequestUseCase } from './application/submit-join-request/submit-join-request.use-case';
import { GetOwnJoinRequestUseCase } from './application/get-own-join-request-status/get-own-join-request-status.use-case';
import { ListPendingJoinRequestsUseCase } from './application/list-pending-join-requests/list-pending-join-requests.use-case';
import { GetJoinRequestDetailUseCase } from './application/get-join-request-detail/get-join-request-detail.use-case';
import { AcceptJoinRequestUseCase } from './application/accept-join-request/accept-join-request.use-case';
import { RejectJoinRequestUseCase } from './application/reject-join-request/reject-join-request.use-case';
import { JoinRequestsController } from './presentation/join-requests.controller';

@Module({
  imports: [
    GroupsModule,
    MembershipsModule,
    ProgressModule,
    IdentityModule,
    TypeOrmModule.forFeature([
      JoinRequestTypeOrmEntity,
      JoinRequestAhzabTypeOrmEntity,
    ]),
  ],
  controllers: [JoinRequestsController],
  providers: [
    {
      provide: JOIN_REQUEST_REPOSITORY,
      useClass: JoinRequestRepository,
    },
    JoinRequestRepository,
    SubmitJoinRequestUseCase,
    GetOwnJoinRequestUseCase,
    ListPendingJoinRequestsUseCase,
    GetJoinRequestDetailUseCase,
    AcceptJoinRequestUseCase,
    RejectJoinRequestUseCase,
  ],
  exports: [
    JOIN_REQUEST_REPOSITORY,
    SubmitJoinRequestUseCase,
    ListPendingJoinRequestsUseCase,
    GetJoinRequestDetailUseCase,
    AcceptJoinRequestUseCase,
    RejectJoinRequestUseCase,
  ],
})
export class EnrollmentModule {}
