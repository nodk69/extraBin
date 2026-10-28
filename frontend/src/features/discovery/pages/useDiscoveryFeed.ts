import { useEffect, useRef, useState } from 'react';
import type { PasteSummary } from '../../dashboard/api/accountApi';

export interface FeedResult {
  items: PasteSummary[];
  next: number | string | null;
  hasMore: boolean;
  totalElements?: number;
}
type Operation = 'initial' | 'more' | 'refresh';
type Loader = (position: number | string | undefined, signal: AbortSignal) => Promise<FeedResult>;

const fresh = (key: string) => ({
  key, generation: Symbol(key), items: [] as PasteSummary[], next: undefined as number | string | null | undefined,
  hasMore: false, totalElements: undefined as number | undefined, loaded: false, dirty: false,
  loading: false, error: false, failed: null as Operation | null, depth: 0,
});
const unique = (items: PasteSummary[]) => {
  const ids = new Set<string>();
  return items.filter((item) => {
    const id = item.id == null ? '' : String(item.id).trim();
    if (!id) return true;
    if (ids.has(id)) return false;
    ids.add(id);
    return true;
  });
};

/** Component-local pagination. No request starts until the activation microtask survives cleanup. */
export function useDiscoveryFeed(key: string, active: boolean, load: Loader) {
  const model = useRef(fresh(key));
  const request = useRef<{ controller: AbortController; token: string } | null>(null);
  const refreshQueued = useRef(false);
  const loader = useRef(load);
  loader.current = load;
  const [snapshot, setSnapshot] = useState(model.current);
  const mounted = useRef(false);
  const enabled = useRef(active);
  enabled.current = active;

  // Identity/filter changes must hide old rows in this render, not one effect later.
  if (model.current.key !== key) {
    request.current?.controller.abort();
    request.current = null;
    refreshQueued.current = false;
    model.current = fresh(key);
  }
  const publish = () => {
    if (mounted.current) setSnapshot({ ...model.current });
  };
  const cancel = () => {
    request.current?.controller.abort();
    request.current = null;
    refreshQueued.current = false;
    model.current.loading = false;
  };
  const run = (operation: Operation) => {
    const state = model.current;
    if (!mounted.current) return;
    if (!enabled.current) {
      if (operation === 'refresh' && state.loaded) {
        state.dirty = true;
        publish();
      }
      return;
    }
    if (request.current) {
      if (operation === 'refresh') {
        refreshQueued.current = true;
        state.dirty = true;
      }
      return;
    }
    if (operation === 'more' && (!state.loaded || !state.hasMore)) return;
    const controller = new AbortController();
    const token = `${state.key}:${operation}:${String(operation === 'more' ? state.next : 0)}`;
    const pending = { controller, token };
    request.current = pending;
    state.loading = true;
    state.error = false;
    if (operation === 'refresh') state.dirty = true;
    publish();
    const valid = () => mounted.current && !controller.signal.aborted && model.current === state && request.current === pending;
    void Promise.resolve().then(async () => {
      if (!valid()) return;
      try {
        let position = operation === 'more' ? state.next ?? undefined : undefined;
        let rows: PasteSummary[] = [];
        let result: FeedResult | undefined;
        let depth = 0;
        const limit = operation === 'refresh' ? Math.max(1, state.depth) : 1;
        for (let index = 0; index < limit; index++) {
          result = await loader.current(position, controller.signal);
          if (!valid()) return;
          rows.push(...result.items);
          depth++;
          if (!result.hasMore || result.next === null) break;
          position = result.next;
        }
        if (!valid() || !result) return;
        state.items = unique(operation === 'more' ? [...state.items, ...rows] : rows);
        state.next = result.next;
        state.hasMore = result.hasMore && result.next !== null;
        state.totalElements = result.totalElements;
        state.depth = operation === 'more' ? state.depth + depth : depth;
        state.loaded = true;
        state.dirty = false;
        state.failed = null;
      } catch (error) {
        if (!valid()) return;
        const name = (error as { name?: string })?.name;
        if (name !== 'AbortError' && name !== 'CanceledError') {
          state.error = true;
          state.failed = operation;
        }
      } finally {
        if (valid()) {
          request.current = null;
          state.loading = false;
          publish();
          if (refreshQueued.current) {
            refreshQueued.current = false;
            runner.current('refresh');
          }
        }
      }
    });
  };
  const runner = useRef(run);
  runner.current = run;

  useEffect(() => {
    mounted.current = true;
    publish();
    let cancelled = false;
    if (active && !model.current.error && (!model.current.loaded || model.current.dirty)) {
      void Promise.resolve().then(() => {
        if (!cancelled) runner.current(model.current.loaded ? 'refresh' : 'initial');
      });
    }
    return () => {
      cancelled = true;
      mounted.current = false;
      cancel();
    };
  }, [key, active]);

  const reset = () => {
    cancel();
    model.current = fresh(key);
    publish();
    // Events/focus can arrive together; run's pending guard coalesces them.
    void Promise.resolve().then(() => {
      if (enabled.current) runner.current('initial');
    });
  };
  return {
    ...(snapshot.generation === model.current.generation ? snapshot : model.current),
    loadMore: () => run('more'),
    retry: () => run(model.current.failed ?? 'initial'),
    refresh: () => run(model.current.loaded ? 'refresh' : 'initial'),
    reset,
  };
}
