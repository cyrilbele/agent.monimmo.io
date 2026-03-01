export interface RentalProfitabilityResult {
  irrPct: number | null;
  reason: string | null;
  initialInvestment: number | null;
  annualNetCashflow: number | null;
  purchasePrice: number | null;
  notaryFeePct: number;
  notaryFeeAmount: number | null;
  annualPropertyTax: number;
  annualCoproFees: number;
  monthlyRent: number | null;
  holdingYears: number | null;
  resalePrice: number | null;
}

export interface RentalProfitabilityInput {
  purchasePrice: number | null;
  notaryFeePct: number;
  annualPropertyTax: number;
  annualCoproFees: number;
  monthlyRent: number | null;
  holdingYears: number | null;
  resalePrice: number | null;
}

const roundComparable = (value: number): number => Number(value.toFixed(2));

const computeIrr = (cashflows: number[]): number | null => {
  if (cashflows.length < 2) {
    return null;
  }

  const hasPositive = cashflows.some((value) => value > 0);
  const hasNegative = cashflows.some((value) => value < 0);
  if (!hasPositive || !hasNegative) {
    return null;
  }

  const npv = (rate: number): number => {
    if (rate <= -1) {
      return Number.NaN;
    }

    return cashflows.reduce((total, cashflow, yearIndex) => {
      return total + cashflow / (1 + rate) ** yearIndex;
    }, 0);
  };

  const minRate = -0.95;
  const maxRate = 10;
  const scanSteps = 400;
  let lowerRate: number | null = null;
  let upperRate: number | null = null;
  let previousRate = minRate;
  let previousNpv = npv(previousRate);
  if (!Number.isFinite(previousNpv)) {
    return null;
  }

  for (let step = 1; step <= scanSteps; step += 1) {
    const currentRate = minRate + ((maxRate - minRate) * step) / scanSteps;
    const currentNpv = npv(currentRate);
    if (!Number.isFinite(currentNpv)) {
      continue;
    }

    if (previousNpv === 0) {
      return previousRate;
    }

    if (currentNpv === 0) {
      return currentRate;
    }

    if (previousNpv * currentNpv < 0) {
      lowerRate = previousRate;
      upperRate = currentRate;
      break;
    }

    previousRate = currentRate;
    previousNpv = currentNpv;
  }

  if (lowerRate === null || upperRate === null) {
    return null;
  }

  let low = lowerRate;
  let high = upperRate;
  let npvLow = npv(low);
  if (!Number.isFinite(npvLow)) {
    return null;
  }

  for (let iteration = 0; iteration < 80; iteration += 1) {
    const mid = (low + high) / 2;
    const npvMid = npv(mid);
    if (!Number.isFinite(npvMid)) {
      return null;
    }

    if (Math.abs(npvMid) < 1e-7) {
      return mid;
    }

    if (npvLow * npvMid <= 0) {
      high = mid;
    } else {
      low = mid;
      npvLow = npvMid;
    }
  }

  return (low + high) / 2;
};

export const computeRentalProfitability = (
  input: RentalProfitabilityInput,
): RentalProfitabilityResult => {
  const {
    purchasePrice,
    notaryFeePct,
    annualPropertyTax,
    annualCoproFees,
    monthlyRent,
    holdingYears,
    resalePrice,
  } = input;
  const notaryFeeAmount =
    purchasePrice === null ? null : roundComparable((purchasePrice * notaryFeePct) / 100);

  if (purchasePrice === null) {
    return {
      irrPct: null,
      reason: "Prix d'achat indisponible sur ce bien.",
      initialInvestment: null,
      annualNetCashflow: null,
      purchasePrice,
      notaryFeePct,
      notaryFeeAmount,
      annualPropertyTax,
      annualCoproFees,
      monthlyRent,
      holdingYears,
      resalePrice,
    };
  }

  if (
    monthlyRent === null ||
    monthlyRent < 0 ||
    holdingYears === null ||
    holdingYears < 1 ||
    resalePrice === null ||
    resalePrice <= 0
  ) {
    return {
      irrPct: null,
      reason: "Renseignez loyer mensuel, duree de retention et prix de revente.",
      initialInvestment: null,
      annualNetCashflow: null,
      purchasePrice,
      notaryFeePct,
      notaryFeeAmount,
      annualPropertyTax,
      annualCoproFees,
      monthlyRent,
      holdingYears,
      resalePrice,
    };
  }

  const annualNetCashflow = monthlyRent * 12 - annualPropertyTax - annualCoproFees;
  const initialInvestment = purchasePrice + (notaryFeeAmount ?? 0);
  const cashflows: number[] = [-initialInvestment];

  for (let year = 1; year <= holdingYears; year += 1) {
    const yearlyCashflow = year === holdingYears ? annualNetCashflow + resalePrice : annualNetCashflow;
    cashflows.push(yearlyCashflow);
  }

  const irr = computeIrr(cashflows);
  return {
    irrPct: irr === null ? null : roundComparable(irr * 100),
    reason: irr === null ? "TRI non calculable avec ces flux." : null,
    initialInvestment: roundComparable(initialInvestment),
    annualNetCashflow: roundComparable(annualNetCashflow),
    purchasePrice,
    notaryFeePct,
    notaryFeeAmount,
    annualPropertyTax,
    annualCoproFees,
    monthlyRent,
    holdingYears,
    resalePrice,
  };
};
