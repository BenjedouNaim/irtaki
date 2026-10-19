import React from 'react';

/** Native applications already occupy the device's viewport. */
export function AppViewport({ children }: React.PropsWithChildren) {
  return <>{children}</>;
}
