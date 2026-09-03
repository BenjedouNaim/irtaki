import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import type { Role } from '@/shared/auth';
import { useAuthStore } from '@/shared/auth';
import AuthLayout from '../(auth)/_layout';
import LoginPage from '../(auth)/login';
import RegisterPage from '../(auth)/register';
import AdminRoute from '../(app)/admin';
import AssistantRoute from '../(app)/assistant';
import StudentRoute from '../(app)/student';
import TeacherRoute from '../(app)/teacher';
import UserRoute from '../(app)/user';
import Index from '../index';

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => {
  const ReactModule = jest.requireActual<typeof React>('react');
  const { Text: RNText } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Redirect: ({ href }: { href: unknown }) =>
      ReactModule.createElement(RNText, { testID: 'redirect' }, String(href)),
    Stack: () => ReactModule.createElement(RNText, null, 'auth-stack-outlet'),
    useRouter: () => ({ replace: mockReplace, push: mockPush }),
    useLocalSearchParams: () => ({}),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual<typeof import('react-native-safe-area-context')>(
    'react-native-safe-area-context',
  ),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

interface LoginScreenProps {
  onLoginSuccess?: (role: string) => void;
}
interface RegisterScreenProps {
  onRegisterSuccess?: () => void;
}

const mockCaptured: {
  login: LoginScreenProps;
  register: RegisterScreenProps;
} = { login: {}, register: {} };

/**
 * Each Home screen and each auth screen has its own spec; these stubs keep
 * THIS spec about the one thing a route file is responsible for — pointing
 * at the right destination. `jest.mock` demands an inline factory (it is
 * hoisted above the imports), so each one builds its own element.
 */
function mockStub(testID: string): React.ComponentType {
  const ReactModule = jest.requireActual<typeof React>('react');
  const { Text: RNText } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const Stub = () => ReactModule.createElement(RNText, { testID });
  Stub.displayName = `Stub(${testID})`;
  return Stub;
}

jest.mock('@/navigation/stacks/UserStack', () => ({
  UserStack: mockStub('user-stack'),
}));
jest.mock('@/navigation/stacks/StudentTabs', () => ({
  StudentTabs: mockStub('student-tabs'),
}));
jest.mock('@/navigation/stacks/AssistantTabs', () => ({
  AssistantTabs: mockStub('assistant-tabs'),
}));
jest.mock('@/navigation/stacks/TeacherStack', () => ({
  TeacherStack: mockStub('teacher-stack'),
}));
jest.mock('@/navigation/stacks/AdminStack', () => ({
  AdminStack: mockStub('admin-stack'),
}));

jest.mock('@/features/auth/screens/LoginScreen', () => {
  const ReactModule = jest.requireActual<typeof React>('react');
  const { Text: RNText } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    LoginScreen: (props: LoginScreenProps) => {
      mockCaptured.login = props;
      return ReactModule.createElement(RNText, { testID: 'login-screen' });
    },
  };
});

jest.mock('@/features/auth/screens/RegisterScreen', () => {
  const ReactModule = jest.requireActual<typeof React>('react');
  const { Text: RNText } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    RegisterScreen: (props: RegisterScreenProps) => {
      mockCaptured.register = props;
      return ReactModule.createElement(RNText, { testID: 'register-screen' });
    },
  };
});

/**
 * F-DASH-02's acceptance criterion, one row per role: "Every role lands on
 * its correct Home screen immediately post-login."
 */
const ROLE_ROUTING: Array<{
  role: Role;
  screen: string;
  route: string;
  homeTestId: string;
  RouteComponent: React.ComponentType;
}> = [
  {
    role: 'User',
    screen: 'SCR-05',
    route: '/(app)/user',
    homeTestId: 'user-stack',
    RouteComponent: UserRoute,
  },
  {
    role: 'Student',
    screen: 'SCR-08',
    route: '/(app)/student',
    homeTestId: 'student-tabs',
    RouteComponent: StudentRoute,
  },
  {
    role: 'Assistant',
    screen: 'SCR-17',
    route: '/(app)/assistant',
    homeTestId: 'assistant-tabs',
    RouteComponent: AssistantRoute,
  },
  {
    role: 'Teacher',
    screen: 'SCR-22',
    route: '/(app)/teacher',
    homeTestId: 'teacher-stack',
    RouteComponent: TeacherRoute,
  },
  {
    role: 'Admin',
    screen: 'SCR-26',
    route: '/(app)/admin',
    homeTestId: 'admin-stack',
    RouteComponent: AdminRoute,
  },
];

describe('Role-based routing (F-DASH-02)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCaptured.login = {};
    mockCaptured.register = {};
    useAuthStore.getState().clearSession();
  });

  describe('entry route', () => {
    it('sends an unauthenticated caller to Login (SCR-01)', () => {
      render(<Index />);

      expect(screen.getByTestId('redirect')).toHaveTextContent('/(auth)/login');
    });

    it.each(ROLE_ROUTING)('sends $role to $screen', ({ role, route }) => {
      useAuthStore.getState().setSession('token', role);

      render(<Index />);

      expect(screen.getByTestId('redirect')).toHaveTextContent(route);
    });
  });

  describe('post-login', () => {
    it.each(ROLE_ROUTING)(
      'replaces the login screen with $screen for $role',
      ({ role, route }) => {
        render(<LoginPage />);

        act(() => {
          mockCaptured.login.onLoginSuccess?.(role);
        });

        expect(mockReplace).toHaveBeenCalledTimes(1);
        expect(mockReplace).toHaveBeenCalledWith(route);
        // `replace`, never `push`: Login must not sit behind a Home (UF §8).
        expect(mockPush).not.toHaveBeenCalled();
      },
    );
  });

  describe('post-registration', () => {
    it('replaces the register screen with SCR-05 (API-001 yields role=User)', () => {
      render(<RegisterPage />);

      act(() => {
        mockCaptured.register.onRegisterSuccess?.();
      });

      expect(mockReplace).toHaveBeenCalledWith('/(app)/user');
    });
  });

  describe('auth layout bounce-out', () => {
    it('renders the auth stack when there is no session', () => {
      render(<AuthLayout />);

      expect(screen.queryByTestId('redirect')).toBeNull();
    });

    it.each(ROLE_ROUTING)(
      'bounces an authenticated $role off the auth screens to $screen',
      ({ role, route }) => {
        useAuthStore.getState().setSession('token', role);

        render(<AuthLayout />);

        expect(screen.getByTestId('redirect')).toHaveTextContent(route);
      },
    );
  });

  describe('the Home routes themselves', () => {
    it.each(ROLE_ROUTING)(
      '$route renders $role’s Home ($screen)',
      ({ homeTestId, RouteComponent }) => {
        render(<RouteComponent />);

        expect(screen.getByTestId(homeTestId)).toBeTruthy();
      },
    );
  });
});
