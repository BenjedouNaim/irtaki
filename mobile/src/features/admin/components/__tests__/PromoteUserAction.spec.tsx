import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PromoteUserAction, canPromoteUser } from '../PromoteUserAction';
import * as usersApi from '@/shared/api/users.client';
import { ApiError, NetworkError } from '@/shared/api/types';

jest.mock('@/shared/api/users.client');

const promotableUser: usersApi.UserListItem = {
  id: 'user-1',
  email: 'mounir@example.com',
  full_name: 'منير الغربي',
  role: 'User',
};

const GENERIC_SERVER_MESSAGE = 'حدث خطأ أثناء ترقية المستخدم';
const NETWORK_MESSAGE = 'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';

function renderAction(
  overrides: Partial<React.ComponentProps<typeof PromoteUserAction>> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  const props = { user: promotableUser, ...overrides };
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <PromoteUserAction {...props} />
    </QueryClientProvider>,
  );
  return { ...utils, props, queryClient };
}

/** Row action → sheet → role → CTA → confirm dialog. */
function openConfirm(
  utils: ReturnType<typeof renderAction>,
  role: 'Teacher' | 'Assistant' = 'Assistant',
) {
  fireEvent.press(utils.getByTestId('promote-user-button'));
  fireEvent.press(utils.getByTestId(`promote-user-sheet-option-${role}`));
  fireEvent.press(utils.getByTestId('promote-user-sheet-continue'));
}

describe('PromoteUserAction (F-ADM-01, Figma 42:501 + 52:1193)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('BR-R03 availability', () => {
    it.each(['Teacher', 'Assistant', 'Student', 'Admin'])(
      'renders nothing for a %s row — promotion could not succeed there',
      (role) => {
        expect(canPromoteUser({ role })).toBe(false);
        const { queryByTestId } = renderAction({
          user: { ...promotableUser, role },
        });
        expect(queryByTestId('promote-user-button')).toBeNull();
      },
    );

    it('renders the inline "ترقية" action on a User row', () => {
      expect(canPromoteUser(promotableUser)).toBe(true);
      const { getByTestId } = renderAction();

      const button = getByTestId('promote-user-button');
      expect(button).toHaveTextContent('ترقية');
      expect(button.props.accessibilityLabel).toBe('ترقية منير الغربي');
    });

    it('falls back to the email when the account has no name yet', () => {
      const { getByTestId } = renderAction({
        user: { ...promotableUser, full_name: null },
      });

      expect(getByTestId('promote-user-button').props.accessibilityLabel).toBe(
        'ترقية mounir@example.com',
      );
    });
  });

  describe('Confirmation before the write (UF §25)', () => {
    it('asks for confirmation naming the user and the chosen role', () => {
      const utils = renderAction();
      openConfirm(utils, 'Assistant');

      expect(utils.getByTestId('promote-user-confirm-title')).toHaveTextContent(
        'ترقية منير الغربي إلى مساعد؟',
      );
      expect(
        utils.getByTestId('promote-user-confirm-message'),
      ).toHaveTextContent(
        'يصبح مؤهلًا للإسناد إلى مجموعة فورًا. لا يوجد خيار تنزيل في هذه النسخة.',
      );
      expect(
        utils.getByTestId('promote-user-confirm-confirm-button'),
      ).toHaveTextContent('ترقية إلى مساعد');
      expect(usersApi.promoteUserRole).not.toHaveBeenCalled();
    });

    it('does not call the API when the confirmation is cancelled', () => {
      const utils = renderAction();
      openConfirm(utils, 'Teacher');

      fireEvent.press(utils.getByTestId('promote-user-confirm-cancel-button'));
      expect(usersApi.promoteUserRole).not.toHaveBeenCalled();
    });
  });

  describe('Promotion', () => {
    it.each([
      ['Teacher' as const, 'معلّم'],
      ['Assistant' as const, 'مساعد'],
    ])('promotes to %s and reports the updated user', async (role, label) => {
      const updated = { ...promotableUser, role };
      jest
        .spyOn(usersApi, 'promoteUserRole')
        .mockResolvedValue({ data: updated });
      const onPromoted = jest.fn();
      const utils = renderAction({ onPromoted });

      openConfirm(utils, role);
      expect(
        utils.getByTestId('promote-user-confirm-confirm-button'),
      ).toHaveTextContent(`ترقية إلى ${label}`);
      fireEvent.press(utils.getByTestId('promote-user-confirm-confirm-button'));

      await waitFor(() =>
        expect(usersApi.promoteUserRole).toHaveBeenCalledWith('user-1', role),
      );
      await waitFor(() => expect(onPromoted).toHaveBeenCalledWith(updated));
    });
  });

  describe('Errors (UF §24)', () => {
    it('shows the filter’s Arabic message verbatim on 422 SOURCE_ROLE_NOT_USER', async () => {
      const message = 'لا يمكن ترقية هذا الحساب لأن دوره الحالي ليس "مستخدم"';
      jest.spyOn(usersApi, 'promoteUserRole').mockRejectedValue(
        new ApiError({
          statusCode: 422,
          error: 'SOURCE_ROLE_NOT_USER',
          message,
        }),
      );
      const utils = renderAction();

      openConfirm(utils);
      fireEvent.press(utils.getByTestId('promote-user-confirm-confirm-button'));

      expect(await utils.findByText(message)).toBeTruthy();
    });

    it('shows the generic retry copy on 500, never the server message', async () => {
      jest.spyOn(usersApi, 'promoteUserRole').mockRejectedValue(
        new ApiError({
          statusCode: 500,
          error: 'INTERNAL_ERROR',
          message: 'Postgres connection terminated',
        }),
      );
      const utils = renderAction();

      openConfirm(utils);
      fireEvent.press(utils.getByTestId('promote-user-confirm-confirm-button'));

      expect(await utils.findByText(GENERIC_SERVER_MESSAGE)).toBeTruthy();
      expect(utils.queryByText('Postgres connection terminated')).toBeNull();
    });

    it('shows the connectivity copy when the request never reaches the server', async () => {
      jest
        .spyOn(usersApi, 'promoteUserRole')
        .mockRejectedValue(new NetworkError());
      const utils = renderAction();

      openConfirm(utils);
      fireEvent.press(utils.getByTestId('promote-user-confirm-confirm-button'));

      expect(await utils.findByText(NETWORK_MESSAGE)).toBeTruthy();
    });
  });
});
