import { forwardRef, lazy, Suspense } from 'react';
import { MapComponentProps, MapRef } from './types';
import { useMapProvider } from './MapProvider';

const LeafletMap = lazy(() => import('./LeafletMap'));
const GoogleMap = lazy(() => import('./GoogleMap'));

function MapLoadingFallback({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div 
      className={className}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'hsl(var(--muted))',
        color: 'hsl(var(--muted-foreground))',
      }}
    >
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <span>Loading map...</span>
      </div>
    </div>
  );
}

export const Map = forwardRef<MapRef, MapComponentProps>(function Map(props, ref) {
  const provider = useMapProvider();
  
  return (
    <Suspense fallback={<MapLoadingFallback className={props.className} style={props.style} />}>
      {provider === 'google' ? (
        <GoogleMap ref={ref} {...props} />
      ) : (
        <LeafletMap ref={ref} {...props} />
      )}
    </Suspense>
  );
});

export default Map;
