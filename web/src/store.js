import { useSyncExternalStore } from 'react';
import { subscribe, getVersion } from './core.js';

export const useCore = () => useSyncExternalStore(subscribe, getVersion);
