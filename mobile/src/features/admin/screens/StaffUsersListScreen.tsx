import React, { useState } from 'react';
import { View } from 'react-native';
import { Chip, ReportHistoryList, TopBar } from '@/shared/components';
import { rowStart } from '@/shared/theme/rtl';
import { UserListItem } from '@/shared/api/users.client';
import { UserDirectoryRow } from '../components/UserDirectoryRow';
import { UserRoleFilter, useUsersDirectory } from '../hooks/useUsersDirectory';

/**
 * Figma RoleFilter (42:425), first chip rightmost (UF §31). "الكل" drops the
 * `role` param; every other chip is APIS §9.3's `role` filter. The frame
 * offers no Admin chip — there is exactly one Admin account (INV-02) and no
 * screen needs to isolate it.
 */
const FILTERS: { key: UserRoleFilter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'Teacher', label: 'معلّمون' },
  { key: 'Assistant', label: 'مساعدون' },
  { key: 'User', label: 'مستخدمون' },
  { key: 'Student', label: 'طلاب' },
];

/** UF §24 — 5xx and network never show the server's own message. */
const SERVER_ERROR_MESSAGE = 'حدث خطأ أثناء تحميل قائمة المستخدمين';

/**
 * SCR-32 Staff & Users (Figma 42:395) — F-ADM-02. The full user directory
 * (API-053), `created_at DESC`, cursor-paginated with infinite scroll
 * (APIS §9.2, SA §15 API-X04), narrowed by the role chips. The promote
 * action rides on `role=User` rows only (F-ADM-01, BR-R03), so it is
 * offered exactly where it would succeed.
 */
export function StaffUsersListScreen() {
  const [filter, setFilter] = useState<UserRoleFilter>('all');
  const query = useUsersDirectory(filter);

  return (
    <View
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="staff-users-screen"
    >
      <TopBar title="الطاقم والمستخدمون" testID="staff-users-top-bar" />

      <View className="flex-1 px-4 pt-1 pb-6 gap-3">
        <View
          className={`${rowStart} items-start gap-2 w-full flex-wrap`}
          testID="staff-users-role-filter"
        >
          {FILTERS.map((option) => (
            <Chip
              key={option.key}
              type="filter"
              label={option.label}
              selected={filter === option.key}
              onPress={() => setFilter(option.key)}
              testID={`users-filter-${option.key}`}
            />
          ))}
        </View>

        <ReportHistoryList<UserListItem>
          query={query}
          renderRow={(user) => <UserDirectoryRow user={user} />}
          emptyMessage={
            filter === 'all' ? 'لا مستخدمين بعد' : 'لا مستخدمين بهذا الدور بعد'
          }
          emptyIcon="users"
          skeletonVariant="row"
          serverErrorMessage={SERVER_ERROR_MESSAGE}
          testID="staff-users-list"
        />
      </View>
    </View>
  );
}
