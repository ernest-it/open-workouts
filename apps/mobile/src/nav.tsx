import { createContext, useContext } from 'react';

/** Minimal stack navigation per tab (keeps native dependencies to a minimum). */
export type Route =
  | { name: 'workout' }
  | { name: 'templateDetail'; id: string }
  | { name: 'templateEdit'; id: string }
  | { name: 'workoutDone'; id: string }
  | { name: 'history' }
  | { name: 'workoutDetail'; id: string }
  | { name: 'exercises' }
  | { name: 'exerciseDetail'; id: string }
  | { name: 'profile' }
  | { name: 'insights' }
  | { name: 'settings' };

export type Tab = 'history' | 'workout' | 'exercises' | 'insights';

export interface Nav {
  push: (r: Route) => void;
  pop: () => void;
  switchTab: (t: Tab) => void;
}

export const NavContext = createContext<Nav>({ push: () => {}, pop: () => {}, switchTab: () => {} });
export const useNav = () => useContext(NavContext);
