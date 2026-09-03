import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import {
  PromoteRoleSheet,
  PROMOTABLE_ROLE_OPTIONS,
  promotableRoleLabel,
} from '../PromoteRoleSheet';

describe('PromoteRoleSheet (Figma 52:1193)', () => {
  function renderSheet(
    overrides: Partial<React.ComponentProps<typeof PromoteRoleSheet>> = {},
  ) {
    const props = {
      visible: true,
      userName: 'منير الغربي',
      selectedRole: null,
      onSelectRole: jest.fn(),
      onContinue: jest.fn(),
      onClose: jest.fn(),
      ...overrides,
    };
    return { ...render(<PromoteRoleSheet {...props} />), props };
  }

  it('offers exactly the two roles BR-R03 allows, Teacher first in reading order', () => {
    expect(PROMOTABLE_ROLE_OPTIONS.map((o) => o.role)).toEqual([
      'Teacher',
      'Assistant',
    ]);
    expect(promotableRoleLabel('Teacher')).toBe('معلّم');
    expect(promotableRoleLabel('Assistant')).toBe('مساعد');
  });

  it('titles the sheet with the user name and states the one-way rule', () => {
    const { getByTestId, getByText } = renderSheet();

    expect(getByTestId('promote-role-sheet-title')).toHaveTextContent(
      'ترقية منير الغربي',
    );
    expect(
      getByText('اختر الدور. الترقية باتجاه واحد في هذه النسخة — لا تنزيل.'),
    ).toBeTruthy();
  });

  it('starts with nothing selected and the CTA disabled', () => {
    const { getByTestId } = renderSheet();

    expect(
      getByTestId('promote-role-sheet-continue').props.accessibilityState
        .disabled,
    ).toBe(true);
    expect(
      getByTestId('promote-role-sheet-option-Teacher').props.accessibilityState
        .selected,
    ).toBe(false);
  });

  it('reports the picked role and marks it selected for assistive tech', () => {
    const { getByTestId, props, rerender } = renderSheet();

    fireEvent.press(getByTestId('promote-role-sheet-option-Assistant'));
    expect(props.onSelectRole).toHaveBeenCalledWith('Assistant');

    rerender(<PromoteRoleSheet {...props} selectedRole="Assistant" />);
    expect(
      getByTestId('promote-role-sheet-option-Assistant').props
        .accessibilityState.selected,
    ).toBe(true);
    expect(
      getByTestId('promote-role-sheet-continue').props.accessibilityState
        .disabled,
    ).toBe(false);
  });

  it('continues only once a role is chosen', () => {
    const { getByTestId, props } = renderSheet({ selectedRole: 'Teacher' });

    fireEvent.press(getByTestId('promote-role-sheet-continue'));
    expect(props.onContinue).toHaveBeenCalledTimes(1);
  });

  it('shows a submission error as icon + text inside the sheet (UF §32)', () => {
    const { getByTestId } = renderSheet({
      error: 'حدث خطأ أثناء ترقية المستخدم',
    });

    expect(getByTestId('promote-role-sheet-error')).toBeTruthy();
  });

  it('does not close on the scrim while a promotion is in flight', () => {
    const { getByTestId, props } = renderSheet({
      selectedRole: 'Teacher',
      busy: true,
    });

    fireEvent.press(getByTestId('promote-role-sheet-scrim'));
    expect(props.onClose).not.toHaveBeenCalled();
    expect(
      getByTestId('promote-role-sheet-continue').props.accessibilityState.busy,
    ).toBe(true);
  });

  it('closes on the scrim when idle', () => {
    const { getByTestId, props } = renderSheet();

    fireEvent.press(getByTestId('promote-role-sheet-scrim'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
