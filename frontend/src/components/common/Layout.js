// src/components/common/Layout.js
import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

export default function Layout({ children }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer automatically on route change (in case a link
  // inside it navigates via something other than its own onClick, e.g.
  // browser back/forward).
  React.useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

  return (
    <div className="page-layout">
      <Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="main-content">
        <TopBar onMenuClick={() => setMobileNavOpen(o => !o)} />
        <main className="page-inner">{children}</main>
      </div>
    </div>
  );
}
