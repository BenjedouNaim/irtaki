import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Dialog } from '../Dialog';

const base = {
  visible: true,
  title: 'قبول طلب الانضمام؟',
  body: 'سيتم إنشاء عضوية جديدة وبدء دورة الدفع فورًا.',
  onConfirm: jest.fn(),
  onCancel: jest.fn(),
};

describe('Dialog (Figma 14:90)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('Standard: primary confirm + ghost cancel, secondary body', () => {
    render(<Dialog {...base} confirmLabel="قبول" />);

    expect(screen.getByText('قبول طلب الانضمام؟')).toBeTruthy();
    expect(screen.getByTestId('dialog-message').props.className).toContain(
      'text-fg-secondary',
    );
    fireEvent.press(screen.getByText('قبول'));
    expect(base.onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByText('إلغاء'));
    expect(base.onCancel).toHaveBeenCalledTimes(1);
    expect(
      screen.getByTestId('dialog-confirm-button').props.className,
    ).toContain('bg-primary');
  });

  it('Strong: error-toned body and a destructive confirm', () => {
    render(<Dialog {...base} weight="strong" confirmLabel="تأكيد التسجيل" />);
    expect(screen.getByTestId('dialog-message').props.className).toContain(
      'text-fg-error',
    );
    expect(
      screen.getByTestId('dialog-confirm-button').props.className,
    ).toContain('bg-error');
  });

  it('Light: secondary confirm', () => {
    render(<Dialog {...base} weight="light" confirmLabel="تجاهل" />);
    expect(
      screen.getByTestId('dialog-confirm-button').props.className,
    ).toContain('bg-subtle');
  });

  it('backdrop cancels unless loading', () => {
    const { rerender } = render(<Dialog {...base} />);
    fireEvent.press(screen.getByTestId('dialog-backdrop'));
    expect(base.onCancel).toHaveBeenCalledTimes(1);

    rerender(<Dialog {...base} loading />);
    fireEvent.press(screen.getByTestId('dialog-backdrop'));
    fireEvent.press(screen.getByTestId('dialog-cancel-button'));
    expect(base.onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('button-loading-indicator')).toBeTruthy();
  });
});
