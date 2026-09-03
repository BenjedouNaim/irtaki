import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ReportTypeCard, REPORT_TYPE_CARD_COPY } from '../ReportTypeCard';

describe('ReportTypeCard (Figma 17:106)', () => {
  it.each(['normal', 'revision', 'absent'] as const)(
    'renders the %s card copy and icon and fires onPress',
    (type) => {
      const onPress = jest.fn();
      render(<ReportTypeCard type={type} onPress={onPress} />);

      const card = screen.getByRole('button');
      expect(screen.getByText(REPORT_TYPE_CARD_COPY[type].title)).toBeTruthy();
      expect(
        screen.getByText(REPORT_TYPE_CARD_COPY[type].subtitle),
      ).toBeTruthy();
      expect(
        screen.getByTestId(`report-type-card-${type}-icon`, {
          includeHiddenElements: true,
        }),
      ).toBeTruthy();
      fireEvent.press(card);
      expect(onPress).toHaveBeenCalledTimes(1);
    },
  );

  it('accepts copy overrides and a disabled state', () => {
    render(
      <ReportTypeCard
        type="normal"
        onPress={jest.fn()}
        title="T"
        subtitle="S"
        disabled
      />,
    );
    expect(screen.getByText('T')).toBeTruthy();
    expect(screen.getByRole('button').props.accessibilityState.disabled).toBe(
      true,
    );
  });
});
