import { useEffect, useState } from "react";
import { Wrench, Loader2 } from "lucide-react";

interface SplashScreenProps {
  onComplete: () => void;
}

const SplashScreen = ({ onComplete }: SplashScreenProps) => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
      setTimeout(onComplete, 300);
    }, 2000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 animate-fade-in">
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <div className="absolute inset-0 animate-ping opacity-20">
            <div className="w-24 h-24 rounded-full bg-primary"></div>
          </div>
          <div className="relative w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center backdrop-blur-sm border-2 border-primary/30">
            <Wrench className="w-12 h-12 text-primary animate-pulse" />
          </div>
        </div>
        
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent animate-fade-in">
            Vijaya Auto Spares
          </h1>
          <p className="text-sm text-muted-foreground animate-fade-in">
            Professional Parts Management
          </p>
        </div>

        {loading && (
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        )}
      </div>
    </div>
  );
};

export default SplashScreen;
