import React, { useState } from 'react';
import type { ScreenTab } from './types.js';
import { Navigation } from './components/Navigation.js';
import { FreshnessBanner } from './components/FreshnessBanner.js';
import { WorkbenchScreen } from './screens/WorkbenchScreen.js';
import { SovereigntyDashboardScreen } from './screens/SovereigntyDashboardScreen.js';
import { MarketplaceScreen } from './screens/MarketplaceScreen.js';
import { AdminConsoleScreen } from './screens/AdminConsoleScreen.js';
import { ReviewQueueScreen } from './screens/ReviewQueueScreen.js';
import { ArchitectureBlueprintScreen } from './screens/ArchitectureBlueprintScreen.js';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<ScreenTab>('workbench');

  return (
    <div className="app-root">
      <Navigation currentTab={currentTab} onSelectTab={setCurrentTab} />

      <FreshnessBanner onNavigateToReview={() => setCurrentTab('review')} />

      <main className="app-main-content">
        {currentTab === 'workbench' && <WorkbenchScreen />}
        {currentTab === 'blueprint' && <ArchitectureBlueprintScreen />}
        {currentTab === 'sovereignty' && <SovereigntyDashboardScreen />}
        {currentTab === 'marketplace' && <MarketplaceScreen />}
        {currentTab === 'admin' && <AdminConsoleScreen />}
        {currentTab === 'review' && <ReviewQueueScreen />}
      </main>
    </div>
  );
};

export default App;
