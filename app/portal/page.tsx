import GovernancePortal from './portal';
import './portal.css';
export const metadata = { title: 'Governance workspace preview', robots: { index: false, follow: false }, alternates: { canonical: '/portal' } };
export default function PortalPage() { return <GovernancePortal />; }
