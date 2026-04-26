import { useEffect, useState } from 'react';
import { Moon, Sun, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { VoiceCall } from '@/components/VoiceCall';

type Theme = 'light' | 'dark';

export function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme');
    return stored === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    document.body.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <Mic className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-none">VoiceForge</h1>
              <p className="text-xs text-muted-foreground mt-1">
                Real-time voice agent demo
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <ErrorBoundary>
          <div className="max-w-5xl mx-auto px-6 py-10">
            <VoiceCall />
          </div>
        </ErrorBoundary>
      </main>

      <footer className="border-t border-border/60 mt-10">
        <div className="max-w-5xl mx-auto px-6 py-4 text-xs text-muted-foreground flex items-center justify-between">
          <span>VoiceForge · Groq + ElevenLabs · 100% free tier</span>
          <span>Best with headphones to avoid echo.</span>
        </div>
      </footer>
    </div>
  );
}
