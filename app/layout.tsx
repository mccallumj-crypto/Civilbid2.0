import './globals.css';import AppShell from '@/components/AppShell';
export const metadata={title:'CivilBid',description:'Civil construction estimating, bidding and job costing'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><AppShell>{children}</AppShell></body></html>}
