// Derived from DiffsHub (pierrecomputer/pierre), Apache-2.0. Changes by the
// peekdiff authors: removed the monorepo worktree title-prefix logic and the
// DiffsHub brand image assets (icons/OG/Twitter), and rebranded origin/title.
import type { Metadata, Viewport } from 'next';

import './globals.css';
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: false,
  maximumScale: 1,
  viewportFit: 'cover',
  // The body uses --peekdiff-sidebar-bg (#f7f7f7 / #101010) rather than the
  // plain neutral background, so it gets its own theme-color pair for the
  // browser chrome address bar.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f7f7' },
    { media: '(prefers-color-scheme: dark)', color: '#101010' },
  ],
};

const PROD_ORIGIN = 'https://peekdiff.dev';
// In dev, point `metadataBase` at localhost so OG previewers fetch
// in-progress assets instead of whatever's deployed.
const isDev = process.env.NODE_ENV !== 'production';
const DEV_PORT = process.env.PORT ?? '3000';
const SITE_ORIGIN = isDev ? `http://localhost:${DEV_PORT}` : PROD_ORIGIN;
const description = SITE_DESCRIPTION;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: SITE_NAME,
    template: '%s',
  },
  description,
  openGraph: {
    title: {
      default: SITE_NAME,
      template: '%s',
    },
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title: {
      default: SITE_NAME,
      template: '%s',
    },
    description,
  },
};

export { RootLayout as default } from '@/components/RootLayout';
