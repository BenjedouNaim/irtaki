import React from 'react';
import { RootNavigator } from '@/navigation/RootNavigator';

/**
 * The app's entry route. It owns no routing decision of its own — F-DASH-02
 * put that in `RootNavigator`, so the entry route, the auth layout's
 * bounce-out and the post-login replace all resolve a role's Home the same
 * way (`navigation/roleHome.ts`).
 */
export default function Index() {
  return <RootNavigator />;
}
