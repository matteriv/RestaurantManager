import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    refetchInterval: 1000, // Check auth status every second
    refetchIntervalInBackground: true,
  });

  // Debug logging in development
  if (import.meta.env.DEV) {
    console.log('🔒 useAuth status:', { user, isLoading, error, isAuthenticated: !!user });
  }

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
  };
}
