import { useState, useEffect, ReactNode } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/integrations/firebase/client';
import { Loader2, AlertTriangle } from 'lucide-react'; // Icons you already use

interface AppConfig {
  isServiceActive: boolean;
  maintenanceMessage: string;
}

// Full-screen loading component
const FullScreenLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <Loader2 className="w-12 h-12 animate-spin text-primary" />
  </div>
);

// Full-screen maintenance component
const MaintenanceScreen = ({ message }: { message: string }) => (
  <div className="min-h-screen bg-background flex items-center justify-center p-4">
    <div className="text-center max-w-md">
      <AlertTriangle className="w-16 h-16 text-destructive mx-auto mb-4" />
      <h1 className="text-3xl font-bold mb-2">Service Unavailable</h1>
      <p className="text-lg text-muted-foreground">{message}</p>
    </div>
  </div>
);

// This component will wrap your entire application
// COMMENTED OUT: Service wrapper disabled for development
export const ServiceWrapper = ({ children }: { children: ReactNode }) => {
  // BYPASSED: Return children directly without Firebase checks
  return <>{children}</>;

  /* ORIGINAL FIREBASE SERVICE WRAPPER CODE - COMMENTED OUT
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // This is the real-time listener for the kill switch
    const docRef = doc(db, 'app_config', 'global');
    
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setConfig(docSnap.data() as AppConfig);
        } else {
          // If admin forgot to create the doc, default to maintenance mode
          console.error("CRITICAL: 'app_config/global' document is missing!");
          setConfig({ 
            isServiceActive: false, 
            maintenanceMessage: "App configuration is missing. Contact admin." 
          });
        }
        setIsLoading(false);
      },
      (error) => {
        // Handle error (e.g., permissions)
        console.error("Error fetching app config:", error);
        setError("Could not load app configuration. Check console for details.");
        setIsLoading(false);
      }
    );

    // Clean up the listener when the component unmounts
    return () => unsubscribe();
  }, []);

  if (isLoading) {
    return <FullScreenLoader />;
  }
  
  if (error) {
     return <MaintenanceScreen message={error} />;
  }

  if (config && !config.isServiceActive) {
    return <MaintenanceScreen message={config.maintenanceMessage} />;
  }

  // If loading is done and service is active, show the app
  return <>{children}</>;
  */
};