// Type declarations for CSS Modules used in web-targeted components.
// React Native itself does not use CSS files; these only apply to the
// web platform variant (*.web.tsx) via Expo's metro-bundler web config.
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}

// Side-effect import of the global CSS file used by the Expo web entry point.
declare module '*.css' {
  // no export — imported for side-effects only
}
