import { recalculateInvestorAccruedFromRateHistory } from "@/lib/business-rate-accrual-recalc";

let running = false;
let queued = false;

async function runLoop() {
  if (running) {
    queued = true;
    return;
  }

  running = true;
  try {
    do {
      queued = false;
      try {
        await recalculateInvestorAccruedFromRateHistory();
      } catch (error) {
        console.error("Business-rate background recalc failed:", error);
      }
    } while (queued);
  } finally {
    running = false;
  }
}

export function scheduleBusinessRateRecalc() {
  queueMicrotask(() => {
    void runLoop();
  });
}

