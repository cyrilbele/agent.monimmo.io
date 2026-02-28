import type {
  ComparablePointResponse,
  ComparablePricingPosition,
  ComparableRegressionResponse,
} from "../../core/api.models";

export interface ComparableRegressionInputPoint {
  surfaceM2: number;
  salePrice: number;
}

export interface ComparableChartPoint {
  cx: number;
  cy: number;
  surfaceM2: number;
  salePrice: number;
}

export interface ComparableChartLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ComparableChartModel {
  width: number;
  height: number;
  points: ComparableChartPoint[];
  regressionLine: ComparableChartLine | null;
  xDomain: {
    min: number;
    max: number;
  };
  yDomain: {
    min: number;
    max: number;
  };
}

const roundComparable = (value: number): number => Number(value.toFixed(2));

export const computeComparablesRegression = (
  rawPoints: ComparableRegressionInputPoint[],
): ComparableRegressionResponse => {
  const points = rawPoints.filter(
    (point) =>
      Number.isFinite(point.surfaceM2) &&
      Number.isFinite(point.salePrice) &&
      point.surfaceM2 > 0 &&
      point.salePrice > 0,
  );

  if (points.length < 2) {
    return {
      slope: null,
      intercept: null,
      r2: null,
      pointsUsed: points.length,
    };
  }

  const n = points.length;
  const sumX = points.reduce((sum, point) => sum + point.surfaceM2, 0);
  const sumY = points.reduce((sum, point) => sum + point.salePrice, 0);
  const sumXY = points.reduce((sum, point) => sum + point.surfaceM2 * point.salePrice, 0);
  const sumXX = points.reduce((sum, point) => sum + point.surfaceM2 * point.surfaceM2, 0);
  const denominator = n * sumXX - sumX * sumX;

  if (denominator === 0) {
    return {
      slope: null,
      intercept: null,
      r2: null,
      pointsUsed: points.length,
    };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  const meanY = sumY / n;
  const totalVariance = points.reduce((sum, point) => {
    const diff = point.salePrice - meanY;
    return sum + diff * diff;
  }, 0);

  const residualVariance = points.reduce((sum, point) => {
    const predicted = slope * point.surfaceM2 + intercept;
    const diff = point.salePrice - predicted;
    return sum + diff * diff;
  }, 0);

  const r2 = totalVariance === 0 ? 1 : 1 - residualVariance / totalVariance;

  return {
    slope: roundComparable(slope),
    intercept: roundComparable(intercept),
    r2: roundComparable(r2),
    pointsUsed: points.length,
  };
};

export const resolveComparablePricingLabel = (position: ComparablePricingPosition): string => {
  switch (position) {
    case "UNDER_PRICED":
      return "Sous le marche";
    case "OVER_PRICED":
      return "Au-dessus du marche";
    case "NORMAL":
      return "Dans la norme";
    default:
      return "Indetermine";
  }
};

export const buildComparableChartModel = (
  points: ComparablePointResponse[],
  regression: ComparableRegressionResponse,
): ComparableChartModel | null => {
  if (points.length === 0) {
    return null;
  }

  const width = 640;
  const height = 360;
  const padding = {
    left: 60,
    right: 16,
    top: 16,
    bottom: 42,
  };

  const xValues = points.map((point) => point.surfaceM2);
  const yValues = points.map((point) => point.salePrice);

  let minX = Math.min(...xValues);
  let maxX = Math.max(...xValues);
  let minY = Math.min(...yValues);
  let maxY = Math.max(...yValues);

  if (minX === maxX) {
    minX -= 1;
    maxX += 1;
  }

  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }

  const mapX = (value: number): number =>
    padding.left + ((value - minX) / (maxX - minX)) * (width - padding.left - padding.right);

  const mapY = (value: number): number =>
    height - padding.bottom - ((value - minY) / (maxY - minY)) * (height - padding.top - padding.bottom);

  const plottedPoints: ComparableChartPoint[] = points.map((point) => ({
    cx: roundComparable(mapX(point.surfaceM2)),
    cy: roundComparable(mapY(point.salePrice)),
    surfaceM2: point.surfaceM2,
    salePrice: point.salePrice,
  }));

  let regressionLine: ComparableChartLine | null = null;

  if (
    typeof regression.slope === "number" &&
    Number.isFinite(regression.slope) &&
    typeof regression.intercept === "number" &&
    Number.isFinite(regression.intercept)
  ) {
    const yAtMin = regression.slope * minX + regression.intercept;
    const yAtMax = regression.slope * maxX + regression.intercept;

    regressionLine = {
      x1: roundComparable(mapX(minX)),
      y1: roundComparable(mapY(yAtMin)),
      x2: roundComparable(mapX(maxX)),
      y2: roundComparable(mapY(yAtMax)),
    };
  }

  return {
    width,
    height,
    points: plottedPoints,
    regressionLine,
    xDomain: {
      min: roundComparable(minX),
      max: roundComparable(maxX),
    },
    yDomain: {
      min: roundComparable(minY),
      max: roundComparable(maxY),
    },
  };
};
