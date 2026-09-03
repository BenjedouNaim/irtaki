import React from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabBar, TAB_BAR_ITEMS } from '@/shared/components/TabBar';

export type AssistantTabKey = 'home' | 'join-requests' | 'payments';

/**
 * Figma TabBar.Role=Assistant — Home · Join Requests · Payments, every tab
 * live now that SCR-20 exists (F-PAY-02). UF §23 keeps all three listed
 * even for an Assistant with no groups assigned.
 */
export const ASSISTANT_TAB_ITEMS = TAB_BAR_ITEMS.assistant;

export interface AssistantTabBarProps {
  activeKey: AssistantTabKey;
  testID?: string;
}

/**
 * Bottom tabs shared by SCR-17 (Home), SCR-18 (Join Requests Queue) and
 * SCR-20 (Payments Ledger). Home is the Assistant root route; the other two
 * are pushed on top of it, so returning "Home" pops when possible (UF §31
 * stack returns rightward).
 */
export function AssistantTabBar({
  activeKey,
  testID = 'assistant-tab-bar',
}: AssistantTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleSelect = (key: string) => {
    if (key === activeKey) return;
    if (key === 'home') {
      if (router.canGoBack?.()) {
        router.back();
      } else {
        router.replace('/(app)/assistant');
      }
      return;
    }
    const href =
      key === 'payments'
        ? '/(app)/assistant/payments'
        : '/(app)/assistant/join-requests';
    // Home is the stack root and the other two tabs sit exactly one level
    // above it, so hopping between them replaces rather than deepens the
    // stack — "Home" then still pops straight back (UF §31).
    if (activeKey === 'home') {
      router.push(href);
    } else {
      router.replace(href);
    }
  };

  return (
    <TabBar
      role="assistant"
      items={ASSISTANT_TAB_ITEMS}
      activeKey={activeKey}
      onSelect={handleSelect}
      bottomInset={insets.bottom > 0 ? insets.bottom : 12}
      testID={testID}
    />
  );
}
