import { createContext, useContext } from 'react';

/** Minimal stack navigation per tab (keeps native dependencies to a minimum). */
export type Route =
  | { name: 'workout' }
  | { name: 'history' }
  | { name: 'workoutDetail'; id: string }
  | { name: 'exercises' }
  | { name: 'exerciseDetail'; id: string }
  | { name: 'profile' }
  | { name: 'insights' }
  | { name: 'settings' };

export type Tab = 'profile' | 'history' | 'workout' | 'exercises' | 'insights' | 'settings';

export interface Nav {
  push: (r: Route) => void;
  pop: () => void;
  switchTab: (t: Tab) => void;
}

export const NavContext = createContext<Nav>({ push: () => {}, pop: () => {}, switchTab: () => {} });
export const useNav = () => useContext(NavContext);
