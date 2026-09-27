export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.floor(ms / 1000);
  const remMs = ms % 1000;
  if (sec < 60) return remMs > 0 ? `${sec}.${Math.floor(remMs / 100)}s` : `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return `${min}m ${remSec}s`;
}
