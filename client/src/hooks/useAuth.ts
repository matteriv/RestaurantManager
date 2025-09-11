import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    // Remove frequent refetching that was causing performance issues
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
  });

  // Debug logging removed to prevent console spam

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
  };
}
