import { describe, expect, it } from "vitest";

import { computeRentalProfitability } from "./property-detail-rental.utils";

describe("property-detail-rental.utils", () => {
  it("retourne une raison explicite si le prix d'achat est absent", () => {
    const result = computeRentalProfitability({
      purchasePrice: null,
      notaryFeePct: 8,
      annualPropertyTax: 1200,
      annualCoproFees: 600,
      monthlyRent: 1200,
      holdingYears: 10,
      resalePrice: 320000,
    });

    expect(result.irrPct).toBeNull();
    expect(result.reason).toBe("Prix d'achat indisponible sur ce bien.");
    expect(result.notaryFeeAmount).toBeNull();
  });

  it("retourne une raison explicite si les entrées locatives sont incomplètes", () => {
    const result = computeRentalProfitability({
      purchasePrice: 300000,
      notaryFeePct: 8,
      annualPropertyTax: 1200,
      annualCoproFees: 600,
      monthlyRent: null,
      holdingYears: null,
      resalePrice: null,
    });

    expect(result.irrPct).toBeNull();
    expect(result.reason).toBe("Renseignez loyer mensuel, duree de retention et prix de revente.");
    expect(result.notaryFeeAmount).toBe(24000);
  });

  it("calcule un TRI cohérent avec des flux standards", () => {
    const result = computeRentalProfitability({
      purchasePrice: 320000,
      notaryFeePct: 8,
      annualPropertyTax: 1200,
      annualCoproFees: 2400,
      monthlyRent: 1500,
      holdingYears: 10,
      resalePrice: 380000,
    });

    expect(result.reason).toBeNull();
    expect(result.notaryFeeAmount).toBe(25600);
    expect(result.initialInvestment).toBe(345600);
    expect(result.annualNetCashflow).toBe(14400);
    expect((result.irrPct ?? 0) > 0).toBe(true);
  });

  it("retourne un TRI non calculable si les flux n'ont pas de changement de signe", () => {
    const result = computeRentalProfitability({
      purchasePrice: 300000,
      notaryFeePct: 8,
      annualPropertyTax: 0,
      annualCoproFees: 0,
      monthlyRent: 0,
      holdingYears: 3,
      resalePrice: 0.5,
    });

    expect(result.irrPct).toBeNull();
    expect(result.reason).toBe("TRI non calculable avec ces flux.");
  });
});
