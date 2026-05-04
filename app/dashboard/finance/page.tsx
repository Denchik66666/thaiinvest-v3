"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/hooks/useAuth";
import { Container } from "@/components/ui/Container";
import { Text } from "@/components/ui/Text";

/** Раньше здесь был кабинет финансов инвестора — объединён с `/dashboard`. */
export default function FinancePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (loading || !user) return;
    if (user.role === "INVESTOR") router.replace("/dashboard");
    else router.replace("/dashboard/manage");
  }, [loading, user, router]);

  return (
    <Container>
      <div className="flex min-h-[40vh] items-center justify-center py-16">
        <Text className="text-muted-foreground">Перенаправление…</Text>
      </div>
    </Container>
  );
}
