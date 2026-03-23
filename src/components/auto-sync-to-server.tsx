"use client";

import { useEffect } from "react";
import {
  hasDurableStoreStateChanged,
  scheduleSyncToServer,
} from "@/lib/sync-db";
import { useWidgetStore } from "@/store/widget-store";

export function AutoSyncToServer() {
  useEffect(() => {
    let unsubscribeStore: (() => void) | null = null;

    const attachStoreSubscription = () => {
      if (unsubscribeStore) {
        return;
      }

      unsubscribeStore = useWidgetStore.subscribe((currentState, previousState) => {
        if (hasDurableStoreStateChanged(currentState, previousState)) {
          scheduleSyncToServer();
        }
      });
    };

    const unsubscribeHydration = useWidgetStore.persist.onFinishHydration(() => {
      attachStoreSubscription();
    });

    if (useWidgetStore.persist.hasHydrated()) {
      attachStoreSubscription();
    }

    return () => {
      unsubscribeHydration();
      unsubscribeStore?.();
    };
  }, []);

  return null;
}
