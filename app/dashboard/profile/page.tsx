"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/hooks/useAuth";
import { Container } from "@/components/ui/Container";
import { Text } from "@/components/ui/Text";
import { ProfileDashboard } from "@/components/profile/ProfileDashboard";

export default function DashboardProfilePage() {
  const { user, loading, refresh } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <Container>
        <div className="thai-dashboard-root flex min-h-screen items-center justify-center py-12">
          <div className="thai-glass flex flex-col items-center gap-2 rounded-xl border border-border/35 px-6 py-4 shadow-lg backdrop-blur-md sm:rounded-2xl sm:px-8 sm:py-5">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent sm:h-9 sm:w-9" />
            <Text className="text-foreground">Загрузка…</Text>
          </div>
        </div>
      </Container>
    );
  }

  return <ProfileDashboard key={`${user.id}-${user.username}`} user={user} refresh={refresh} />;
}
