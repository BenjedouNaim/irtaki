import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../../shared';
import { UserRole } from '../../identity/domain/user-role.enum';
import { ListGroupsUseCase } from '../application/list-groups/list-groups.use-case';
import { BrowseAvailableGroupsUseCase } from '../application/browse-available-groups/browse-available-groups.use-case';
import { GroupDetailUseCase } from '../application/group-detail/group-detail.use-case';
import { CreateGroupUseCase } from '../application/create-group/create-group.use-case';
import { UpdateGroupNameUseCase } from '../application/update-group-name/update-group-name.use-case';
import { ListGroupsResponseDto } from '../application/list-groups/group-list-item.dto';
import { GroupDetailResponseDto } from '../application/group-detail/group-detail.dto';
import { CreateGroupDto } from '../application/create-group/create-group.dto';
import { CreateGroupResponseDto } from '../application/create-group/create-group-response.dto';
import { UpdateGroupNameDto } from '../application/update-group-name/update-group-name.dto';
import { UpdateGroupNameResponseDto } from '../application/update-group-name/update-group-name-response.dto';
import { BrowseAvailableGroupsQueryDto } from './dto/browse-available-groups-query.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

@Controller('groups')
export class GroupsController {
  constructor(
    private readonly listGroupsUseCase: ListGroupsUseCase,
    private readonly browseAvailableGroupsUseCase: BrowseAvailableGroupsUseCase,
    private readonly groupDetailUseCase: GroupDetailUseCase,
    private readonly createGroupUseCase: CreateGroupUseCase,
    private readonly updateGroupNameUseCase: UpdateGroupNameUseCase,
  ) {}

  @Roles(UserRole.Admin)
  @Patch(':id')
  async updateGroupName(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateGroupNameDto,
  ): Promise<UpdateGroupNameResponseDto> {
    return this.updateGroupNameUseCase.execute(req.user.id, id, dto);
  }

  @Roles(UserRole.Admin)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateGroupDto,
  ): Promise<CreateGroupResponseDto> {
    return this.createGroupUseCase.execute(req.user.id, dto);
  }

  @Roles(
    UserRole.Admin,
    UserRole.Teacher,
    UserRole.Assistant,
    UserRole.Student,
    UserRole.User,
  )
  @Get('available')
  async browseAvailableGroups(
    @Req() req: AuthenticatedRequest,
    @Query() query: BrowseAvailableGroupsQueryDto,
  ): Promise<ListGroupsResponseDto> {
    return this.browseAvailableGroupsUseCase.execute(
      req.user.id,
      req.user.role as UserRole,
      query.gender,
    );
  }

  @Roles(
    UserRole.Admin,
    UserRole.Teacher,
    UserRole.Assistant,
    UserRole.Student,
    UserRole.User,
  )
  @Get()
  async listGroups(
    @Req() req: AuthenticatedRequest,
  ): Promise<ListGroupsResponseDto> {
    return this.listGroupsUseCase.execute(
      req.user.id,
      req.user.role as UserRole,
    );
  }

  @Roles(UserRole.Admin, UserRole.Teacher, UserRole.Assistant, UserRole.Student)
  @Get(':id')
  async getGroupDetail(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<GroupDetailResponseDto> {
    return this.groupDetailUseCase.execute(
      req.user.id,
      req.user.role as UserRole,
      id,
    );
  }
}
