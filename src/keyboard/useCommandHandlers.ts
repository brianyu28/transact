import { useEffect, useLayoutEffect, useRef } from 'react';
import type { CommandId } from './catalog';
import { attachHandlers, type Handler } from './registry';

/**
 * Attaches keyboard command handlers while the component is mounted. Handlers always
 * see the latest props/state (they're read through a ref), so callers don't need to
 * memoize them.
 */
export function useCommandHandlers(map: Partial<Record<CommandId, Handler>>): void {
  const ref = useRef(map);
  useLayoutEffect(() => {
    ref.current = map;
  });
  const ids = Object.keys(map).sort().join(',');
  useEffect(() => {
    const stable: Partial<Record<CommandId, Handler>> = {};
    for (const id of ids.split(',').filter(Boolean) as CommandId[]) {
      stable[id] = {
        run: () => ref.current[id]?.run(),
        enabled: () => {
          const h = ref.current[id];
          return h !== undefined && (!h.enabled || h.enabled());
        },
      };
    }
    return attachHandlers(stable);
  }, [ids]);
}
