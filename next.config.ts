import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The diff viewer fires upstream patch fetches on mount; React StrictMode's
  // double-invoked effects would double those requests in dev. Matches the
  // upstream DiffsHub config (see NOTICE for attribution).
  reactStrictMode: false,
  // Resolve and transpile the @pierre workspace packages so their subpath
  // exports (e.g. @pierre/diffs/react, @pierre/trees/react) resolve when Next
  // follows client-component imports from the server.
  transpilePackages: ["@pierre/trees", "@pierre/diffs"],
};

export default nextConfig;
