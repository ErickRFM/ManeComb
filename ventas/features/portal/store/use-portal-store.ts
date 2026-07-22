import { create } from 'zustand';
import type { PortalStore } from './portal-types';
import { emptyPortalState } from './portal-initial-state';
import { createPortalActions } from './portal-actions';

export const usePortalStore = create<PortalStore>((set, get) => ({
  ...emptyPortalState,
  ...createPortalActions(set, get),
}));
