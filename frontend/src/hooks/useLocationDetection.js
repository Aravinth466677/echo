import { useState, useCallback, useRef } from 'react';

const GOOD_ACCURACY_THRESHOLD_METERS = 50;
const USABLE_ACCURACY_THRESHOLD_METERS = 1000;
const MAX_ACCEPTABLE_ACCURACY_METERS = 5000;

export const useLocationDetection = () => {
  const [location, setLocation] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [error, setError] = useState(null);
  const [isDetecting, setIsDetecting] = useState(false);

  const watchIdRef = useRef(null);
  const hasUsableFixRef = useRef(false);
  const bestAccuracyRef = useRef(Number.POSITIVE_INFINITY);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setIsDetecting(false);
  }, []);

  const detectLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported by this browser');
      return;
    }

    setIsDetecting(true);
    setError(null);
    setLocation(null);
    setAccuracy(null);
    hasUsableFixRef.current = false;
    bestAccuracyRef.current = Number.POSITIVE_INFINITY;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy: reportedAccuracy } = position.coords;
        const roundedAccuracy = Math.round(reportedAccuracy);

        if (!Number.isFinite(roundedAccuracy) || roundedAccuracy > MAX_ACCEPTABLE_ACCURACY_METERS) {
          console.log(`GPS: ignoring inaccurate fix (${roundedAccuracy}m)`);
          return;
        }

        if (
          roundedAccuracy > bestAccuracyRef.current &&
          bestAccuracyRef.current <= USABLE_ACCURACY_THRESHOLD_METERS
        ) {
          return;
        }

        bestAccuracyRef.current = roundedAccuracy;
        hasUsableFixRef.current = roundedAccuracy <= USABLE_ACCURACY_THRESHOLD_METERS;

        setLocation({ latitude, longitude });
        setAccuracy(roundedAccuracy);
        console.log(`GPS: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (+/-${roundedAccuracy}m)`);

        if (roundedAccuracy <= GOOD_ACCURACY_THRESHOLD_METERS) {
          console.log('Good accuracy achieved, stopping GPS tracking');
          stopWatching();
        }
      },
      (geoError) => {
        console.error('Geolocation error:', geoError);

        if (geoError.code === geoError.TIMEOUT && hasUsableFixRef.current) {
          stopWatching();
          return;
        }

        let errorMessage = 'Location access failed. ';

        switch (geoError.code) {
          case geoError.PERMISSION_DENIED:
            errorMessage += 'Please enable location permissions.';
            break;
          case geoError.POSITION_UNAVAILABLE:
            errorMessage += 'GPS unavailable. Try moving to an open area.';
            break;
          case geoError.TIMEOUT:
            errorMessage += 'GPS timeout. Please try again.';
            break;
          default:
            errorMessage += 'Please check GPS settings.';
        }

        setError(errorMessage);
        setIsDetecting(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  }, [stopWatching]);

  const reset = useCallback(() => {
    stopWatching();
    setLocation(null);
    setAccuracy(null);
    setError(null);
    hasUsableFixRef.current = false;
    bestAccuracyRef.current = Number.POSITIVE_INFINITY;
  }, [stopWatching]);

  return {
    detectLocation,
    stopWatching,
    reset,
    location,
    accuracy,
    error,
    isDetecting,
  };
};
