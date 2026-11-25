/** App version from package.json, injected at build time. */
declare const __APP_VERSION__: string;
/** The commit this build was made from (when known) and when it was built. */
declare const __BUILD_INFO__: {
  commit: string | null;
  commitDate: string | null;
  builtAt: string;
};
