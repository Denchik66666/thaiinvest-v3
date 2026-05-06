"use client";

import { Suspense } from "react";

import { Container } from "@/components/ui/Container";
import { Text } from "@/components/ui/Text";
import { FinanceHubInner } from "@/components/dashboard/finance/FinanceHubInner";

export default function DashboardFinancePage() {
  return (
    <Suspense
      fallback={
        <Container>
          <div className="thai-dashboard-root flex min-h-[40vh] items-center justify-center py-8">
            <div className="thai-glass flex flex-col items-center gap-3 rounded-2xl px-8 py-6">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <Text className="text-sm text-muted-foreground">Загрузка…</Text>
            </div>
          </div>
        </Container>
      }
    >
      <FinanceHubInner />
    </Suspense>
  );
}
