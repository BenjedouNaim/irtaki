import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { FormField } from '../FormField';

describe('FormField', () => {
  it('renders label and children correctly', async () => {
    await render(
      <FormField label="البريد الإلكتروني">
        <Text testID="child-input">Input Field</Text>
      </FormField>,
    );

    expect(screen.getByText('البريد الإلكتروني')).toBeTruthy();
    expect(screen.getByTestId('child-input')).toBeTruthy();
  });

  it('shows required asterisk when required is true', async () => {
    await render(
      <FormField label="الاسم الكامل" required>
        <Text>Input</Text>
      </FormField>,
    );

    expect(screen.getByText('*')).toBeTruthy();
  });

  it('renders error message and icon when error is passed (never color-only)', async () => {
    await render(
      <FormField label="كلمة المرور" error="كلمة المرور قصيرة جداً">
        <Text>Input</Text>
      </FormField>,
    );

    expect(screen.getByTestId('form-field-error')).toBeTruthy();
    expect(screen.getByText('كلمة المرور قصيرة جداً')).toBeTruthy();
    expect(screen.getByTestId('form-field-error-icon')).toBeTruthy();
  });

  it('renders helpText when provided and no error exists', async () => {
    await render(
      <FormField label="الهاتف" helpText="أدخل رقماً تونسياً صحيحاً">
        <Text>Input</Text>
      </FormField>,
    );

    expect(screen.getByTestId('form-field-help')).toBeTruthy();
    expect(screen.getByText('أدخل رقماً تونسياً صحيحاً')).toBeTruthy();
  });
});

describe('FormField — Figma 6:53 states', () => {
  it('error paints the asterisk text/error and exposes an alert row', async () => {
    await render(
      <FormField label="البريد" required error="خطأ">
        <Text>Input</Text>
      </FormField>,
    );
    expect(screen.getByText('*').props.className).toContain('text-fg-error');
    expect(screen.getByTestId('form-field-error').props.accessibilityRole).toBe(
      'alert',
    );
    expect(screen.getByLabelText('تنبيه')).toBeTruthy();
  });

  it('disabled greys the label', async () => {
    await render(
      <FormField label="الدور" disabled>
        <Text>Input</Text>
      </FormField>,
    );
    expect(screen.getByText('الدور').props.className).toContain(
      'text-fg-disabled',
    );
  });
});
