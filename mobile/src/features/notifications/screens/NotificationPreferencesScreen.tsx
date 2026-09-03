import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Banner } from '@/shared/components/Banner';
import { PreferenceRow } from '@/shared/components/PreferenceRow';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { TopBar } from '@/shared/components/TopBar';
import { typography } from '@/shared/theme/typography';
import { itemsStart } from '@/shared/theme/rtl';
import { ApiError } from '@/shared/api/types';
import type { NotificationPreferenceDto } from '@/shared/api/notificationPreferences.client';
import { useNotificationPreferences } from '../hooks/useNotificationPreferences';
import { useSetNotificationPreference } from '../hooks/useSetNotificationPreference';
import { categoryCopy } from '../utils/categoryCopy';

const SCREEN_TITLE = 'تفضيلات الإشعارات';
/** Figma 43:154 — push only, no in-app notification centre (SAS §22.6). */
const INTRO =
  'تُرسل الإشعارات كتنبيهات فقط — لا يوجد مركز إشعارات داخل التطبيق.';
/** Figma 43:156 / 43:194 — the two section labels. */
const MUTABLE_LABEL = 'قابلة للكتم';
const CRITICAL_LABEL = 'حساسة للحساب — لا تُكتم';
/** Figma 43:216 — the deep-link note (UF §8 push → screen table). */
const FOOTNOTE = 'الإشعار يفتح الشاشة المعنية مباشرة (N-01…N-08).';

/** UF §24: `5xx` and network never show the server's own message. */
const LOAD_ERROR_MESSAGE = 'حدث خطأ أثناء تحميل تفضيلات الإشعارات';
const SAVE_ERROR_MESSAGE = 'حدث خطأ أثناء تحديث تفضيلات الإشعارات';
const NETWORK_ERROR_MESSAGE =
  'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';

/**
 * Maps an error to Arabic per UF §24: `5xx` and network get the generic
 * retry copy, any remaining `4xx` carries the exception filter's own Arabic
 * message verbatim.
 */
function describeError(error: unknown, generic: string): string {
  if (error instanceof ApiError) {
    if (error.statusCode >= 500) {
      return generic;
    }
    return error.message || generic;
  }
  return NETWORK_ERROR_MESSAGE;
}

interface SectionProps {
  label: string;
  rows: NotificationPreferenceDto[];
  /** `subtle` is the Figma ground for the locked group (43:195). */
  tone: 'surface' | 'subtle';
  mutedOf: (row: NotificationPreferenceDto) => boolean;
  onToggle?: (category: string, muted: boolean) => void;
  busyCategory?: string | null;
  testID: string;
}

/** One labelled card of PreferenceRows separated by 1px hairlines. */
function PreferenceSection({
  label,
  rows,
  tone,
  mutedOf,
  onToggle,
  busyCategory,
  testID,
}: SectionProps) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <View className={`w-full gap-3.5 ${itemsStart}`}>
      <Text
        testID={`${testID}-label`}
        className={`w-full pt-1.5 ${typography.overline} text-right text-fg-secondary dark:text-fg-secondary-dark`}
      >
        {label}
      </Text>
      <View
        testID={testID}
        className={`w-full overflow-hidden rounded-lg ${
          tone === 'surface'
            ? 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark'
            : 'bg-subtle dark:bg-subtle-dark'
        }`}
        style={{ borderCurve: 'continuous' }}
      >
        {rows.map((row, index) => {
          const copy = categoryCopy(row.category, row.description);
          return (
            <View key={row.category} className="w-full">
              {index > 0 ? (
                <View className="w-full h-px bg-line dark:bg-line-dark" />
              ) : null}
              <PreferenceRow
                testID={`preference-row-${row.category}`}
                title={copy.title}
                subtitle={copy.subtitle}
                // `undefined` renders no toggle — the account-critical rows.
                value={onToggle ? mutedOf(row) : undefined}
                onChange={
                  onToggle ? (next) => onToggle(row.category, next) : undefined
                }
                disabled={busyCategory === row.category}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

/**
 * SCR-35 Notification Preferences (F-NOT-03 / F-NOT-04, UF §28; Figma
 * 43:126): the whole API-050 catalogue as a flat list with a toggle per row,
 * split into the two Figma sections — mutable categories on a surface card,
 * account-critical ones on a subtle card with no toggle at all.
 *
 * Hiding the toggle is presentation, not the control: the server refuses to
 * mute an account-critical category whatever the client sends (VR-38,
 * SAS §12 UC-18 E1, NFR-08). Toggling takes no confirmation — one tap
 * either way, instantly reversible, the treatment UF §25 gives the
 * enrollment toggle.
 *
 * Reached from SCR-34 Profile, the shared entry point for every role
 * (UF §26).
 */
export function NotificationPreferencesScreen() {
  const { data, isPending, isError, error, refetch } =
    useNotificationPreferences();
  const setPreference = useSetNotificationPreference();

  /** The row being written, and the value it was asked to take. */
  const [pending, setPending] = useState<{
    category: string;
    muted: boolean;
  } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleToggle = useCallback(
    (category: string, muted: boolean) => {
      if (pending) {
        return;
      }
      setSaveError(null);
      setPending({ category, muted });
      setPreference.mutate(
        { category, muted },
        {
          onError: (err) =>
            setSaveError(describeError(err, SAVE_ERROR_MESSAGE)),
          onSettled: () => setPending(null),
        },
      );
    },
    [pending, setPreference],
  );

  if (isPending) {
    return (
      <View
        className="flex-1 bg-canvas dark:bg-canvas-dark"
        testID="notification-preferences-loading"
      >
        <TopBar
          title={SCREEN_TITLE}
          testID="notification-preferences-top-bar"
        />
        {/* UF §22: the skeleton matches the layout it replaces — an intro
            line, then the two row groups. */}
        <View className="px-4 pt-1 gap-3.5">
          <SkeletonLoader variant="row" count={5} />
          <SkeletonLoader variant="row" count={3} />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View
        className="flex-1 bg-canvas dark:bg-canvas-dark"
        testID="notification-preferences-error"
      >
        <TopBar
          title={SCREEN_TITLE}
          testID="notification-preferences-top-bar"
        />
        <View className="px-4 pt-1">
          <Banner
            message={describeError(error, LOAD_ERROR_MESSAGE)}
            tone="error"
            onRetry={() => void refetch()}
            testID="notification-preferences-load-error"
          />
        </View>
      </View>
    );
  }

  const rows = data ?? [];
  const mutable = rows.filter((row) => row.is_mutable);
  const critical = rows.filter((row) => !row.is_mutable);

  /** The optimistic value while a write is in flight, the stored one after. */
  const mutedOf = (row: NotificationPreferenceDto) =>
    pending?.category === row.category ? pending.muted : row.muted;

  return (
    <View
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="notification-preferences-screen"
    >
      <TopBar title={SCREEN_TITLE} testID="notification-preferences-top-bar" />
      <ScrollView
        contentContainerStyle={{
          paddingTop: 4,
          paddingHorizontal: 16,
          paddingBottom: 24,
          gap: 14,
        }}
      >
        <Text
          testID="notification-preferences-intro"
          className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
        >
          {INTRO}
        </Text>

        {saveError ? (
          <Banner
            message={saveError}
            tone="error"
            testID="notification-preferences-save-error"
          />
        ) : null}

        <PreferenceSection
          label={MUTABLE_LABEL}
          rows={mutable}
          tone="surface"
          mutedOf={mutedOf}
          onToggle={handleToggle}
          busyCategory={pending?.category ?? null}
          testID="notification-preferences-mutable"
        />

        <PreferenceSection
          label={CRITICAL_LABEL}
          rows={critical}
          tone="subtle"
          mutedOf={mutedOf}
          testID="notification-preferences-critical"
        />

        <Text
          testID="notification-preferences-footnote"
          className={`w-full ${typography.caption} text-right text-fg-tertiary dark:text-fg-tertiary-dark`}
        >
          {FOOTNOTE}
        </Text>
      </ScrollView>
    </View>
  );
}
