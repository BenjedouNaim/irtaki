export interface JoinRequestQueueItemDto {
  id: string;
  full_name: string;
  score: number;
  created_at: string;
}

export interface ListPendingJoinRequestsResponseDto {
  data: JoinRequestQueueItemDto[];
  pagination: {
    next_cursor: string | null;
    has_more: boolean;
  };
}
