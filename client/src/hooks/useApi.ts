import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function useMarketPrices() {
  return useQuery({
    queryKey: ["/api/market/prices"],
    refetchInterval: 15000,
    staleTime: 0,
  });
}

export function useMarketStatus() {
  return useQuery({
    queryKey: ["/api/market/status"],
    refetchInterval: 60000,
    staleTime: 30000,
  });
}

export function usePositions() {
  return useQuery({
    queryKey: ["/api/positions"],
    refetchInterval: 10000,
    staleTime: 0,
  });
}

export function usePositionHistory() {
  return useQuery({
    queryKey: ["/api/positions/history"],
    refetchInterval: 30000,
  });
}

export function useClosePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, closePrice, profit }: { id: string; closePrice: number; profit: number }) =>
      apiRequest("POST", `/api/positions/${id}/close`, { closePrice, profit }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/positions"] });
      qc.invalidateQueries({ queryKey: ["/api/positions/history"] });
    },
  });
}

export function useCreatePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/positions", data).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/positions"] }),
  });
}

export function usePendingSignal() {
  return useQuery({
    queryKey: ["/api/signals/pending"],
    refetchInterval: 8000,
    staleTime: 0,
  });
}

export function useRecentSignals() {
  return useQuery({
    queryKey: ["/api/signals"],
    refetchInterval: 15000,
  });
}

export function useGenerateSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (symbol?: string) =>
      apiRequest("POST", "/api/signals/generate", { symbol }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/signals/pending"] });
      qc.invalidateQueries({ queryKey: ["/api/signals"] });
    },
  });
}

export function useExecuteSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/signals/${id}/execute`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/signals/pending"] });
      qc.invalidateQueries({ queryKey: ["/api/positions"] });
    },
  });
}

export function useDismissSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/signals/${id}/dismiss`).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/signals/pending"] }),
  });
}

export function useActiveStrategy() {
  return useQuery({
    queryKey: ["/api/strategies/active"],
    refetchInterval: 30000,
  });
}

export function useStrategies() {
  return useQuery({ queryKey: ["/api/strategies"] });
}

export function useSaveStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/strategies", data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/strategies"] });
      qc.invalidateQueries({ queryKey: ["/api/strategies/active"] });
    },
  });
}

export function useSettings() {
  return useQuery({ queryKey: ["/api/settings"] });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/settings", data).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/settings"] }),
  });
}

// ── Notifications ─────────────────────────────────────────────────────────────

export function useNotifications() {
  return useQuery({
    queryKey: ["/api/notifications"],
    queryFn: () => apiRequest("GET", "/api/notifications").then(r => r.json()),
    refetchInterval: 15000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/notifications/${id}/read`).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/read-all").then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });
}

// ── Price Alerts ──────────────────────────────────────────────────────────────

export function useAlerts() {
  return useQuery<any[]>({
    queryKey: ["/api/alerts"],
    queryFn: () => apiRequest("GET", "/api/alerts").then(r => r.json()),
    refetchInterval: 15000,
  });
}

// ── Portfolio Risk ────────────────────────────────────────────────────────────

export function usePortfolioRisk() {
  return useQuery({
    queryKey: ["/api/portfolio/risk"],
    queryFn: () => apiRequest("GET", "/api/portfolio/risk").then(r => r.json()),
    refetchInterval: 10000,
    staleTime: 0,
  });
}

// ── Calendar ──────────────────────────────────────────────────────────────────

export function useCalendar() {
  return useQuery<any[]>({
    queryKey: ["/api/calendar"],
    queryFn: () => apiRequest("GET", "/api/calendar").then(r => r.json()),
    refetchInterval: 15 * 60 * 1000,
    staleTime: 10 * 60 * 1000,
  });
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export function useLeaderboard() {
  return useQuery<any[]>({
    queryKey: ["/api/leaderboard"],
    queryFn: () => apiRequest("GET", "/api/leaderboard").then(r => r.json()),
    refetchInterval: 60000,
  });
}
