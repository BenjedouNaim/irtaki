import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DailyReportFormScreen } from '../DailyReportFormScreen';
import * as dailyReportsApi from '@/shared/api/dailyReports.client';
import { ApiError, NetworkError } from '@/shared/api/types';
import { localTodayIsoDate } from '@/features/dailyReports/utils/dailyReportForm';
import type { TimeWindowFieldProps } from '@/features/dailyReports/components/TimeWindowField';

jest.mock('@/shared/api/dailyReports.client');
jest.mock('@/features/progress/hooks/useSurahs', () => ({
  useSurahs: () => ({
    data: [
      { number: 1, name_ar: 'الفاتحة', ayah_count: 7, ordinal_offset: 0 },
      { number: 2, name_ar: 'البقرة', ayah_count: 286, ordinal_offset: 7 },
    ],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

// SCR-11 is covered by its own spec; here it is a stub that confirms a fixed
// range per rangeType so the form's integration can be driven deterministically.
jest.mock('@/features/progress/components/QuranRangePickerSheet', () => {
  const { View, Pressable, Text } = require('react-native');
  return {
    QuranRangePickerSheet: ({
      visible,
      rangeType,
      onConfirm,
      testID,
    }: {
      visible: boolean;
      rangeType: 'memorization' | 'revision';
      onConfirm: (range: unknown) => void;
      testID: string;
    }) => {
      if (!visible) return null;
      const range =
        rangeType === 'memorization'
          ? { from: { surah: 2, ayah: 1 }, to: { surah: 2, ayah: 20 } }
          : { from: { surah: 1, ayah: 1 }, to: { surah: 1, ayah: 7 } };
      return (
        <View testID={testID}>
          <Pressable
            testID={`${testID}-confirm-button`}
            onPress={() => onConfirm(range)}
          >
            <Text>تأكيد</Text>
          </Pressable>
        </View>
      );
    },
  };
});

/**
 * The wheel sheet is TimeWindowField's own (VO-03, UF §20) and TimeWindowField
 * .spec covers it end to end: press a bound, pick an hour, confirm, get `HH:MM`
 * back through `onChange`, plus the icon + text error line. Mounting it here
 * costs a Modal holding twenty-four hour rows and sixty minute rows every time
 * a case opens it — by far the most expensive thing this screen does, and what
 * pushed the two posting cases past their timeout on a machine running the rest
 * of the suite alongside them.
 *
 * So the sheet is a double here, on the same reasoning as the range sheet
 * above, honouring that contract exactly and typed against the real props so
 * `tsc` catches any drift. What the cases below measure is the screen: which
 * key each window lands under in the payload, and the VR-15 check it computes
 * and hands down as `error`.
 */
jest.mock('@/features/dailyReports/components/TimeWindowField', () => {
  const react = require('react') as typeof import('react');
  const { View, Pressable, Text } = require('react-native');
  const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

  return {
    TimeWindowField: ({
      value,
      onChange,
      error,
      testID = 'time-window-field',
    }: TimeWindowFieldProps) => {
      const [editing, setEditing] = react.useState<'from' | 'to' | null>(null);
      // The real sheet opens on 18:00 and its minute wheel is left alone by
      // every case here, so the double reports whole hours.
      const [hour, setHour] = react.useState(18);

      return (
        <View testID={testID}>
          {(['from', 'to'] as const).map((bound) => (
            <Pressable
              key={bound}
              testID={`${testID}-${bound}`}
              onPress={() => {
                setEditing(bound);
                setHour(18);
              }}
            >
              <Text testID={`${testID}-${bound}-value`}>
                {value[bound] ?? '--:--'}
              </Text>
            </Pressable>
          ))}

          {editing === null ? null : (
            <View testID={`${testID}-hour-wheel`}>
              {HOURS.map((option) => (
                <Pressable
                  key={option}
                  testID={`${testID}-hour-wheel-item-${option}`}
                  onPress={() => setHour(option)}
                >
                  <Text>{String(option).padStart(2, '0')}</Text>
                </Pressable>
              ))}
              <Pressable
                testID={`${testID}-confirm-button`}
                onPress={() => {
                  onChange({
                    ...value,
                    [editing]: `${String(hour).padStart(2, '0')}:00`,
                  });
                  setEditing(null);
                }}
              >
                <Text>تأكيد</Text>
              </Pressable>
            </View>
          )}

          {error ? <Text>{error}</Text> : null}
        </View>
      );
    },
  };
});

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
}));

const today = localTodayIsoDate();

const created: dailyReportsApi.SubmitDailyReportResultDto = {
  id: 'report-1',
  report_date: today,
  type: 'Absent',
  ahzab_completed: 3,
  coverage_updated: false,
};

let queryClient: QueryClient;

function renderScreen(type: dailyReportsApi.DailyReportType) {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DailyReportFormScreen type={type} />
    </QueryClientProvider>,
  );
}

function submitButton() {
  return screen.getByTestId('submit-report-button');
}

function isSubmitDisabled(): boolean {
  return Boolean(submitButton().props.accessibilityState?.disabled);
}

function pickTime(fieldTestID: string, bound: 'from' | 'to', hour: number) {
  fireEvent.press(screen.getByTestId(`${fieldTestID}-${bound}`));
  fireEvent.press(screen.getByTestId(`${fieldTestID}-hour-wheel-item-${hour}`));
  fireEvent.press(screen.getByTestId(`${fieldTestID}-confirm-button`));
}

function pickRange(fieldTestID: string) {
  fireEvent.press(screen.getByTestId(`${fieldTestID}-trigger`));
  fireEvent.press(screen.getByTestId(`${fieldTestID}-sheet-confirm-button`));
}

describe('DailyReportFormScreen (SCR-10, F-DR-02)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
    jest.spyOn(dailyReportsApi, 'submitDailyReport').mockResolvedValue(created);
  });

  afterEach(() => {
    queryClient?.clear();
  });

  describe('Absent', () => {
    it('shows the reason picker only, enables submit once a reason is chosen, posts and returns Home', async () => {
      renderScreen('Absent');

      expect(
        screen.getByTestId('daily-report-form-top-bar-title').props.children,
      ).toBe('غياب');
      expect(screen.getByTestId('daily-report-form-title').props.children).toBe(
        'سبب الغياب',
      );
      expect(screen.getByTestId('absence-reason-picker')).toBeTruthy();
      expect(screen.queryByTestId('memo-section')).toBeNull();
      expect(screen.queryByTestId('rev-section')).toBeNull();
      expect(screen.queryByTestId('tafsir-section')).toBeNull();
      expect(isSubmitDisabled()).toBe(true);

      fireEvent.press(screen.getByTestId('absence-reason-picker-sick'));
      expect(isSubmitDisabled()).toBe(false);

      fireEvent.press(submitButton());

      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith('/(app)/student'),
      );
      expect(dailyReportsApi.submitDailyReport).toHaveBeenCalledWith({
        type: 'Absent',
        report_date: today,
        absence_reason: 'Sick',
      });
    });
  });

  describe('Normal — progressive disclosure (UF §15)', () => {
    it('starts with both gates unanswered, no details, submit disabled', () => {
      renderScreen('Normal');

      expect(screen.getByTestId('memo-gate')).toBeTruthy();
      expect(screen.getByTestId('rev-gate')).toBeTruthy();
      expect(screen.getByTestId('read-tafsir-toggle')).toBeTruthy();
      expect(screen.queryByTestId('memo-details')).toBeNull();
      expect(screen.queryByTestId('rev-details')).toBeNull();
      expect(screen.queryByTestId('absence-reason-picker')).toBeNull();
      expect(isSubmitDisabled()).toBe(true);
    });

    it('both gates "No" is a valid report (BR-48): submits the bare type with no confirmation dialog', async () => {
      renderScreen('Normal');

      fireEvent.press(screen.getByTestId('memo-gate-no'));
      expect(isSubmitDisabled()).toBe(true);
      fireEvent.press(screen.getByTestId('rev-gate-no'));
      expect(isSubmitDisabled()).toBe(false);

      fireEvent.press(submitButton());

      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith('/(app)/student'),
      );
      expect(screen.queryByTestId('discard-report-dialog')).toBeNull();
      expect(dailyReportsApi.submitDailyReport).toHaveBeenCalledWith({
        type: 'Normal',
        report_date: today,
      });
    });

    it('reveals memorisation fields on "Yes" and asks the single-session question only after 50 reps = Yes', () => {
      renderScreen('Normal');

      fireEvent.press(screen.getByTestId('memo-gate-yes'));
      expect(screen.getByTestId('memo-details')).toBeTruthy();
      expect(screen.getByTestId('memo-range-field')).toBeTruthy();
      expect(screen.getByTestId('memo-time-field')).toBeTruthy();
      expect(screen.getByTestId('completed-50-toggle')).toBeTruthy();
      expect(screen.queryByTestId('single-session-toggle')).toBeNull();

      fireEvent.press(screen.getByTestId('completed-50-toggle-yes'));
      expect(screen.getByTestId('single-session-toggle')).toBeTruthy();
    });

    it('builds the full memorisation payload from the range, the window and the toggles', async () => {
      renderScreen('Normal');

      fireEvent.press(screen.getByTestId('memo-gate-yes'));
      pickRange('memo-range-field');
      expect(
        screen.getByTestId('memo-range-field-trigger-value').props.children,
      ).toBe('البقرة 1 ← البقرة 20');
      pickTime('memo-time-field', 'from', 18);
      pickTime('memo-time-field', 'to', 19);

      fireEvent.press(screen.getByTestId('completed-50-toggle-yes'));
      fireEvent.press(screen.getByTestId('rev-gate-no'));
      // Single-session still unanswered → not complete.
      expect(isSubmitDisabled()).toBe(true);
      fireEvent.press(screen.getByTestId('single-session-toggle-yes'));
      fireEvent.press(screen.getByTestId('read-tafsir-toggle-no'));
      expect(isSubmitDisabled()).toBe(false);

      fireEvent.press(submitButton());

      await waitFor(() => expect(mockReplace).toHaveBeenCalled());
      expect(dailyReportsApi.submitDailyReport).toHaveBeenCalledWith({
        type: 'Normal',
        report_date: today,
        memo_range: { from: { surah: 2, ayah: 1 }, to: { surah: 2, ayah: 20 } },
        memo_time: { from: '18:00', to: '19:00' },
        completed_50_repetitions: true,
        repetitions_in_single_session: true,
        read_tafsir: false,
      });
    });

    it('hides the single-session question again when 50 reps flips to "No" (VR-18 structurally impossible)', () => {
      renderScreen('Normal');
      fireEvent.press(screen.getByTestId('memo-gate-yes'));
      fireEvent.press(screen.getByTestId('completed-50-toggle-yes'));
      expect(screen.getByTestId('single-session-toggle')).toBeTruthy();
      fireEvent.press(screen.getByTestId('completed-50-toggle-no'));
      expect(screen.queryByTestId('single-session-toggle')).toBeNull();
    });

    it('reveals the revision fields on "Yes"', () => {
      renderScreen('Normal');
      fireEvent.press(screen.getByTestId('memo-gate-no'));
      fireEvent.press(screen.getByTestId('rev-gate-yes'));

      expect(screen.getByTestId('rev-details')).toBeTruthy();
      expect(screen.getByTestId('rev-range-field')).toBeTruthy();
      expect(screen.getByTestId('rev-time-field')).toBeTruthy();
    });

    /**
     * VR-15 read as two cases over one arrangement. Every `pickTime` opens
     * the wheel sheet, which mounts twenty-four hour rows and sixty minute
     * rows — by far the most expensive thing this screen does — so the
     * window is opened here once per case instead of three times inside one.
     */
    describe('a revision window that runs backwards (VR-15 nudge)', () => {
      const REVERSED_WINDOW_ERROR = 'يجب أن يكون وقت الانتهاء بعد وقت البداية';

      beforeEach(() => {
        renderScreen('Normal');
        fireEvent.press(screen.getByTestId('memo-gate-no'));
        fireEvent.press(screen.getByTestId('rev-gate-yes'));
        pickRange('rev-range-field');
        pickTime('rev-time-field', 'from', 20);
      });

      it('nudges and blocks submit while the end is before the start', () => {
        pickTime('rev-time-field', 'to', 19);

        expect(screen.getByText(REVERSED_WINDOW_ERROR)).toBeTruthy();
        expect(isSubmitDisabled()).toBe(true);
      });

      it('clears the nudge and enables submit once the end is after the start', () => {
        pickTime('rev-time-field', 'to', 21);

        expect(screen.queryByText(REVERSED_WINDOW_ERROR)).toBeNull();
        expect(isSubmitDisabled()).toBe(false);
      });
    });
  });

  describe('Revision', () => {
    it('shows range + time with no gate and no memorisation/tafsir fields', () => {
      renderScreen('Revision');

      expect(screen.getByTestId('rev-range-field')).toBeTruthy();
      expect(screen.getByTestId('rev-time-field')).toBeTruthy();
      expect(screen.queryByTestId('rev-gate')).toBeNull();
      expect(screen.queryByTestId('memo-section')).toBeNull();
      expect(screen.queryByTestId('read-tafsir-toggle')).toBeNull();
      expect(isSubmitDisabled()).toBe(true);
    });

    it('posts the range and the window it was filled with', async () => {
      renderScreen('Revision');

      pickRange('rev-range-field');
      pickTime('rev-time-field', 'from', 19);
      pickTime('rev-time-field', 'to', 20);
      expect(isSubmitDisabled()).toBe(false);

      fireEvent.press(submitButton());

      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith('/(app)/student'),
      );
      expect(dailyReportsApi.submitDailyReport).toHaveBeenCalledWith({
        type: 'Revision',
        report_date: today,
        rev_range: { from: { surah: 1, ayah: 1 }, to: { surah: 1, ayah: 7 } },
        rev_time: { from: '19:00', to: '20:00' },
      });
    });
  });

  describe('submission states (UF §15 table, UF §24)', () => {
    function submitAbsent() {
      renderScreen('Absent');
      fireEvent.press(screen.getByTestId('absence-reason-picker-other'));
      fireEvent.press(submitButton());
    }

    it('409 DUPLICATE_REPORT is silent success (UF §36): returns Home', async () => {
      jest.spyOn(dailyReportsApi, 'submitDailyReport').mockRejectedValue(
        new ApiError({
          statusCode: 409,
          error: 'DUPLICATE_REPORT',
          message: 'لقد قمت بإرسال تقرير اليوم مسبقاً',
          existing_report: { id: 'report-existing' },
        }),
      );
      submitAbsent();

      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith('/(app)/student'),
      );
      expect(screen.queryByTestId('daily-report-form-banner')).toBeNull();
    });

    it('422 BACKDATED: "today has ended", form discarded, Home re-evaluates', async () => {
      jest.spyOn(dailyReportsApi, 'submitDailyReport').mockRejectedValue(
        new ApiError({
          statusCode: 422,
          error: 'BACKDATED',
          message: 'انتهى اليوم',
        }),
      );
      submitAbsent();

      const banner = await screen.findByTestId('daily-report-form-banner');
      expect(banner.props.accessibilityRole).toBe('alert');
      expect(screen.getByLabelText('تنبيه')).toBeTruthy();
      expect(
        screen.getByTestId('daily-report-form-banner-message').props.children,
      ).toMatch(/انتهى اليوم/);
      expect(screen.queryByTestId('submit-report-button')).toBeNull();
      expect(screen.queryByTestId('absence-reason-picker')).toBeNull();

      fireEvent.press(screen.getByTestId('daily-report-form-home-button'));
      expect(mockReplace).toHaveBeenCalledWith('/(app)/student');
    });

    it('422 RECITATION_DAY: routes to the Weekly Report (SCR-12), form discarded (UF §15)', async () => {
      jest.spyOn(dailyReportsApi, 'submitDailyReport').mockRejectedValue(
        new ApiError({
          statusCode: 422,
          error: 'RECITATION_DAY',
          message: 'اليوم هو يوم التسميع، ولا يُرسل فيه تقرير يومي',
        }),
      );
      submitAbsent();

      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith(
          '/(app)/student/weekly-report',
        ),
      );
      expect(screen.queryByTestId('daily-report-form-banner')).toBeNull();
      expect(
        screen.queryByText('اليوم هو يوم التسميع، ولا يُرسل فيه تقرير يومي'),
      ).toBeNull();
    });

    it('422 field-level: inline verbatim Arabic under the field, form preserved', async () => {
      jest.spyOn(dailyReportsApi, 'submitDailyReport').mockRejectedValue(
        new ApiError({
          statusCode: 422,
          error: 'VALIDATION_ERROR',
          message: 'فشل التحقق من صحة البيانات المدخلة',
          details: [
            {
              field: 'absence_reason',
              rule: 'VR-19',
              message: 'سبب الغياب مطلوب عند نوع الغياب',
            },
          ],
        }),
      );
      submitAbsent();

      await screen.findByTestId('absence-reason-picker-error');
      expect(screen.getByText('سبب الغياب مطلوب عند نوع الغياب')).toBeTruthy();
      expect(
        screen.getByTestId('daily-report-form-banner-message').props.children,
      ).toBe('يرجى تصحيح الأخطاء الموضحة في الحقول');
      // Form still there, selection preserved.
      expect(
        screen.getByTestId('absence-reason-picker-other').props
          .accessibilityState.selected,
      ).toBe(true);
      expect(screen.getByTestId('submit-report-button')).toBeTruthy();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('403 (group archived / membership inactive): server message, returns Home', async () => {
      jest.spyOn(dailyReportsApi, 'submitDailyReport').mockRejectedValue(
        new ApiError({
          statusCode: 403,
          error: 'SCOPE_DENIED',
          message: 'حلقتك لم تعد نشطة؛ لا يمكن إرسال تقارير جديدة',
        }),
      );
      submitAbsent();

      await screen.findByTestId('daily-report-form-banner');
      expect(
        screen.getByText('حلقتك لم تعد نشطة؛ لا يمكن إرسال تقارير جديدة'),
      ).toBeTruthy();
      fireEvent.press(screen.getByTestId('daily-report-form-home-button'));
      expect(mockReplace).toHaveBeenCalledWith('/(app)/student');
    });

    it('500: generic retry message, never the server string, data preserved and retry works', async () => {
      const spy = jest
        .spyOn(dailyReportsApi, 'submitDailyReport')
        .mockRejectedValueOnce(
          new ApiError({
            statusCode: 500,
            error: 'INTERNAL_ERROR',
            message: 'FATAL: relation "daily_reports" does not exist',
          }),
        )
        .mockResolvedValueOnce(created);
      submitAbsent();

      await screen.findByTestId('daily-report-form-banner');
      expect(
        screen.getByTestId('daily-report-form-banner-message').props.children,
      ).toBe('حدث خطأ أثناء إرسال التقرير، يرجى المحاولة مرة أخرى');
      expect(screen.queryByText(/relation/)).toBeNull();
      expect(screen.queryByTestId('daily-report-form-home-button')).toBeNull();

      fireEvent.press(submitButton());
      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith('/(app)/student'),
      );
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy.mock.calls[1][0]).toEqual(spy.mock.calls[0][0]);
    });

    it('network failure: retry banner with the shared copy, data preserved', async () => {
      jest
        .spyOn(dailyReportsApi, 'submitDailyReport')
        .mockRejectedValue(new NetworkError('Network request failed'));
      submitAbsent();

      await screen.findByTestId('daily-report-form-banner');
      expect(
        screen.getByTestId('daily-report-form-banner-message').props.children,
      ).toBe('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.');
      expect(screen.getByTestId('submit-report-button')).toBeTruthy();
    });
  });

  describe('discard (UF §25: prompt only if touched)', () => {
    it('goes straight back when nothing was touched', () => {
      renderScreen('Absent');
      fireEvent.press(screen.getByTestId('daily-report-form-top-bar-back'));
      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('discard-report-dialog')).toBeNull();
    });

    it('asks before discarding a touched form and only leaves on confirm', () => {
      renderScreen('Absent');
      fireEvent.press(screen.getByTestId('absence-reason-picker-sick'));
      fireEvent.press(screen.getByTestId('daily-report-form-top-bar-back'));

      expect(screen.getByTestId('discard-report-dialog')).toBeTruthy();
      expect(screen.getByText('تجاهل هذا التقرير؟')).toBeTruthy();
      expect(mockBack).not.toHaveBeenCalled();

      fireEvent.press(
        screen.getByTestId('discard-report-dialog-cancel-button'),
      );
      expect(screen.queryByTestId('discard-report-dialog')).toBeNull();
      expect(mockBack).not.toHaveBeenCalled();

      fireEvent.press(screen.getByTestId('daily-report-form-top-bar-back'));
      fireEvent.press(
        screen.getByTestId('discard-report-dialog-confirm-button'),
      );
      expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it('falls back to Home when there is no history', () => {
      mockCanGoBack.mockReturnValue(false);
      renderScreen('Revision');
      fireEvent.press(screen.getByTestId('daily-report-form-top-bar-back'));
      expect(mockReplace).toHaveBeenCalledWith('/(app)/student');
    });
  });
});
