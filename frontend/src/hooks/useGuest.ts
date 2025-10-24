import { useCallback, useEffect, useState } from 'react';
import apiClient from '../services/api';

export const GUEST_DRAFT_KEY = 'canvas-guest-draft';
export const GUEST_STORAGE_KEY = 'guest_session';

type GuestSession = {
  guest_id: string;
  expires_at: string;
};

async function fetchGuestToken(): Promise<GuestSession> {
  const resp = await apiClient.post('/guest/token');
  return resp.data as GuestSession;
}

export default function useGuest(isAuthenticated: boolean) {
  const [guest, setGuest] = useState<GuestSession | null>(() => {
    try {
      const raw = localStorage.getItem(GUEST_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { /* ignore */
      return null;
    }
  });

  useEffect(() => {
    // if authenticated, we still keep guest data in storage but treat user as not-guest
    // cleaning up guest sessions should be user-driven (claim or clear)
  }, [isAuthenticated]);

  const ensureGuest = useCallback(async () => {
    // If authenticated, don't create a guest session
    if (isAuthenticated) return null;
    if (guest) return guest;
    const newGuest = await fetchGuestToken();
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(newGuest));
    // Dispatch event so other components (like App) know to re-render
    window.dispatchEvent(new Event('storage-local-change'));
    setGuest(newGuest);
    return newGuest;
  }, [guest, isAuthenticated]);

  const isGuest = !!guest && !isAuthenticated;

  // Map of client-side project keys -> server project UUID
  const GUEST_PROJECT_MAP_KEY = 'guest_project_map';

  const readProjectMap = () => {
    try { return JSON.parse(localStorage.getItem(GUEST_PROJECT_MAP_KEY) || '{}'); } catch { /* ignore */ return {}; }
  };

  const writeProjectMap = (m: Record<string, string>) => {
    try { localStorage.setItem(GUEST_PROJECT_MAP_KEY, JSON.stringify(m)); } catch { /* ignore */ }
  };

  const saveDraft = useCallback(async (objects: unknown[], title?: string, clientKey?: string) => {
    // Save to server as guest project and also keep a local copy
    try {
    await ensureGuest();
      const map = readProjectMap();
      // If we have a server uuid already for this clientKey, PATCH instead of POST
      if (clientKey && map[clientKey]) {
        const serverUuid = map[clientKey];
        await apiClient.patch(`/guest/projects/${serverUuid}`, { title: title || 'Untitled', canvas_state: { objects } });
      } else {
        const resp = await apiClient.post('/guest/projects', { title: title || 'Untitled', canvas_state: { objects } });
        // store mapping
        if (clientKey && resp?.data?.uuid) {
          map[clientKey] = resp.data.uuid;
          writeProjectMap(map);
        }
      }
    } catch (e) {
      console.error('Failed to save guest draft to server, falling back to localStorage', e);
    }

    // Local fallback
    try {
      const draft = { objects, title: title || `Draft - ${new Date().toLocaleString()}`, timestamp: Date.now() };
      localStorage.setItem(GUEST_DRAFT_KEY, JSON.stringify(draft));
    } catch (e) {
      console.error('Failed to save guest draft to localStorage', e);
    }
  }, [ensureGuest]);

  const getDraft = useCallback(() => {
    const raw = localStorage.getItem(GUEST_DRAFT_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }, []);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(GUEST_DRAFT_KEY);
  }, []);

  const getGuestId = useCallback(() => guest?.guest_id ?? null, [guest]);

  const claimGuestProjects = useCallback(async (guest_id: string) => {
    try {
      const resp = await apiClient.post('/guest/claim', { guest_id });
      // On success, clear local guest storage and drafts
      localStorage.removeItem(GUEST_STORAGE_KEY);
      localStorage.removeItem(GUEST_DRAFT_KEY);
      setGuest(null);
      return resp.data;
    } catch (e) {
      console.error('Failed to claim guest projects', e);
      throw e;
    }
  }, []);

  return {
    guest,
    isGuest,
    ensureGuest,
    getGuestId,
    saveDraft,
    getDraft,
    clearDraft,
    claimGuestProjects,
  } as const;
}
