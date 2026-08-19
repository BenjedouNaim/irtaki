import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Button } from '../Button';

describe('Button', () => {
  it('renders label correctly', async () => {
    await render(<Button label="تسجيل الدخول" onPress={jest.fn()} />);
    expect(screen.getByText('تسجيل الدخول')).toBeTruthy();
  });

  it('triggers onPress when clicked', async () => {
    const onPressMock = jest.fn();
    await render(<Button label="حفظ" onPress={onPressMock} />);
    fireEvent.press(screen.getByText('حفظ'));
    expect(onPressMock).toHaveBeenCalledTimes(1);
  });

  it('shows ActivityIndicator and disables press when loading', async () => {
    const onPressMock = jest.fn();
    await render(<Button label="تحميل" onPress={onPressMock} loading />);
    expect(screen.getByTestId('button-loading-indicator')).toBeTruthy();
    expect(screen.queryByText('تحميل')).toBeNull();
  });

  it('does not trigger onPress when disabled', async () => {
    const onPressMock = jest.fn();
    await render(<Button label="معطل" onPress={onPressMock} disabled />);
    fireEvent.press(screen.getByText('معطل'));
    expect(onPressMock).not.toHaveBeenCalled();
  });
});
