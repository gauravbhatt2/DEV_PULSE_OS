import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'GitHub Intelligence | DevPulse Agent OS',
  description: 'Real-time repository activity, AI commit analysis, and Jira correlation',
};

export default function GitHubLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
